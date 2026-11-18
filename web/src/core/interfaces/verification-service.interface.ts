import { PassEntity } from '../domain/entities/pass.entity';

export interface VerificationResult {
  isValid: boolean;
  status: 'VALID' | 'REVOKED' | 'EXPIRED' | 'NOT_FOUND' | 'ZONE_RESTRICTED';
  message: string;
  pass?: PassEntity;
  gateMatch?: boolean;
}

export interface IVerificationService {
  generateVerificationToken(passNumber: string, fullName: string): string;
  generateQRPayload(pass: Partial<PassEntity>): string;
  verifyPassToken(token: string, gateId?: string): Promise<VerificationResult>;
  verifyQRPayload(qrText: string, gateId?: string): Promise<VerificationResult>;
}
