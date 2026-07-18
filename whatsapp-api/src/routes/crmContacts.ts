import { Router } from 'express';
import { z } from 'zod';
import { assignConversation } from '../crm/assignmentRepository.js';
import {
  getCrmContactByWaId,
  listCrmContacts,
  updateCrmContact
} from '../crm/contactRepository.js';
import {
  listContactLabels,
  setContactLabel
} from '../crm/catalogRepository.js';
import { requirePanelRole } from '../middleware/adminSession.js';
import { normalizePhone } from '../utils/phone.js';

export const crmContactsRouter = Router();

const statusSchema = z.enum([
  'NEW', 'PENDING', 'INTERESTED', 'DOCUMENTATION_PENDING',
  'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'FINALIZED', 'DO_NOT_CONTACT'
]);
const consentSchema = z.enum(['UNKNOWN', 'GRANTED', 'REVOKED']);

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  search: z.string().trim().min(1).max(100).optional(),
  status: statusSchema.optional(),
  entity: z.string().trim().min(1).max(100).optional()
});

const patchSchema = z.object({
  profileName: z.string().trim().max(150).nullable().optional(),
  entity: z.string().trim().max(100).nullable().optional(),
  documentNumber: z.string().trim().max(30).nullable().optional(),
  seniorityRange: z.string().trim().max(50).nullable().optional(),
  availableQuota: z.number().min(0).max(1_000_000_000).nullable().optional(),
  commercialStatus: statusSchema.optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
  consentStatus: consentSchema.optional()
}).refine((value) => Object.keys(value).length > 0, 'No hay cambios para guardar.');

const assignmentSchema = z.object({
  userId: z.string().uuid().nullable(),
  source: z.enum(['MANUAL', 'AUTOMATIC', 'TRANSFER']).default('MANUAL')
});
const labelSchema = z.object({ labelId: z.string().uuid() });

crmContactsRouter.get('/', async (req, res) => {
  const query = querySchema.parse(req.query);
  res.json({ contacts: await listCrmContacts(query) });
});

crmContactsRouter.get('/:waId', async (req, res) => {
  const waId = normalizePhone(String(req.params.waId));
  const contact = await getCrmContactByWaId(waId);
  const labels = await listContactLabels(waId);
  res.json({ contact, labels });
});

crmContactsRouter.patch('/:waId', async (req, res) => {
  const waId = normalizePhone(String(req.params.waId));
  const patch = patchSchema.parse(req.body);
  const contact = await updateCrmContact(
    waId,
    patch,
    req.adminUser?.userId ?? undefined
  );
  res.json({ contact });
});

crmContactsRouter.put(
  '/:waId/assignment',
  requirePanelRole('ADMIN', 'SUPERVISOR'),
  async (req, res) => {
    const waId = normalizePhone(String(req.params.waId));
    const input = assignmentSchema.parse(req.body);
    const conversation = await assignConversation({
      waId,
      userId: input.userId,
      source: input.source,
      actorUserId: req.adminUser?.userId ?? undefined
    });
    res.json({ conversation });
  }
);

crmContactsRouter.get('/:waId/labels', async (req, res) => {
  const waId = normalizePhone(String(req.params.waId));
  res.json({ labels: await listContactLabels(waId) });
});

crmContactsRouter.put('/:waId/labels/:labelId', async (req, res) => {
  const waId = normalizePhone(String(req.params.waId));
  const { labelId } = labelSchema.parse(req.params);
  await setContactLabel({
    waId,
    labelId,
    assigned: true,
    actorUserId: req.adminUser?.userId ?? undefined
  });
  res.status(204).end();
});

crmContactsRouter.delete('/:waId/labels/:labelId', async (req, res) => {
  const waId = normalizePhone(String(req.params.waId));
  const { labelId } = labelSchema.parse(req.params);
  await setContactLabel({
    waId,
    labelId,
    assigned: false,
    actorUserId: req.adminUser?.userId ?? undefined
  });
  res.status(204).end();
});
