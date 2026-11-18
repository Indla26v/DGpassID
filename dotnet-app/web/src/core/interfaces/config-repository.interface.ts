export interface AuthoritySignatureConfig {
  signatureUrl: string | null;
  name: string;
  title: string;
}

export interface IConfigRepository {
  getConfig(key: string): Promise<string | null>;
  setConfig(key: string, value: string, description?: string): Promise<void>;
  getAuthoritySignature(): Promise<AuthoritySignatureConfig>;
  saveAuthoritySignature(
    signatureUrl: string,
    name?: string,
    title?: string,
    applyToAllPasses?: boolean
  ): Promise<{ updatedPassCount: number }>;
}
