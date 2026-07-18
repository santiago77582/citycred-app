import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import { AppError } from '../errors/AppError.js';
import { hashPassword } from '../security/passwords.js';
import { writeAuditEvent } from './auditRepository.js';

export type UserRole = 'ADMIN' | 'SUPERVISOR' | 'ADVISOR';

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
