import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import {
  commitContactImport,
  getContactImportBatch,
  listContactImportRows,
  previewContactImport
} from '../contactImportRepository.js';
import { MAX_CONTACT_IMPORT_BYTES } from '../contactImportParser.js';
import { AppError } from '../errors/AppError.js';

export const contactImportsRouter = Router();

const idSchema = z.object({ batchId: z.string().uuid() });
const filenameSchema = z.string().trim().min(5).max(255)
  .regex(/\.(csv|xlsx)$/i)
  .refine((value) => !/[\\/\0]/.test(value), 'Nombre de archivo inválido');
const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100)
});
const commitSchema = z.object({ confirmation: z.literal('IMPORTAR') }).strict();

const importLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Demasiadas importaciones. Esperá un minuto.' }
});

function actorUserId(req: express.Request): string {
  if (!req.adminUser || req.adminUser.emergency || !req.adminUser.userId) {
    throw new AppError('La importación exige una sesión individual del panel.', 403);
  }
  return req.adminUser.userId;
}

contactImportsRouter.post(
  '/preview',
  importLimiter,
  express.raw({
    type: [
      'text/csv',
      'application/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream'
    ],
    limit: MAX_CONTACT_IMPORT_BYTES
  }),
  async (req, res) => {
    const encodedFilename = String(req.header('x-file-name') ?? '');
    let decodedFilename = encodedFilename;
    try { decodedFilename = decodeURIComponent(encodedFilename); } catch { /* Zod lo rechazará. */ }
    const filename = filenameSchema.parse(decodedFilename);
    if (!Buffer.isBuffer(req.body)) {
      throw new AppError('El cuerpo debe contener el archivo CSV o XLSX.', 400);
    }
    const preview = await previewContactImport({
      bytes: req.body,
      filename,
      actorUserId: actorUserId(req)
    });
    res.status(201).json(preview);
  }
);

contactImportsRouter.get('/:batchId', async (req, res) => {
  actorUserId(req);
  const { batchId } = idSchema.parse(req.params);
  const { limit } = querySchema.parse(req.query);
  res.json({
    batch: await getContactImportBatch(batchId),
    rows: await listContactImportRows(batchId, limit)
  });
});

contactImportsRouter.post('/:batchId/commit', importLimiter, async (req, res) => {
  const actor = actorUserId(req);
  const { batchId } = idSchema.parse(req.params);
  commitSchema.parse(req.body);
  const batch = await commitContactImport(batchId, actor);
  res.json({ batch });
});
