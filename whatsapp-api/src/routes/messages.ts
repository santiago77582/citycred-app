import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../errors/AppError.js';
import {
  insertMessage,
  upsertContact,
  upsertConversation,
  type Status
} from '../repository.js';
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
  templateName: z.string().min(1).max(512),
  languageCode: z.string().min(2).max(35).default('es_AR'),
  components: z.array(z.unknown()).max(20).optional()
});

const markReadSchema = z.object({
  messageId: z.string().min(1)
});

type PersistedOutbound = {
  messageId: string | null;
  wamid: string | null;
  status: Extract<Status, 'UNKNOWN' | 'PENDING' | 'FAILED'>;
};

type CommonSendPayload = {
  messageId: string | null;
  wamid: string | null;
  to: string;
  status: Extract<Status, 'UNKNOWN' | 'PENDING'>;
  retrySafe?: false;
  warning?: string;
};

export type TextSendOutcome = {
  statusCode: 201 | 202;
  payload: CommonSendPayload;
};

export type TemplateSendOutcome = {
  statusCode: 201 | 202;
  payload: CommonSendPayload & {
    templateName: string;
    languageCode: string;
  };
};

async function persistOutbound(params: {
  to: string;
  type: string;
  text: string | null;
  request: unknown;
  result?: SendResult;
  error?: AppError;
}): Promise<PersistedOutbound> {
  const contact = await upsertContact(params.to, null);
  const conversation = await upsertConversation(contact.id);
  const wamid = params.result?.messages?.[0]?.id ?? null;
  const metaCode = params.error?.details?.metaCode;
  const deliveryUnknown = params.error?.details?.deliveryUnknown === true;
  const status: PersistedOutbound['status'] = params.error
    ? (deliveryUnknown ? 'UNKNOWN' : 'FAILED')
    : (wamid ? 'PENDING' : 'UNKNOWN');

  const messageId = await insertMessage({
    wamid,
    conversationId: conversation.id,
    direction: 'OUTBOUND',
    type: params.type,
    text: params.text,
    status,
    errorCode: metaCode !== undefined && metaCode !== null ? String(metaCode) : null,
    errorMessage: params.error?.message ?? null,
    raw: {
      request: params.request,
      response: params.error
        ? { error: params.error.message, ...(params.error.details ?? {}) }
        : (params.result ?? null)
    }
  });

  return { messageId, wamid, status };
}

function shouldPersistMetaFailure(error: unknown): error is AppError {
  return error instanceof AppError && (error.statusCode === 502 || error.statusCode === 504);
}

function unknownResponse(persisted: PersistedOutbound, extra: Record<string, unknown>) {
  return {
    ...extra,
    messageId: persisted.messageId,
    wamid: null,
    status: 'UNKNOWN' as const,
    retrySafe: false as const,
    warning:
      'No se pudo confirmar si Meta aceptó el envío. No lo reintentes automáticamente porque podría duplicarse.'
  };
}

function validateComponentsSize(components: unknown[] | undefined): void {
  if (!components) return;
  const bytes = Buffer.byteLength(JSON.stringify(components), 'utf8');
  if (bytes > 64 * 1024) {
    throw new AppError('Los datos variables de la plantilla son demasiado grandes.', 413);
  }
}

export async function sendTextAndPersist(input: {
  to: string;
  body: string;
  previewUrl?: boolean;
}): Promise<TextSendOutcome> {
  const destino = normalizePhone(input.to);
  const previewUrl = input.previewUrl ?? false;
  const solicitud = { to: destino, type: 'text', body: input.body, previewUrl };

  try {
    const result = await sendText(destino, input.body, previewUrl);
    const persisted = await persistOutbound({
      to: destino,
      type: 'text',
      text: input.body,
      request: solicitud,
      result
    });
    return {
      statusCode: 201,
      payload: {
        messageId: persisted.messageId,
        wamid: persisted.wamid,
        to: destino,
        status: persisted.status === 'UNKNOWN' ? 'UNKNOWN' : 'PENDING'
      }
    };
  } catch (error) {
    if (shouldPersistMetaFailure(error)) {
      const persisted = await persistOutbound({
        to: destino,
        type: 'text',
        text: input.body,
        request: solicitud,
        error
      });
      if (persisted.status === 'UNKNOWN') {
        return {
          statusCode: 202,
          payload: unknownResponse(persisted, { to: destino }) as TextSendOutcome['payload']
        };
      }
    }
    throw error;
  }
}

export async function sendTemplateAndPersist(input: {
  to: string;
  templateName: string;
  languageCode: string;
  components?: unknown[];
}): Promise<TemplateSendOutcome> {
  validateComponentsSize(input.components);
  const destino = normalizePhone(input.to);
  const solicitud = {
    to: destino,
    type: 'template',
    templateName: input.templateName,
    languageCode: input.languageCode,
    components: input.components
  };

  try {
    const result = await sendTemplate(
      destino,
      input.templateName,
      input.languageCode,
      input.components
    );
    const persisted = await persistOutbound({
      to: destino,
      type: 'template',
      text: `plantilla:${input.templateName}`,
      request: solicitud,
      result
    });
    return {
      statusCode: 201,
      payload: {
        messageId: persisted.messageId,
        wamid: persisted.wamid,
        to: destino,
        templateName: input.templateName,
        languageCode: input.languageCode,
        status: persisted.status === 'UNKNOWN' ? 'UNKNOWN' : 'PENDING'
      }
    };
  } catch (error) {
    if (shouldPersistMetaFailure(error)) {
      const persisted = await persistOutbound({
        to: destino,
        type: 'template',
        text: `plantilla:${input.templateName}`,
        request: solicitud,
        error
      });
      if (persisted.status === 'UNKNOWN') {
        return {
          statusCode: 202,
          payload: unknownResponse(persisted, {
            to: destino,
            templateName: input.templateName,
            languageCode: input.languageCode
          }) as TemplateSendOutcome['payload']
        };
      }
    }
    throw error;
  }
}

messagesRouter.post('/text', async (req, res) => {
  const input = textSchema.parse(req.body);
  const outcome = await sendTextAndPersist(input);
  res.status(outcome.statusCode).json(outcome.payload);
});

messagesRouter.post('/template', async (req, res) => {
  const input = templateSchema.parse(req.body);
  const outcome = await sendTemplateAndPersist(input);
  res.status(outcome.statusCode).json(outcome.payload);
});

messagesRouter.post('/mark-read', async (req, res) => {
  const { messageId } = markReadSchema.parse(req.body);
  await markAsRead(messageId);
  res.json({ ok: true, messageId });
});
