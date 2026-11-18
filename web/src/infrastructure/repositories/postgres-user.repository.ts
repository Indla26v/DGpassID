import { IUserRepository } from '@/core/interfaces/user-repository.interface';
import { UserEntity, UserRole, SessionUser } from '@/core/domain/entities/user.entity';
import type { OfficeId } from '@/core/domain/offices';
import { query, withTransaction } from '../db/pool';

export class PostgresUserRepository implements IUserRepository {
  async findByEmail(email: string): Promise<UserEntity | null> {
    const normalized = email.trim().toLowerCase();
    const res = await query<UserEntity>(
      'SELECT id, email, name, role, office_id AS "officeId", password_hash, is_active, created_at FROM app_users WHERE email = $1',
      [normalized]
    );
    return res.rows[0] || null;
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
      'SELECT id, email, name, role, office_id AS "officeId", is_active, created_at FROM app_users ORDER BY created_at ASC'
    );
    return res.rows;
  }

  async create(email: string, name: string, role: UserRole, passwordHash: string, officeId: OfficeId | null): Promise<Omit<UserEntity, 'password_hash'>> {
    const normalized = email.trim().toLowerCase();
    const res = await query<Omit<UserEntity, 'password_hash'>>(
      `INSERT INTO app_users (email, name, role, office_id, password_hash, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING id, email, name, role, office_id AS "officeId", is_active, created_at`,
      [normalized, name.trim(), role, officeId, passwordHash]
    );
    return res.rows[0];
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

  async createSession(tokenHash: string, userId: string, durationHours: number = 8): Promise<void> {
    await query(
      `INSERT INTO app_sessions (token_hash, user_id, expires_at)
       VALUES ($1, $2, NOW() + ($3 || ' hours')::INTERVAL)`,
      [tokenHash, userId, durationHours.toString()]
    );
  }

  async findSessionUser(tokenHash: string): Promise<SessionUser | null> {
    const res = await query<SessionUser>(
      `SELECT u.id, u.email, u.name, u.role, u.office_id AS "officeId"
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
