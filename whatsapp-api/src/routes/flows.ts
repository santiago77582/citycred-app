import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { sendAdvancedAndPersist } from '../services/outboundAdvanced.js';
import {
  FLOW_CATEGORIES,
  createMetaFlow,
  deleteMetaFlow,
  deprecateMetaFlow,
  getMetaFlow,
  listMetaFlows,
  publishMetaFlow,
  updateMetaFlowMetadata,
  uploadMetaFlowJson
} from '../services/metaFlows.js';

export const flowsRouter = Router();

const flowIdSchema = z.object({ flowId: z.string().trim().min(1).max(200) });
const categorySchema = z.enum(FLOW_CATEGORIES);
const httpUrl = z.url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === 'https:';
}, 'El endpoint del Flow debe usar HTTPS.');

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  categories: z.array(categorySchema).min(1).max(8),
  cloneFlowId: z.string().trim().min(1).max(200).nullable().optional(),
  endpointUri: httpUrl.nullable().optional()
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  categories: z.array(categorySchema).min(1).max(8).optional(),
  endpointUri: httpUrl.nullable().optional()
}).refine((value) => Object.keys(value).length > 0, {
  message: 'No hay cambios para guardar.'
});

const flowJsonSchema = z.object({
  flowJson: z.record(z.string(), z.unknown())
});

const irreversibleSchema = z.object({
  confirm: z.literal(true)
});

const sendFlowSchema = z.object({
  to: z.string().min(1).max(40),
  flowId: z.string().trim().min(1).max(200),
  flowToken: z.string().trim().min(1).max(500).default(() => randomUUID()),
  cta: z.string().trim().min(1).max(30),
  body: z.string().trim().min(1).max(1024),
  header: z.string().trim().min(1).max(60).optional(),
  footer: z.string().trim().min(1).max(60).optional(),
  screen: z.string().trim().min(1).max(200).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  mode: z.enum(['published', 'draft']).default('published'),
  replyToMessageId: z.string().trim().min(1).max(500).optional()
});

type SendFlowInput = z.infer<typeof sendFlowSchema>;

export function buildFlowMessage(input: SendFlowInput): Record<string, unknown> {
  return {
    type: 'interactive',
    interactive: {
      type: 'flow',
      ...(input.header ? { header: { type: 'text', text: input.header } } : {}),
      body: { text: input.body },
      ...(input.footer ? { footer: { text: input.footer } } : {}),
      action: {
        name: 'flow',
        parameters: {
          flow_message_version: '3',
          flow_action: 'navigate',
          flow_token: input.flowToken,
          flow_id: input.flowId,
          flow_cta: input.cta,
          ...(input.mode === 'draft' ? { mode: 'draft' } : {}),
          ...(input.screen || input.data ? {
            flow_action_payload: {
              ...(input.screen ? { screen: input.screen } : {}),
              ...(input.data ? { data: input.data } : {})
            }
          } : {})
        }
      }
    },
    ...(input.replyToMessageId
      ? { context: { message_id: input.replyToMessageId } }
      : {})
  };
}

const limiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Demasiadas operaciones de WhatsApp Flows. Esperá un minuto.' }
});

flowsRouter.use(limiter);

flowsRouter.get('/', async (_req, res) => {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.json({ flows: await listMetaFlows() });
});

flowsRouter.post('/', async (req, res) => {
  const input = createSchema.parse(req.body);
  res.status(201).json({ flow: await createMetaFlow(input) });
});

flowsRouter.get('/:flowId', async (req, res) => {
  const { flowId } = flowIdSchema.parse(req.params);
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.json({ flow: await getMetaFlow(flowId) });
});

flowsRouter.patch('/:flowId', async (req, res) => {
  const { flowId } = flowIdSchema.parse(req.params);
  const input = updateSchema.parse(req.body);
  res.json({ result: await updateMetaFlowMetadata(flowId, input) });
});

flowsRouter.put('/:flowId/json', async (req, res) => {
  const { flowId } = flowIdSchema.parse(req.params);
  const { flowJson } = flowJsonSchema.parse(req.body);
  res.json({ result: await uploadMetaFlowJson(flowId, flowJson) });
});

flowsRouter.post('/:flowId/publish', async (req, res) => {
  const { flowId } = flowIdSchema.parse(req.params);
  irreversibleSchema.parse(req.body);
  res.json({ result: await publishMetaFlow(flowId) });
});

flowsRouter.post('/:flowId/deprecate', async (req, res) => {
  const { flowId } = flowIdSchema.parse(req.params);
  irreversibleSchema.parse(req.body);
  res.json({ result: await deprecateMetaFlow(flowId) });
});

flowsRouter.delete('/:flowId', async (req, res) => {
  const { flowId } = flowIdSchema.parse(req.params);
  irreversibleSchema.parse(req.body);
  res.json({ result: await deleteMetaFlow(flowId) });
});

flowsRouter.post('/send/message', async (req, res) => {
  const input = sendFlowSchema.parse(req.body);
  const outcome = await sendAdvancedAndPersist({
    to: input.to,
    type: 'flow',
    text: input.body,
    message: buildFlowMessage(input)
  });
  res.status(outcome.statusCode).json({
    ...outcome.payload,
    flowId: input.flowId,
    flowToken: input.flowToken
  });
});
