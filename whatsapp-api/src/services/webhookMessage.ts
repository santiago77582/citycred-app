export type IncomingMedia = {
  mediaId: string | null;
  mediaType: 'IMAGE' | 'AUDIO' | 'VOICE' | 'VIDEO' | 'DOCUMENT' | 'STICKER' | 'OTHER';
  mimeType: string | null;
  filename: string | null;
  caption: string | null;
};

export function messageText(message: Record<string, unknown>): string | null {
  const type = String(message.type ?? 'unknown');
  if (type === 'text') return String((message.text as { body?: unknown } | undefined)?.body ?? '');
  if (type === 'button') return String((message.button as { text?: unknown } | undefined)?.text ?? '');
  if (type === 'image' || type === 'video' || type === 'document') {
    const media = message[type] as { caption?: unknown; filename?: unknown } | undefined;
    return String(media?.caption ?? media?.filename ?? '');
  }
  if (type === 'audio') return '[Audio]';
  if (type === 'sticker') return '[Sticker]';
  return null;
}

export function mapStatus(status: string) {
  if (status === 'sent') return 'SENT' as const;
  if (status === 'delivered') return 'DELIVERED' as const;
  if (status === 'read') return 'READ' as const;
  if (status === 'failed') return 'FAILED' as const;
  return 'PENDING' as const;
}

export function attachmentFrom(message: Record<string, unknown>): IncomingMedia | null {
  const type = String(message.type ?? '');
  if (!['image', 'audio', 'video', 'document', 'sticker'].includes(type)) return null;
  const media = message[type] as Record<string, unknown> | undefined;
  if (!media) return null;
  const mediaType = type === 'audio' && media.voice === true
    ? 'VOICE'
    : type.toUpperCase() as IncomingMedia['mediaType'];
  return {
    mediaId: typeof media.id === 'string' ? media.id : null,
    mediaType,
    mimeType: typeof media.mime_type === 'string' ? media.mime_type : null,
    filename: typeof media.filename === 'string' ? media.filename : null,
    caption: typeof media.caption === 'string' ? media.caption : null
  };
}
