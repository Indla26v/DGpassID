import { IUserRepository } from '@/core/interfaces/user-repository.interface';
import { UserEntity, UserRole, SessionUser } from '@/core/domain/entities/user.entity';
import type { OfficeId } from '@/core/domain/offices';
import type { PolicePrintScope } from '@/core/domain/police-print-scope';
import { SESSION_IDLE_MINUTES, SESSION_MAX_HOURS } from '@/core/domain/session-lifetime';
import { query, withTransaction } from '../db/pool';

export class PostgresUserRepository implements IUserRepository {
  async findByEmail(email: string): Promise<UserEntity | null> {
    const normalized = email.trim().toLowerCase();
    const res = await query<UserEntity>(
      'SELECT id, email, name, role, office_id AS "officeId", police_print_scope AS "policePrintScope", password_hash, is_active, created_at FROM app_users WHERE email = $1',
      [normalized]
    );
    return res.rows[0] || null;
  }

  async resolveUsername(username: string): Promise<string | null> {
    const { rows } = await query<{ email: string }>(
      "SELECT email FROM app_users WHERE split_part(email, '@', 1) = $1 LIMIT 2",
      [username],
    );
    return rows.length === 1 ? rows[0].email : null;
  }

  async findById(id: string): Promise<UserEntity | null> {
    const res = await query<UserEntity>(
      'SELECT id, email, name, role, office_id AS "officeId", password_hash, is_active, created_at FROM app_users WHERE id = $1',
      [id]
    );
    return res.rows[0] || null;
  }

  async list(): Promise<Omit<UserEntity, 'password_hash'>[]> {
    const res = await query<Omit<UserEntity, 'password_hash'>>(
      'SELECT id, email, name, role, office_id AS "officeId", police_print_scope AS "policePrintScope", is_active, created_at FROM app_users ORDER BY created_at ASC'
    );
    return res.rows;
  }

  async create(email: string, name: string, role: UserRole, passwordHash: string, officeId: OfficeId | null, scope: PolicePrintScope[] = []): Promise<Omit<UserEntity, 'password_hash'>> {
    const normalized = email.trim().toLowerCase();
    const res = await query<Omit<UserEntity, 'password_hash'>>(
      `INSERT INTO app_users (email, name, role, office_id, password_hash, is_active, police_print_scope)
       VALUES ($1, $2, $3, $4, $5, true, $6)
       RETURNING id, email, name, role, office_id AS "officeId", police_print_scope AS "policePrintScope", is_active, created_at`,
      [normalized, name.trim(), role, officeId, passwordHash, JSON.stringify(scope)]
    );
    return res.rows[0];
  }

  async setPolicePrintScope(id: string, scope: PolicePrintScope[]): Promise<boolean> {
    const result = await query(
      "UPDATE app_users SET police_print_scope = $2 WHERE id = $1 AND role IN ('POLICE_PRINT', 'BANDOBAST_OFFICER')",
      [id, JSON.stringify(scope)],
    );
    return Boolean(result.rowCount);
  }

  async setActive(id: string, isActive: boolean, districtAdmin: boolean): Promise<boolean> {
    return withTransaction(async (client) => {
      const result = await client.query(
        "UPDATE app_users SET is_active = $2 WHERE id = $1 AND (NOT $3 OR role <> 'ADMIN' OR office_id IS NOT NULL)",
        [id, isActive, districtAdmin]
      );
      if (!result.rowCount) return false;
      if (!isActive) await client.query('DELETE FROM app_sessions WHERE user_id = $1', [id]);
      return true;
    });
  }

  async checkLoginAttempts(email: string): Promise<number> {
    const normalized = email.trim().toLowerCase();
    const res = await query<{ attempts: number }>(
      `SELECT attempts FROM auth_login_attempts
       WHERE email = $1 AND window_start >= NOW() - INTERVAL '15 minutes'`,
      [normalized]
    );
    return res.rows[0]?.attempts || 0;
  }

  async recordLoginAttempt(email: string): Promise<number> {
    const normalized = email.trim().toLowerCase();
    const res = await query<{ attempts: number }>(
      `INSERT INTO auth_login_attempts (email, attempts, window_start)
       VALUES ($1, 1, NOW())
       ON CONFLICT (email) DO UPDATE SET
         attempts = CASE
           WHEN auth_login_attempts.window_start < NOW() - INTERVAL '15 minutes' THEN 1
           ELSE auth_login_attempts.attempts + 1
         END,
         window_start = CASE
           WHEN auth_login_attempts.window_start < NOW() - INTERVAL '15 minutes' THEN NOW()
           ELSE auth_login_attempts.window_start
         END
       RETURNING attempts`,
      [normalized]
    );
    return res.rows[0].attempts;
  }

  async resetLoginAttempts(email: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    await query('DELETE FROM auth_login_attempts WHERE email = $1', [normalized]);
  }

  async createSession(tokenHash: string, userId: string): Promise<void> {
    await query(
      `INSERT INTO app_sessions (token_hash, user_id, expires_at)
       VALUES ($1, $2, NOW() + $3 * INTERVAL '1 minute')`,
      [tokenHash, userId, SESSION_IDLE_MINUTES]
    );
  }

  async renewSession(tokenHash: string): Promise<SessionUser | null> {
    const { rows } = await query<SessionUser>(
      `UPDATE app_sessions s
       SET expires_at = GREATEST(s.expires_at, LEAST(
         NOW() + $2 * INTERVAL '1 minute', s.created_at + $3 * INTERVAL '1 hour'
       ))
       FROM app_users u
       WHERE s.token_hash = $1 AND s.user_id = u.id AND s.expires_at > NOW() AND u.is_active
       RETURNING u.id, u.email, u.name, u.role, u.office_id AS "officeId",
                 u.police_print_scope AS "policePrintScope"`,
      [tokenHash, SESSION_IDLE_MINUTES, SESSION_MAX_HOURS],
    );
    return rows[0] ?? null;
  }

  async findSessionUser(tokenHash: string): Promise<SessionUser | null> {
    const res = await query<SessionUser>(
      `SELECT u.id, u.email, u.name, u.role, u.office_id AS "officeId", u.police_print_scope AS "policePrintScope"
       FROM app_sessions s
       JOIN app_users u ON u.id = s.user_id
       WHERE s.token_hash = $1
         AND s.expires_at > NOW()
         AND u.is_active = true`,
      [tokenHash]
    );
    return res.rows[0] || null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await query('DELETE FROM app_sessions WHERE token_hash = $1', [tokenHash]);
  }

  async deleteExpiredSessions(): Promise<void> {
    await query('DELETE FROM app_sessions WHERE expires_at <= NOW()');
  }
}
