import { UserEntity, UserRole, SessionUser } from '../domain/entities/user.entity';

import type { OfficeId } from "../domain/offices";
import type { PolicePrintScope } from '../domain/police-print-scope';

export interface IUserRepository {
  findByEmail(email: string): Promise<UserEntity | null>;
  resolveUsername(username: string): Promise<string | null>;
  findById(id: string): Promise<UserEntity | null>;
  list(): Promise<Omit<UserEntity, 'password_hash'>[]>;
  create(email: string, name: string, role: UserRole, passwordHash: string, officeId: OfficeId | null, scope?: PolicePrintScope[]): Promise<Omit<UserEntity, 'password_hash'>>;
  setPolicePrintScope(id: string, scope: PolicePrintScope[]): Promise<boolean>;
  setActive(id: string, isActive: boolean, districtAdmin: boolean): Promise<boolean>;
  
  checkLoginAttempts(email: string): Promise<number>;
  recordLoginAttempt(email: string): Promise<number>;
  resetLoginAttempts(email: string): Promise<void>;

  createSession(tokenHash: string, userId: string): Promise<void>;
  renewSession(tokenHash: string): Promise<SessionUser | null>;
  findSessionUser(tokenHash: string): Promise<SessionUser | null>;
  deleteSession(tokenHash: string): Promise<void>;
  deleteExpiredSessions(): Promise<void>;
}
