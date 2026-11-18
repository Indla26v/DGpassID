import type { SessionUser } from '../domain/entities/user.entity';

export interface AuthoritySignatureConfig {
  signatureUrl: string | null;
  name: string;
  title: string;
}

export interface IConfigRepository {
  getConfig(key: string): Promise<string | null>;
  setConfig(key: string, value: string, description?: string): Promise<void>;
  getAuthoritySignature(actor: SessionUser): Promise<AuthoritySignatureConfig>;
  removeAuthoritySignature(actor: SessionUser): Promise<void>;
  saveAuthoritySignature(
    signatureUrl: string,
    name: string,
    title: string,
    actor: SessionUser
  ): Promise<void>;
}
