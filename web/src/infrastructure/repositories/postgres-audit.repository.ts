import { IAuditRepository } from '@/core/interfaces/audit-repository.interface';
import { AuditLogEntity, CreateAuditLogInput } from '@/core/domain/entities/audit.entity';
import { query } from '../db/pool';
import { PoolClient } from 'pg';

export class PostgresAuditRepository implements IAuditRepository {
  async createLog(input: CreateAuditLogInput, client?: PoolClient): Promise<AuditLogEntity> {
    const res = await query<AuditLogEntity>(
      `INSERT INTO audit_logs (pass_id, pass_number, action, performed_by, user_role, details)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.pass_id || null,
        input.pass_number || null,
        input.action,
        input.performed_by,
        input.user_role,
        input.details || null,
      ],
      client
    );
    return res.rows[0];
  }

  async getLogsForPass(passId: string): Promise<AuditLogEntity[]> {
    const res = await query<AuditLogEntity>(
      'SELECT * FROM audit_logs WHERE pass_id = $1 ORDER BY created_at DESC LIMIT 500',
      [passId]
    );
    return res.rows;
  }

  async getRecentLogs(limit: number = 30): Promise<AuditLogEntity[]> {
    const clampedLimit = Math.min(Math.max(limit, 1), 500);
    const res = await query<AuditLogEntity>(
      'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT $1',
      [clampedLimit]
    );
    return res.rows;
  }
}
