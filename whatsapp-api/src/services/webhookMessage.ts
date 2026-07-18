export type IncomingMedia = {
  mediaId: string | null;
  mediaType: 'IMAGE' | 'AUDIO' | 'VOICE' | 'VIDEO' | 'DOCUMENT' | 'STICKER' | 'OTHER';
  mimeType: string | null;
  filename: string | null;
  caption: string | null;
};

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function messageText(message: Record<string, unknown>): string | null {
  const type = String(message.type ?? 'unknown');
  if (type === 'text') return stringValue((message.text as { body?: unknown } | undefined)?.body);
  if (type === 'button') return stringValue((message.button as { text?: unknown } | undefined)?.text);

  if (type === 'interactive') {
    const interactive = message.interactive as Record<string, unknown> | undefined;
    const interactiveType = stringValue(interactive?.type);
    if (interactiveType === 'button_reply') {
      const reply = interactive?.button_reply as Record<string, unknown> | undefined;
      const title = stringValue(reply?.title);
      const id = stringValue(reply?.id);
      return title || id || '[Respuesta de botón]';
    }
    if (interactiveType === 'list_reply') {
      const reply = interactive?.list_reply as Record<string, unknown> | undefined;
      const title = stringValue(reply?.title);
      const description = stringValue(reply?.description);
      const id = stringValue(reply?.id);
      return [title || id || '[Opción de lista]', description].filter(Boolean).join(' — ');
    }
    if (interactiveType === 'nfm_reply') {
      const reply = interactive?.nfm_reply as Record<string, unknown> | undefined;
      return stringValue(reply?.body) || '[Respuesta de WhatsApp Flow]';
    }
    return '[Respuesta interactiva]';
  }

  if (type === 'location') {
    const location = message.location as Record<string, unknown> | undefined;
    const name = stringValue(location?.name);
    const address = stringValue(location?.address);
    const latitude = location?.latitude;
    const longitude = location?.longitude;
    const coordinates = typeof latitude === 'number' && typeof longitude === 'number'
      ? `${latitude}, ${longitude}`
      : '';
    return ['[Ubicación]', name, address, coordinates].filter(Boolean).join(' — ');
  }

  if (type === 'contacts') {
    const contacts = Array.isArray(message.contacts)
      ? message.contacts as Array<Record<string, unknown>>
      : [];
    const names = contacts.map((contact) => {
      const name = contact.name as Record<string, unknown> | undefined;
      return stringValue(name?.formatted_name);
    }).filter(Boolean);
    return names.length ? `[Contacto] ${names.join(', ')}` : '[Contacto]';
  }

  if (type === 'reaction') {
    const reaction = message.reaction as Record<string, unknown> | undefined;
    const emoji = stringValue(reaction?.emoji);
    return emoji || '[Reacción eliminada]';
  }

  if (type === 'order') {
    const order = message.order as Record<string, unknown> | undefined;
    const catalogId = stringValue(order?.catalog_id);
    return catalogId ? `[Pedido de catálogo] ${catalogId}` : '[Pedido de catálogo]';
  }

  if (type === 'image' || type === 'video' || type === 'document') {
    const media = message[type] as { caption?: unknown; filename?: unknown } | undefined;
    return stringValue(media?.caption) || stringValue(media?.filename);
  }
  if (type === 'audio') return '[Audio]';
  if (type === 'sticker') return '[Sticker]';
  if (type === 'unsupported') return '[Mensaje no compatible]';
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
