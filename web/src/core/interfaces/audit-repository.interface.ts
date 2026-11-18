import { AuditLogEntity, CreateAuditLogInput } from '../domain/entities/audit.entity';
import { PoolClient } from 'pg';

export interface IAuditRepository {
  createLog(input: CreateAuditLogInput, client?: PoolClient): Promise<AuditLogEntity>;
  getLogsForPass(passId: string): Promise<AuditLogEntity[]>;
  getRecentLogs(limit?: number): Promise<AuditLogEntity[]>;
}
