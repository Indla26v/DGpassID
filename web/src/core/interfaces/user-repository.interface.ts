import { UserEntity, UserRole, SessionUser } from '../domain/entities/user.entity';

import type { OfficeId } from "../domain/offices";

export interface IUserRepository {
  findByEmail(email: string): Promise<UserEntity | null>;
  findById(id: string): Promise<UserEntity | null>;
  list(): Promise<Omit<UserEntity, 'password_hash'>[]>;
  create(email: string, name: string, role: UserRole, passwordHash: string, officeId: OfficeId | null): Promise<Omit<UserEntity, 'password_hash'>>;
  setActive(id: string, isActive: boolean, districtAdmin: boolean): Promise<boolean>;
  
  checkLoginAttempts(email: string): Promise<number>;
  recordLoginAttempt(email: string): Promise<number>;
  resetLoginAttempts(email: string): Promise<void>;

  createSession(tokenHash: string, userId: string, durationHours?: number): Promise<void>;
  findSessionUser(tokenHash: string): Promise<SessionUser | null>;
  deleteSession(tokenHash: string): Promise<void>;
  deleteExpiredSessions(): Promise<void>;
}
