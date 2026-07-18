import { AppError } from '../errors/AppError.js';
import { insertMessageAttachment } from '../platformRepository.js';
import {
  insertMessage,
  upsertContact,
  upsertConversation,
  type Status
} from '../repository.js';
import { normalizePhone } from '../utils/phone.js';
import {
  sendMetaMediaMessage,
  uploadMetaMedia,
  type OutboundMediaSpec
} from './metaMedia.js';

export type MediaSendOutcome = {
  statusCode: 201 | 202;
  payload: {
    messageId: string | null;
    wamid: string | null;
    mediaId: string;
    mediaType: OutboundMediaSpec['kind'];
    to: string;
    status: Extract<Status, 'UNKNOWN' | 'PENDING'>;
    retrySafe?: false;
    warning?: string;
  };
};

type PersistedMedia = {
  messageId: string | null;
  wamid: string | null;
  status: Extract<Status, 'UNKNOWN' | 'PENDING' | 'FAILED'>;
};

function isMetaTransportFailure(error: unknown): error is AppError {
  return error instanceof AppError && (error.statusCode === 502 || error.statusCode === 504);
}

async function persistMediaMessage(params: {
  to: string;
  spec: OutboundMediaSpec;
  mediaId: string;
  filename: string;
  caption: string | null;
  sizeBytes: number;
  result?: Awaited<ReturnType<typeof sendMetaMediaMessage>>;
  error?: AppError;
}): Promise<PersistedMedia> {
  const contact = await upsertContact(params.to, null);
  const conversation = await upsertConversation(contact.id);
  const wamid = params.result?.messages?.[0]?.id ?? null;
  const deliveryUnknown = params.error?.details?.deliveryUnknown === true;
  const status: PersistedMedia['status'] = params.error
    ? (deliveryUnknown ? 'UNKNOWN' : 'FAILED')
    : (wamid ? 'PENDING' : 'UNKNOWN');

  const messageId = await insertMessage({
    wamid,
    conversationId: conversation.id,
    direction: 'OUTBOUND',
    type: params.spec.kind,
    text: params.caption || params.filename,
    status,
    errorCode: params.error?.details?.metaCode !== undefined
      ? String(params.error.details.metaCode)
      : null,
    errorMessage: params.error?.message ?? null,
    raw: {
      request: {
        to: params.to,
        type: params.spec.kind,
        mediaId: params.mediaId,
        filename: params.filename,
        caption: params.caption,
        mimeType: params.spec.mimeType,
        sizeBytes: params.sizeBytes
      },
      response: params.error
        ? { error: params.error.message, ...(params.error.details ?? {}) }
        : (params.result ?? null)
    }
  });

  if (messageId) {
    await insertMessageAttachment({
      messageId,
      mediaId: params.mediaId,
      mediaType: params.spec.attachmentType,
      mimeType: params.spec.mimeType,
      filename: params.filename,
      caption: params.caption
    });
  }

  return { messageId, wamid, status };
}

export async function sendMediaFileAndPersist(params: {
  to: string;
  filePath: string;
  filename: string;
  caption?: string | null;
  sizeBytes: number;
  spec: OutboundMediaSpec;
}): Promise<MediaSendOutcome> {
  const to = normalizePhone(params.to);
  const caption = params.spec.allowsCaption
    ? (params.caption?.trim().slice(0, 1024) || null)
    : null;
  const upload = await uploadMetaMedia({
    filePath: params.filePath,
    mimeType: params.spec.mimeType,
    filename: params.filename
  });

  try {
    const result = await sendMetaMediaMessage({
      to,
      kind: params.spec.kind,
      mediaId: upload.id,
      caption,
      filename: params.spec.kind === 'document' ? params.filename : null
    });
    const persisted = await persistMediaMessage({
      to,
      spec: params.spec,
      mediaId: upload.id,
      filename: params.filename,
      caption,
      sizeBytes: params.sizeBytes,
      result
    });
    return {
      statusCode: 201,
      payload: {
        messageId: persisted.messageId,
        wamid: persisted.wamid,
        mediaId: upload.id,
        mediaType: params.spec.kind,
        to,
        status: persisted.status === 'UNKNOWN' ? 'UNKNOWN' : 'PENDING'
      }
    };
  } catch (error) {
    if (isMetaTransportFailure(error)) {
      const persisted = await persistMediaMessage({
        to,
        spec: params.spec,
        mediaId: upload.id,
        filename: params.filename,
        caption,
        sizeBytes: params.sizeBytes,
        error
      });
      if (persisted.status === 'UNKNOWN') {
        return {
          statusCode: 202,
          payload: {
            messageId: persisted.messageId,
            wamid: null,
            mediaId: upload.id,
            mediaType: params.spec.kind,
            to,
            status: 'UNKNOWN',
            retrySafe: false,
            warning:
              'No se pudo confirmar si Meta aceptó el archivo. No lo reintentes automáticamente porque podría duplicarse.'
          }
        };
      }
    }
    throw error;
  }
}
