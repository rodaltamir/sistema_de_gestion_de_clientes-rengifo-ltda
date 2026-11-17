import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { ensureDatabaseReady, getPool } from './db';
import type { User } from './types';

export const SESSION_COOKIE = 'rengifo_session';
const SESSION_TTL_DAYS = 7;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = String(storedHash || '').split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  const actualBuf = crypto.scryptSync(password, salt, 64);
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (actualBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

export async function createSession(userId: number): Promise<string> {
  await ensureDatabaseReady();
  const pool = getPool();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86400 * 1000);
  await pool.query(
    'INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)',
    [token, userId, expiresAt]
  );
  return token;
}

export async function getSessionUser(): Promise<User | null> {
  await ensureDatabaseReady();
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const pool = getPool();
  const { rows } = await pool.query<User & { expires_at: Date }>(
    `SELECT u.id, u.full_name, u.username, u.email, s.expires_at
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = $1`,
    [token]
  );

  const row = rows[0];
  if (!row) return null;

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
    return null;
  }

  return {
    id: row.id,
    full_name: row.full_name,
    username: row.username,
    email: row.email
  };
}

export async function deleteSessionByToken(token: string | undefined): Promise<void> {
  if (!token) return;
  await ensureDatabaseReady();
  const pool = getPool();
  await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
}

export async function hasAnyUsers(): Promise<boolean> {
  await ensureDatabaseReady();
  const pool = getPool();
  const { rows } = await pool.query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM users'
  );
  return Number(rows[0]?.count || 0) > 0;
}
