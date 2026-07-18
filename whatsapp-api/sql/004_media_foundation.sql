-- Multimedia y marcas de estado de mensajes.

ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_wamid TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS message_attachments (
  id UUID PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  media_id TEXT,
  media_type TEXT NOT NULL CHECK (media_type IN ('IMAGE','AUDIO','VOICE','VIDEO','DOCUMENT','STICKER','OTHER')),
  mime_type TEXT,
  filename TEXT,
  caption TEXT,
  size_bytes BIGINT,
  sha256 TEXT,
  storage_key TEXT,
  download_status TEXT NOT NULL DEFAULT 'PENDING',
  transcription TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS message_attachments_message_idx ON message_attachments(message_id);
CREATE UNIQUE INDEX IF NOT EXISTS message_attachments_media_id_unique_idx
  ON message_attachments(media_id) WHERE media_id IS NOT NULL;
