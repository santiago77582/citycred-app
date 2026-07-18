import { AppError } from '../errors/AppError.js';
import {
  insertMessage,
  upsertContact,
  upsertConversation,
  type Status
} from '../repository.js';
import { normalizePhone } from '../utils/phone.js';
import {
  sendAdvancedMessage,
  type AdvancedMessageResult
} from './metaAdvanced.js';

export type AdvancedSendOutcome = {
  statusCode: 201 | 202;
  payload: {
    messageId: string | null;
    wamid: string | null;
    to: string;
    type: string;
    status: Extract<Status, 'UNKNOWN' | 'PENDING'>;
    retrySafe?: false;
    warning?: string;
  };
};

type Persisted = {
  messageId: string | null;
  wamid: string | null;
  status: Extract<Status, 'UNKNOWN' | 'PENDING' | 'FAILED'>;
};

function isMetaTransportFailure(error: unknown): error is AppError {
  return error instanceof AppError && (error.statusCode === 502 || error.statusCode === 504);
}

async function persist(params: {
  to: string;
  type: string;
  text: string | null;
  request: Record<string, unknown>;
  result?: AdvancedMessageResult;
  error?: AppError;
}): Promise<Persisted> {
  const contact = await upsertContact(params.to, null);
  const conversation = await upsertConversation(contact.id);
  const wamid = params.result?.messages?.[0]?.id ?? null;
  const deliveryUnknown = params.error?.details?.deliveryUnknown === true;
  const status: Persisted['status'] = params.error
    ? (deliveryUnknown ? 'UNKNOWN' : 'FAILED')
    : (wamid ? 'PENDING' : 'UNKNOWN');

  const messageId = await insertMessage({
    wamid,
    conversationId: conversation.id,
    direction: 'OUTBOUND',
    type: params.type,
    text: params.text,
    status,
    errorCode: params.error?.details?.metaCode !== undefined
      ? String(params.error.details.metaCode)
      : null,
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

export async function sendAdvancedAndPersist(params: {
  to: string;
  type: string;
  text: string | null;
  message: Record<string, unknown>;
}): Promise<AdvancedSendOutcome> {
  const to = normalizePhone(params.to);
  const request = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    ...params.message
  };

  try {
    const result = await sendAdvancedMessage(request);
    const persisted = await persist({
      to,
      type: params.type,
      text: params.text,
      request,
      result
    });
    return {
      statusCode: 201,
      payload: {
        messageId: persisted.messageId,
        wamid: persisted.wamid,
        to,
        type: params.type,
        status: persisted.status === 'UNKNOWN' ? 'UNKNOWN' : 'PENDING'
      }
    };
  } catch (error) {
    if (isMetaTransportFailure(error)) {
      const persisted = await persist({
        to,
        type: params.type,
        text: params.text,
        request,
        error
      });
      if (persisted.status === 'UNKNOWN') {
        return {
          statusCode: 202,
          payload: {
            messageId: persisted.messageId,
            wamid: null,
            to,
            type: params.type,
            status: 'UNKNOWN',
            retrySafe: false,
            warning:
              'No se pudo confirmar si Meta aceptó el mensaje. No lo reintentes automáticamente porque podría duplicarse.'
          }
        };
      }
    }
    throw error;
  }
}
