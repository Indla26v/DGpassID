import { IConfigRepository, AuthoritySignatureConfig, SignaturePreset } from '@/core/interfaces/config-repository.interface';
import type { SessionUser } from '@/core/domain/entities/user.entity';
import type { OfficeId } from '@/core/domain/offices';
import { query, withTransaction } from '../db/pool';
import { PoolClient } from 'pg';

export class PostgresConfigRepository implements IConfigRepository {
  async removeAuthoritySignature(actor: SessionUser): Promise<void> {
    await withTransaction(async (client) => {
      if (actor.officeId) {
        await client.query('UPDATE pass_offices SET signature_url = NULL, signature_preset = NULL WHERE id = $1', [actor.officeId]);
      } else {
        await client.query("DELETE FROM conference_configs WHERE key IN ('authority_signature_url', 'authority_signature_preset')");
      }
      await client.query(
        "INSERT INTO audit_logs (action, performed_by, user_role, details, office_id) VALUES ('AUTHORITY_SIGNATURE_REMOVED', $1, $2, 'Removed the saved authority signature for future approvals.', $3)",
        [actor.email, actor.role, actor.officeId]
      );
    });
  }

  async getConfig(key: string): Promise<string | null> {
    const res = await query<{ value: string }>(
      'SELECT value FROM conference_configs WHERE key = $1',
      [key]
    );
    return res.rows[0]?.value || null;
  }

  async setConfig(key: string, value: string, description?: string, client?: PoolClient): Promise<void> {
    await query(
      `INSERT INTO conference_configs (key, value, description)
       VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, value, description || null],
      client
    );
  }

  async getAuthoritySignature(officeId: OfficeId | null, includePreset = false): Promise<AuthoritySignatureConfig> {
    const presetColumn = includePreset ? `, CASE WHEN $1::text IS NULL THEN
      (SELECT value::jsonb FROM conference_configs WHERE key = 'authority_signature_preset')
      ELSE (SELECT signature_preset FROM pass_offices WHERE id = $1) END AS preset` : '';
    const { rows: [config] } = await query<{
      signature_url: string | null; authority_name: string | null; authority_title: string | null;
      preset?: SignaturePreset | null;
    }>(`SELECT c.*${presetColumn} FROM pass_authority_config($1) c`, [officeId]);
    return {
      signatureUrl: config?.signature_url ?? null,
      name: config?.authority_name ?? '',
      title: config?.authority_title ?? '',
      ...(includePreset ? { preset: config?.preset ?? null } : {}),
    };
  }

  async saveAuthoritySignature(
    signatureUrl: string | null,
    name: string,
    title: string,
    actor: SessionUser,
    applyToUnprinted = false,
    preset?: SignaturePreset
  ): Promise<number> {
    return withTransaction(async (client) => {
      if (actor.officeId) {
        await client.query(
          `UPDATE pass_offices
           SET signature_url = COALESCE($1, signature_url), authority_name = $2, authority_title = $3,
               signature_preset = CASE WHEN $1::text IS NULL THEN signature_preset ELSE $5::jsonb END
           WHERE id = $4`,
          [signatureUrl, name, title, actor.officeId, preset ? JSON.stringify(preset) : null]
        );
      } else {
        if (signatureUrl) {
          await this.setConfig('authority_signature_url', signatureUrl, 'Official digital signature', client);
          if (preset) {
            await this.setConfig('authority_signature_preset', JSON.stringify(preset), 'Signature source and adjustments', client);
          } else {
            await client.query("DELETE FROM conference_configs WHERE key = 'authority_signature_preset'");
          }
        }
        await this.setConfig('issuing_authority_name', name, 'Name of the authority', client);
        await this.setConfig('issuing_authority_title', title, 'Title of the authority', client);
      }
      let updatedCount = 0;
      if (applyToUnprinted) {
        const result = await client.query<{ updated_count: number }>(
          'SELECT apply_saved_authority_signature_to_unprinted($1) AS updated_count',
          [actor.officeId]
        );
        updatedCount = result.rows[0].updated_count;
      }
      const details = applyToUnprinted
        ? `Authority signature saved and applied to ${updatedCount} unprinted pass(es).`
        : 'Signature updated for future passes.';
      await client.query(
        'INSERT INTO audit_logs (action, performed_by, user_role, details, office_id) VALUES ($1, $2, $3, $4, $5)',
        [applyToUnprinted ? 'AUTHORITY_SIGNATURE_APPLIED' : 'AUTHORITY_SIGNATURE_UPDATED',
          actor.email, actor.role, details, actor.officeId]
      );
      return updatedCount;
    });
  }
}
