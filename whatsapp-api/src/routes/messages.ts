import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../errors/AppError.js';
import { insertMessage, upsertContact, upsertConversation } from '../repository.js';
import { markAsRead, sendTemplate, sendText, type SendResult } from '../services/meta.js';
import { normalizePhone } from '../utils/phone.js';

export const messagesRouter = Router();

const textSchema = z.object({
  to: z.string().min(1),
  body: z.string().min(1).max(4096),
  previewUrl: z.boolean().default(false)
});

const templateSchema = z.object({
  to: z.string().min(1),
  templateName: z.string().min(1),
  languageCode: z.string().min(2).default('es_AR'),
  components: z.array(z.unknown()).optional()
});

const markReadSchema = z.object({
  messageId: z.string().min(1)
});

async function persistOutbound(params: {
  to: string;
  type: string;
  text: string | null;
  request: unknown;
  result?: SendResult;
  error?: AppError;
}): Promise<string | null> {
  const contact = await upsertContact(params.to, null);
  const conversation = await upsertConversation(contact.id);
  const wamid = params.result?.messages?.[0]?.id ?? null;
  const metaCode = params.error?.details?.metaCode;

  await insertMessage({
    wamid,
    conversationId: conversation.id,
    direction: 'OUTBOUND',
    type: params.type,
    text: params.text,
    status: params.error ? 'FAILED' : 'PENDING',
    errorCode: metaCode !== undefined && metaCode !== null ? String(metaCode) : null,
    errorMessage: params.error?.message ?? null,
    raw: {
      request: params.request,
      response: params.error
        ? { error: params.error.message, ...(params.error.details ?? {}) }
        : (params.result ?? null)
    }
  });

  return wamid;
}

messagesRouter.post('/text', async (req, res) => {
  const { to, body, previewUrl } = textSchema.parse(req.body);
  const destino = normalizePhone(to);
  const solicitud = { to: destino, type: 'text', body, previewUrl };

  try {
    const result = await sendText(destino, body, previewUrl);
    const wamid = await persistOutbound({
      to: destino,
      type: 'text',
      text: body,
      request: solicitud,
      result
    });
    res.status(201).json({ wamid, to: destino, status: 'PENDING' });
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 502) {
      await persistOutbound({ to: destino, type: 'text', text: body, request: solicitud, error });
    }
    throw error;
  }
});

messagesRouter.post('/template', async (req, res) => {
  const { to, templateName, languageCode, components } = templateSchema.parse(req.body);
  const destino = normalizePhone(to);
  const solicitud = { to: destino, type: 'template', templateName, languageCode, components };

  try {
    const result = await sendTemplate(destino, templateName, languageCode, components);
    const wamid = await persistOutbound({
      to: destino,
      type: 'template',
      text: `plantilla:${templateName}`,
      request: solicitud,
      result
    });
    res.status(201).json({ wamid, to: destino, templateName, status: 'PENDING' });
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 502) {
      await persistOutbound({
        to: destino,
        type: 'template',
        text: `plantilla:${templateName}`,
        request: solicitud,
        error
      });
    }
    throw error;
  }
});

messagesRouter.post('/mark-read', async (req, res) => {
  const { messageId } = markReadSchema.parse(req.body);
  await markAsRead(messageId);
  res.json({ ok: true, messageId });
});
