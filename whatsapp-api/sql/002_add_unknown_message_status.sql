ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_status_check;

ALTER TABLE messages
  ADD CONSTRAINT messages_status_check
  CHECK (status IN ('UNKNOWN','PENDING','SENT','DELIVERED','READ','FAILED','RECEIVED'));
