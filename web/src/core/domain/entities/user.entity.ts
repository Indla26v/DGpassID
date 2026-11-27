import type { OfficeId } from '../offices';
import type { PolicePrintScope } from '../police-print-scope';

export type UserRole = 'ADMIN' | 'PRINT_TEAM' | 'POLICE_PRINT' | 'BANDOBAST_OFFICER';

/** Roles whose pass access is limited to zones / sectors in police_print_scope. */
export const SCOPED_POLICE_ROLES: readonly UserRole[] = ['POLICE_PRINT', 'BANDOBAST_OFFICER'];

export interface UserEntity {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  officeId: OfficeId | null;
  policePrintScope?: PolicePrintScope[];
  password_hash?: string;
  is_active: boolean;
  created_at: string;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  officeId: OfficeId | null;
  policePrintScope?: PolicePrintScope[];
}
