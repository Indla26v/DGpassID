import { IConfigRepository, AuthoritySignatureConfig } from '@/core/interfaces/config-repository.interface';
import type { SessionUser } from '@/core/domain/entities/user.entity';
import { query, withTransaction } from '../db/pool';
import { PoolClient } from 'pg';

export class PostgresConfigRepository implements IConfigRepository {
  async removeAuthoritySignature(actor: SessionUser): Promise<void> {
    await withTransaction(async (client) => {
      if (actor.officeId) {
        await client.query('UPDATE pass_offices SET signature_url = NULL WHERE id = $1', [actor.officeId]);
      } else {
        await client.query("DELETE FROM conference_configs WHERE key = 'authority_signature_url'");
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

  async getAuthoritySignature(actor: SessionUser): Promise<AuthoritySignatureConfig> {
    if (actor.officeId) {
      const { rows: [office] } = await query(
        'SELECT signature_url, authority_name, authority_title, name FROM pass_offices WHERE id = $1',
        [actor.officeId]
      );
      return {
        signatureUrl: office.signature_url,
        name: office.authority_name ?? actor.name,
        title: office.authority_title ?? office.name,
      };
    }
    const res = await query<{ key: string; value: string }>(
      'SELECT key, value FROM conference_configs'
    );
    const map = new Map<string, string>();
    for (const row of res.rows) {
      map.set(row.key, row.value);
    }

    return {
      signatureUrl: map.get('authority_signature_url') || null,
      name: map.get('issuing_authority_name') || 'R. Rao / SP',
      title: map.get('issuing_authority_title') || 'SP / Security Nodal Officer, Tirupati',
    };
  }

  async saveAuthoritySignature(
    signatureUrl: string,
    name: string,
    title: string,
    actor: SessionUser
  ): Promise<void> {
    await withTransaction(async (client) => {
      if (actor.officeId) {
        await client.query('UPDATE pass_offices SET signature_url = $1, authority_name = $2, authority_title = $3 WHERE id = $4', [signatureUrl, name, title, actor.officeId]);
      } else {
        await this.setConfig('authority_signature_url', signatureUrl, 'Official digital signature', client);
        await this.setConfig('issuing_authority_name', name, 'Name of the authority', client);
        await this.setConfig('issuing_authority_title', title, 'Title of the authority', client);
      }
      await client.query(
        "INSERT INTO audit_logs (action, performed_by, user_role, details, office_id) VALUES ('AUTHORITY_SIGNATURE_UPDATED', $1, $2, 'Signature updated for future passes.', $3)",
        [actor.email, actor.role, actor.officeId]
      );
    });
  }
}
