import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const digest = scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `scrypt$${salt}$${digest}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [algorithm, salt, digest] = stored.split('$');
  if (algorithm !== 'scrypt' || !salt || !digest) return false;
  const expected = Buffer.from(digest, 'hex');
  if (expected.length !== KEY_LENGTH) return false;
  const actual = scryptSync(password, salt, KEY_LENGTH);
  return timingSafeEqual(actual, expected);
}
