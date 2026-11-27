import type { SessionUser } from '../domain/entities/user.entity';
import type { OfficeId } from '../domain/offices';

export interface SignaturePreset {
  sourceUrl: string;
  fittedSource: boolean;
  scale: number;
  offsetX: number;
  offsetY: number;
  rotation: number;
  cleanBackground: boolean;
}

export interface AuthoritySignatureConfig {
  signatureUrl: string | null;
  name: string;
  title: string;
  preset?: SignaturePreset | null;
}

export interface IConfigRepository {
  getConfig(key: string): Promise<string | null>;
  setConfig(key: string, value: string, description?: string): Promise<void>;
  getAuthoritySignature(officeId: OfficeId | null, includePreset?: boolean): Promise<AuthoritySignatureConfig>;
  removeAuthoritySignature(actor: SessionUser): Promise<void>;
  saveAuthoritySignature(
    signatureUrl: string | null,
    name: string,
    title: string,
    actor: SessionUser,
    applyToUnprinted?: boolean,
    preset?: SignaturePreset
  ): Promise<number>;
}
