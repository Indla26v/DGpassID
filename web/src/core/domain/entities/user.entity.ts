import type { OfficeId } from '../offices';

export type UserRole = 'ADMIN' | 'PRINT_TEAM';

export interface UserEntity {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  officeId: OfficeId | null;
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
}
