import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { listBackupRuns } from '../backupService.js';
import {
  acknowledgeOperationalAlert,
  getOperationalOverview,
  listOperationalAlerts,
  listOperationalRuns,
  resolveOperationalAlert,
  runOperationalChecks
} from '../operationsRepository.js';

export const operationsRouter = Router();

const listRunsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20)
});
const listAlertsSchema = z.object({
  includeResolved: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(500).default(100)
});
const alertIdSchema = z.object({ alertId: z.string().uuid() });

const checkLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Esperá un minuto antes de ejecutar otra verificación.' }
});

operationsRouter.get('/overview', async (_req, res) => {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.json(await getOperationalOverview());
});

operationsRouter.get('/runs', async (req, res) => {
  const { limit } = listRunsSchema.parse(req.query);
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.json({ runs: await listOperationalRuns(limit) });
});

operationsRouter.get('/alerts', async (req, res) => {
  const query = listAlertsSchema.parse(req.query);
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.json({
    alerts: await listOperationalAlerts({
      includeResolved: query.includeResolved,
      limit: query.limit
    })
  });
});

operationsRouter.get('/backups', async (req, res) => {
  const { limit } = listRunsSchema.parse(req.query);
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.json({ backups: await listBackupRuns(limit) });
});

operationsRouter.post('/check', checkLimiter, async (_req, res) => {
  const run = await runOperationalChecks('MANUAL');
  res.status(201).json({ run });
});

operationsRouter.post('/alerts/:alertId/acknowledge', async (req, res) => {
  const { alertId } = alertIdSchema.parse(req.params);
  res.json({ alert: await acknowledgeOperationalAlert(alertId) });
});

operationsRouter.post('/alerts/:alertId/resolve', async (req, res) => {
  const { alertId } = alertIdSchema.parse(req.params);
  res.json({ alert: await resolveOperationalAlert(alertId) });
});
