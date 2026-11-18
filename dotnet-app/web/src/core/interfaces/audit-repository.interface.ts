import { AuditLogEntity, CreateAuditLogInput } from '../domain/entities/audit.entity';

export interface IAuditRepository {
  createLog(input: CreateAuditLogInput): Promise<AuditLogEntity>;
  getLogsForPass(passId: string): Promise<AuditLogEntity[]>;
  getRecentLogs(limit?: number): Promise<AuditLogEntity[]>;
}
