import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import { AppError } from '../errors/AppError.js';
import { hashPassword, verifyPassword } from '../security/passwords.js';
import { writeAuditEvent } from './auditRepository.js';

export type UserRole = 'ADMIN' | 'SUPERVISOR' | 'ADVISOR';

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
};

type UserAuthRow = {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  role: UserRole;
  active: boolean;
};

const DUMMY_PASSWORD_HASH = hashPassword('citycred-dummy-password-not-for-login');

function mapSessionUser(row: Omit<UserAuthRow, 'password_hash' | 'active'>): SessionUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role
  };
}

export async function authenticateUser(
  email: string,
  password: string
): Promise<SessionUser | null> {
  const result = await pool.query<UserAuthRow>(
    `SELECT id, email, display_name, password_hash, role, active
     FROM app_users
     WHERE email = $1
     LIMIT 1`,
    [email.trim().toLowerCase()]
  );
  const row = result.rows[0];
  const valid = row
    ? verifyPassword(password, row.password_hash)
    : verifyPassword(password, DUMMY_PASSWORD_HASH);
  if (!row || !row.active || !valid) return null;

  await pool.query(
    `UPDATE app_users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [row.id]
  );
  await writeAuditEvent({
    actorUserId: row.id,
    action: 'USER_LOGGED_IN',
    entityType: 'USER',
    entityId: row.id,
    afterData: { email: row.email, role: row.role }
  });
  return mapSessionUser(row);
}

export async function getActiveSessionUser(userId: string): Promise<SessionUser | null> {
  const result = await pool.query<{
    id: string;
    email: string;
    display_name: string;
    role: UserRole;
  }>(
    `SELECT id, email, display_name, role
     FROM app_users
     WHERE id = $1 AND active = TRUE`,
    [userId]
  );
  const row = result.rows[0];
  return row ? mapSessionUser(row) : null;
}

export async function listUsers() {
  const result = await pool.query(
    `SELECT id, email, display_name, role, active, last_login_at, created_at, updated_at
     FROM app_users ORDER BY active DESC, display_name ASC`
  );
  return result.rows;
}

export async function createUser(params: {
  email: string;
  displayName: string;
  password: string;
  role: UserRole;
  actorUserId?: string | null;
}) {
  try {
    const result = await pool.query(
      `INSERT INTO app_users (
         id, email, display_name, password_hash, role
       ) VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, display_name, role, active, created_at, updated_at`,
      [
        randomUUID(),
        params.email.trim().toLowerCase(),
        params.displayName.trim(),
        hashPassword(params.password),
        params.role
      ]
    );
    const user = result.rows[0];
    await writeAuditEvent({
      actorUserId: params.actorUserId,
      action: 'USER_CREATED',
      entityType: 'USER',
      entityId: String(user.id),
      afterData: user
    });
    return user;
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new AppError('Ya existe un usuario con ese correo.', 409);
    }
    throw error;
  }
}

export async function updateUser(params: {
  userId: string;
  displayName?: string;
  role?: UserRole;
  active?: boolean;
  newPassword?: string;
  actorUserId?: string | null;
}) {
  const beforeResult = await pool.query(
    `SELECT id, email, display_name, role, active FROM app_users WHERE id = $1`,
    [params.userId]
  );
  const before = beforeResult.rows[0];
  if (!before) throw new AppError('Usuario no encontrado.', 404);

  const result = await pool.query(
    `UPDATE app_users SET
       display_name = COALESCE($2, display_name),
       role = COALESCE($3, role),
       active = COALESCE($4, active),
       password_hash = COALESCE($5, password_hash),
       updated_at = NOW()
     WHERE id = $1
     RETURNING id, email, display_name, role, active, last_login_at, created_at, updated_at`,
    [
      params.userId,
      params.displayName?.trim() ?? null,
      params.role ?? null,
      params.active ?? null,
      params.newPassword ? hashPassword(params.newPassword) : null
    ]
  );
  const after = result.rows[0];
  await writeAuditEvent({
    actorUserId: params.actorUserId,
    action: 'USER_UPDATED',
    entityType: 'USER',
    entityId: params.userId,
    beforeData: before,
    afterData: after
  });
  return after;
}
