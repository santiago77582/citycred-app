import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { adminPassword, config } from '../config.js';

const COOKIE_NAME = 'citycred_admin';
const SESSION_TTL_SECONDS = 12 * 60 * 60;

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function signature(expiresAt: string): string {
  return createHmac('sha256', adminPassword()).update(expiresAt).digest('base64url');
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header
      .split(';')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const separator = item.indexOf('=');
        if (separator === -1) return [item, ''];
        return [item.slice(0, separator), decodeURIComponent(item.slice(separator + 1))];
      })
  );
}

function validSession(req: Request): boolean {
  const token = parseCookies(req.header('cookie'))[COOKIE_NAME];
  if (!token) return false;

  const separator = token.indexOf('.');
  if (separator === -1) return false;

  const expiresAt = token.slice(0, separator);
  const suppliedSignature = token.slice(separator + 1);
  const expiresAtNumber = Number(expiresAt);
  if (!Number.isFinite(expiresAtNumber) || expiresAtNumber <= Date.now()) return false;

  return safeEqual(suppliedSignature, signature(expiresAt));
}

export function isValidAdminPassword(candidate: string): boolean {
  return safeEqual(candidate, adminPassword());
}

export function setAdminSession(res: Response): void {
  const expiresAt = String(Date.now() + SESSION_TTL_SECONDS * 1_000);
  const token = `${expiresAt}.${signature(expiresAt)}`;
  const secure = config.NODE_ENV === 'production' ? '; Secure' : '';
  res.append(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}${secure}`
  );
}

export function clearAdminSession(res: Response): void {
  const secure = config.NODE_ENV === 'production' ? '; Secure' : '';
  res.append(
    'Set-Cookie',
    `${COOKIE_NAME}=; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=0${secure}`
  );
}

export function requireAdminSession(req: Request, res: Response, next: NextFunction): void {
  if (validSession(req)) {
    next();
    return;
  }

  if (req.path.startsWith('/api/') || req.path.endsWith('.js')) {
    res.status(401).json({ error: 'Sesión del panel vencida.' });
    return;
  }

  res.redirect(302, '/admin/login');
}
