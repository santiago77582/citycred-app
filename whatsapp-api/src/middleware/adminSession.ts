import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { adminPassword, config } from '../config.js';
import {
  getActiveSessionUser,
  type SessionUser,
  type UserRole
} from '../crm/teamRepository.js';

const COOKIE_NAME = 'citycred_admin';
const SESSION_TTL_SECONDS = 12 * 60 * 60;

type SessionPayload = {
  expiresAt: number;
  userId: string | null;
  emergency: boolean;
};

export type AdminIdentity = {
  userId: string | null;
  email: string | null;
  displayName: string;
  role: UserRole;
  emergency: boolean;
};

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function signature(encodedPayload: string): string {
  return createHmac('sha256', adminPassword())
    .update(encodedPayload)
    .digest('base64url');
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

function decodeSession(req: Request): SessionPayload | null {
  const token = parseCookies(req.header('cookie'))[COOKIE_NAME];
  if (!token) return null;
  const separator = token.lastIndexOf('.');
  if (separator === -1) return null;

  const encodedPayload = token.slice(0, separator);
  const suppliedSignature = token.slice(separator + 1);
  if (!safeEqual(suppliedSignature, signature(encodedPayload))) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    ) as Partial<SessionPayload>;
    if (
      typeof payload.expiresAt !== 'number'
      || payload.expiresAt <= Date.now()
      || (payload.userId !== null && typeof payload.userId !== 'string')
      || typeof payload.emergency !== 'boolean'
    ) return null;
    return {
      expiresAt: payload.expiresAt,
      userId: payload.userId ?? null,
      emergency: payload.emergency
    };
  } catch {
    return null;
  }
}

function unauthorized(req: Request, res: Response): void {
  if (req.path.startsWith('/api/') || req.path.endsWith('.js')) {
    res.status(401).json({ error: 'Sesión del panel vencida.' });
    return;
  }
  res.redirect(302, '/admin/login');
}

export function isValidAdminPassword(candidate: string): boolean {
  return safeEqual(candidate, adminPassword());
}

export function setAdminSession(
  res: Response,
  user?: SessionUser | null
): void {
  const payload: SessionPayload = {
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1_000,
    userId: user?.id ?? null,
    emergency: !user
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const token = `${encodedPayload}.${signature(encodedPayload)}`;
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

export async function requireAdminSession(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const payload = decodeSession(req);
  if (!payload) {
    unauthorized(req, res);
    return;
  }

  if (payload.emergency) {
    req.adminUser = {
      userId: null,
      email: null,
      displayName: 'Administrador de emergencia',
      role: 'ADMIN',
      emergency: true
    };
    next();
    return;
  }

  if (!payload.userId) {
    unauthorized(req, res);
    return;
  }
  const user = await getActiveSessionUser(payload.userId);
  if (!user) {
    clearAdminSession(res);
    unauthorized(req, res);
    return;
  }

  req.adminUser = {
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    emergency: false
  };
  next();
}

export function requirePanelRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.adminUser || roles.includes(req.adminUser.role)) {
      next();
      return;
    }
    res.status(403).json({ error: 'Tu usuario no tiene permiso para esta operación.' });
  };
}
