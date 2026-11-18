import { UserRole } from '../types/pass-status.enum';

export interface AuditLogEntity {
  id: number;
  pass_id?: string | null;
  pass_number?: string | null;
  action: string;
  performed_by: string;
  user_role: UserRole;
  details?: string | null;
  created_at: string;
}

export interface CreateAuditLogInput {
  pass_id?: string | null;
  pass_number?: string | null;
  action: string;
  performed_by: string;
  user_role: UserRole;
  details?: string | null;
}
