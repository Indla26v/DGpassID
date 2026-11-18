import {
  IPassRepository,
  PassFilterOptions,
  PassStatistics,
  DuplicatePassResult,
} from '@/core/interfaces/pass-repository.interface';
import { PassEntity } from '@/core/domain/entities/pass.entity';
import { PassStatus } from '@/core/domain/types/pass-status.enum';
import { query, withTransaction } from '../db/pool';
import crypto from 'crypto';
import type { PoolClient } from 'pg';
import type { SessionUser } from '@/core/domain/entities/user.entity';
import { canAccessOffice, DUPLICATE_OUTSIDE_OFFICE, isOfficeId, managesAccounts, officeScope, type OfficeStatistics } from '@/core/domain/offices';

const VALID_PASS_COLUMNS = new Set([
  'pass_number',
  'full_name',
  'father_or_spouse_name',
  'personnel_type',
  'institution',
  'institution_other',
  'category',
  'category_other',
  'department',
  'designation_or_trade',
  'dept_hostel_quarter',
  'mobile_number',
  'govt_id_type',
  'govt_id_number',
  'zone_a',
  'gate_zone_a',
  'zone_b',
  'gate_zone_b',
  'zone_c',
  'gate_zone_c',
  'valid_from',
  'valid_to',
  'photo_url',
  'cardholder_signature_url',
  'authority_signature_url',
  'office_id',
  'has_hologram',
  'has_official_seal',
  'verification_token',
  'qr_payload',
  'status',
  'printed_count',
  'last_printed_at',
  'last_printed_by',
  'approved_by',
  'approved_at',
]);

export class PostgresPassRepository implements IPassRepository {
  private computeQrPayload(p: Record<string, unknown>): string {
    const zones: string[] = [];
    if (p.zone_a) zones.push('Z-A');
    if (p.zone_b) zones.push('Z-B');
    if (p.zone_c) zones.push('Z-C');
    return `${p.pass_number || ''}|${p.verification_token || ''}|${p.full_name || ''}|${p.category || ''}|${p.institution || ''}|${zones.join(',')}`;
  }

  async findById(id: string, actor: SessionUser): Promise<PassEntity | null> {
    const res = await query<PassEntity>('SELECT * FROM passes WHERE id = $1 AND pass_office_visible($2, office_id)', [id, officeScope(actor)]);
    return res.rows[0] || null;
  }

  async findByPassNumber(passNumber: string, actor: SessionUser): Promise<PassEntity | null> {
    const res = await query<PassEntity>('SELECT * FROM passes WHERE pass_number = $1 AND pass_office_visible($2, office_id)', [passNumber, officeScope(actor)]);
    return res.rows[0] || null;
  }

  async findByVerificationToken(token: string, actor: SessionUser): Promise<PassEntity | null> {
    const res = await query<PassEntity>('SELECT * FROM passes WHERE verification_token = $1 AND pass_office_visible($2, office_id)', [token.trim().toUpperCase(), officeScope(actor)]);
    return res.rows[0] || null;
  }

  async findDuplicate(
    fullName: string,
    mobileNumber: string,
    govtIdNumber: string,
    excludeId?: string | null,
    client?: PoolClient
  ): Promise<DuplicatePassResult | null> {
    const cleanMobile = (mobileNumber || '').replace(/[^0-9]/g, '');
    const mobileSuffix = cleanMobile.length > 10 ? cleanMobile.slice(-10) : cleanMobile;
    const cleanGovtId = (govtIdNumber || '').trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

    let sql = `
      SELECT id, pass_number, full_name, mobile_number, govt_id_type, govt_id_number, status, printed_count, created_at, office_id
      FROM passes
      WHERE LOWER(TRIM(full_name)) = LOWER(TRIM($1))
        AND (
          TRIM(mobile_number) = TRIM($2)
          OR (LENGTH($3) = 10 AND RIGHT(REGEXP_REPLACE(mobile_number, '[^0-9]', '', 'g'), 10) = $3)
        )
        AND (
          LOWER(TRIM(govt_id_number)) = LOWER(TRIM($4))
          OR (LENGTH($5) > 0 AND LOWER(REGEXP_REPLACE(govt_id_number, '[^a-zA-Z0-9]', '', 'g')) = $5)
        )
        AND status != 'REVOKED'
    `;

    const params: unknown[] = [
      (fullName || '').trim(),
      (mobileNumber || '').trim(),
      mobileSuffix,
      (govtIdNumber || '').trim(),
      cleanGovtId,
    ];

    if (excludeId) {
      sql += ` AND id != $${params.length + 1}`;
      params.push(excludeId);
    }

    sql += ' ORDER BY created_at DESC LIMIT 1';

    const res = await query<DuplicatePassResult>(sql, params, client);
    return res.rows[0] || null;
  }

  async list(
    options: PassFilterOptions,
    isQueue: boolean,
    actor: SessionUser
  ): Promise<{ passes: PassEntity[]; total: number }> {
    const where: string[] = [];
    const params: unknown[] = [];

    const addClause = (clause: string, val: unknown) => {
      params.push(val);
      where.push(clause.replaceAll('?', `$${params.length}`));
    };

    addClause('pass_office_visible(?, office_id)', officeScope(actor));
    if (options.officeId) addClause("COALESCE(office_id, 'unassigned') = ?", options.officeId);

    if (options.status && options.status !== 'ALL') {
      addClause('status = ?', options.status);
    } else if (isQueue && !options.status) {
      where.push("status IN ('READY_TO_PRINT', 'PRINTED')");
    }

    if (options.institution) {
      if (options.institution === 'ICI' || options.institution === 'ICU') {
        where.push("institution IN ('ICI', 'ICU')");
      } else {
        addClause('institution = ?', options.institution);
      }
    }

    if (options.category) {
      addClause('category = ?', options.category);
    }

    if (options.zone && ['A', 'B', 'C'].includes(options.zone)) {
      where.push(`zone_${options.zone.toLowerCase()} = true`);
    }

    if (options.search && options.search.trim().length > 0) {
      addClause(
        '(full_name ILIKE ? OR pass_number ILIKE ? OR department ILIKE ? OR mobile_number ILIKE ?)',
        `%${options.search.trim()}%`
      );
    }

    const whereClause = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';

    const countRes = await query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM passes${whereClause}`,
      params
    );
    const total = parseInt(countRes.rows[0]?.total || '0', 10);

    const limit = Math.min(Math.max(options.limit || 50, 1), 500);
    const offset = Math.max(options.offset || 0, 0);

    params.push(limit);
    const limitIndex = params.length;
    params.push(offset);
    const offsetIndex = params.length;

    const dataRes = await query<PassEntity>(
      `SELECT * FROM passes${whereClause} ORDER BY created_at DESC LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
      params
    );

    return {
      passes: dataRes.rows,
      total,
    };
  }

  async getStatistics(actor: SessionUser): Promise<PassStatistics> {
    const scope = officeScope(actor);
    const { grouped, offices } = await withTransaction(async (client) => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
      const grouped = await client.query<{ status: string; institution: string; category: string; n: string }>(
        'SELECT status, institution, category, COUNT(*) AS n FROM passes WHERE pass_office_visible($1, office_id) GROUP BY status, institution, category',
        [scope]
      );
      const offices = await client.query<OfficeStatistics>('SELECT * FROM pass_office_statistics($1)', [scope]);
      return { grouped: grouped.rows, offices: offices.rows };
    });

    const rows = grouped.map((r) => ({
      status: r.status,
      institution: r.institution,
      category: r.category,
      n: parseInt(r.n, 10),
    }));

    const countBy = (field: 'status' | 'institution' | 'category', val: string) =>
      rows.filter((r) => r[field] === val).reduce((sum, r) => sum + r.n, 0);

    const total = rows.reduce((sum, r) => sum + r.n, 0);

    return {
      total,
      offices,
      draft: countBy('status', 'DRAFT'),
      pendingApproval: countBy('status', 'PENDING_APPROVAL'),
      approved: countBy('status', 'APPROVED'),
      readyToPrint: countBy('status', 'READY_TO_PRINT'),
      printed: countBy('status', 'PRINTED'),
      issued: countBy('status', 'ISSUED'),
      revoked: countBy('status', 'REVOKED'),
      byInstitution: {
        IISER: countBy('institution', 'IISER'),
        IIT: countBy('institution', 'IIT'),
        ICI: countBy('institution', 'ICI') + countBy('institution', 'ICU'),
        ICU: countBy('institution', 'ICI') + countBy('institution', 'ICU'),
        Other: total - countBy('institution', 'IISER') - countBy('institution', 'IIT') - countBy('institution', 'ICI') - countBy('institution', 'ICU'),
      },
      byCategory: {
        Student: countBy('category', 'Student'),
        'Faculty/Staff': countBy('category', 'Faculty/Staff'),
        Worker: countBy('category', 'Worker'),
        Other: total - countBy('category', 'Student') - countBy('category', 'Faculty/Staff') - countBy('category', 'Worker'),
      },
    };
  }

  async create(passData: Record<string, unknown>, actor: SessionUser): Promise<PassEntity> {
    return withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(6102028)');
      const requestedOffice = passData.office_id;
      let office = actor.officeId;
      if (managesAccounts(actor) && requestedOffice != null && requestedOffice !== '') {
        if (!isOfficeId(requestedOffice)) throw new Error('Choose a valid office.');
        office = requestedOffice;
      }
      passData.office_id = office;
      delete passData.authority_signature_url;

      const status = actor.role === 'PRINT_TEAM' ? 'PENDING_APPROVAL' : (passData.status || 'READY_TO_PRINT');
      if (!['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'READY_TO_PRINT', 'REVOKED'].includes(String(status))) {
        throw new Error('Invalid status for a new pass.');
      }
      passData.status = status;
      const approved = status === 'READY_TO_PRINT' || status === 'APPROVED';
      passData.approved_by = approved ? actor.email : null;
      passData.approved_at = approved ? new Date() : null;

      const fullName = ((passData.full_name as string) || '').trim();
      const mobileNumber = ((passData.mobile_number as string) || '').trim();
      const govtIdNumber = ((passData.govt_id_number as string) || '').trim();

      const dup = await this.findDuplicate(fullName, mobileNumber, govtIdNumber, null, client);
      if (dup) {
        if (!canAccessOffice(actor, dup.office_id)) throw new Error(DUPLICATE_OUTSIDE_OFFICE);
        throw new Error(
          `Already present: A pass for ${fullName} with this mobile number and government ID already exists (Pass #${dup.pass_number}, Status: ${dup.status.replace(/_/g, ' ')}). Redundant pass creation is disallowed.`
        );
      }

      let passNo = (passData.pass_number as string)?.trim() || '';
      if (!passNo) {
        const nextRes = await client.query<{ n: string }>(
          "SELECT COALESCE(MAX(substring(pass_number from '^DGPCONF-2026-([0-9]{1,9})$')::bigint),150)+1 AS n FROM passes"
        );
        const nextNum = parseInt(nextRes.rows[0]?.n || '151', 10);
        passNo = `DGPCONF-2026-${String(nextNum).padStart(4, '0')}`;
      }

      const verificationToken = `PV-2026-${crypto.randomBytes(20).toString('hex').toUpperCase()}-AP`;
      passData.pass_number = passNo;
      passData.verification_token = verificationToken;
      passData.qr_payload = this.computeQrPayload(passData);

      if (!office) {
        const sigRes = await client.query<{ value: string }>(
          "SELECT value FROM conference_configs WHERE key = 'authority_signature_url'"
        );
        passData.authority_signature_url = sigRes.rows[0]?.value || null;
      }

      const cleanData: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(passData)) {
        if (VALID_PASS_COLUMNS.has(k)) {
          cleanData[k] = v;
        }
      }

      const columns = Object.keys(cleanData);
      const values = Object.values(cleanData);
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(',');

      const insertRes = await client.query<PassEntity>(
        `INSERT INTO passes (${columns.join(',')}) VALUES (${placeholders}) RETURNING *`,
        values
      );
      const pass = insertRes.rows[0];

      const action = status === 'PENDING_APPROVAL' ? 'PASS_SUBMITTED_FOR_APPROVAL' : 'PASS_CREATED';
      await client.query(
        `INSERT INTO audit_logs (pass_id, pass_number, action, performed_by, user_role, details)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [pass.id, passNo, action, actor.email, actor.role, `Created pass for ${fullName}. Status: ${status}.`]
      );

      if (status === 'READY_TO_PRINT') {
        await client.query(
          `INSERT INTO audit_logs (pass_id, pass_number, action, performed_by, user_role, details)
           VALUES ($1, $2, 'PASS_SENT_TO_PRINT_TEAM', $3, $4, 'Admin-created pass released to its print queue.')`,
          [pass.id, passNo, actor.email, actor.role]
        );
      }

      return pass;
    });
  }

  async update(id: string, passData: Record<string, unknown>, actor: SessionUser): Promise<PassEntity> {
    return withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(6102028)');
      const existingRes = await client.query<PassEntity>(
        'SELECT * FROM passes WHERE id = $1 AND pass_office_visible($2, office_id) FOR UPDATE',
        [id, officeScope(actor)]
      );
      if (existingRes.rows.length === 0) {
        throw new Error('Pass not found.');
      }
      const existing = existingRes.rows[0];
      if (actor.role === 'PRINT_TEAM' && existing.status !== 'PENDING_APPROVAL') {
        throw new Error('Print operators can edit only passes awaiting approval.');
      }
      const assignedOffice = passData.office_id;
      if (assignedOffice !== undefined && (!managesAccounts(actor) || existing.office_id ||
        !['DRAFT', 'PENDING_APPROVAL'].includes(existing.status) || existing.approved_by)) {
        throw new Error('Only unapproved, unassigned passes can be assigned by a district administrator.');
      }
      if (assignedOffice !== undefined && !isOfficeId(assignedOffice)) throw new Error('Choose a valid office.');
      delete passData.authority_signature_url;
      if (passData.status === existing.status) delete passData.status;
      if (passData.status && !['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'READY_TO_PRINT', 'PRINTED', 'ISSUED', 'REVOKED'].includes(String(passData.status))) {
        throw new Error('Invalid pass status.');
      }

      const checkName = (((passData.full_name as string) || existing.full_name) || '').trim();
      const checkMobile = (((passData.mobile_number as string) || existing.mobile_number) || '').trim();
      const checkGovtId = (((passData.govt_id_number as string) || existing.govt_id_number) || '').trim();

      const dup = await this.findDuplicate(checkName, checkMobile, checkGovtId, id, client);
      if (dup) {
        if (!canAccessOffice(actor, dup.office_id)) throw new Error(DUPLICATE_OUTSIDE_OFFICE);
        throw new Error(
          `Already present: A pass for ${checkName} with this mobile number and government ID already exists (Pass #${dup.pass_number}, Status: ${dup.status.replace(/_/g, ' ')}).`
        );
      }

      const cleanData: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(passData)) {
        if (VALID_PASS_COLUMNS.has(k)) {
          cleanData[k] = v;
        }
      }

      // If status is being updated to READY_TO_PRINT or APPROVED, ensure approval metadata is updated
      if (['READY_TO_PRINT', 'APPROVED'].includes(String(cleanData.status)) && !['READY_TO_PRINT', 'APPROVED'].includes(existing.status)) {
        cleanData.approved_by = actor.email;
        cleanData.approved_at = cleanData.approved_at || new Date().toISOString();
      }

      if (assignedOffice !== undefined) cleanData.authority_signature_url = null;

      const merged = { ...existing, ...cleanData };
      cleanData.qr_payload = this.computeQrPayload(merged);

      const keys = Object.keys(cleanData);
      const values = Object.values(cleanData);
      values.push(id);

      const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');

      const updateRes = await client.query<PassEntity>(
        `UPDATE passes SET ${setClause}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
        values
      );
      const updated = updateRes.rows[0];

      const statusChanged = cleanData.status && cleanData.status !== existing.status;
      const auditDetails = statusChanged
        ? `Updated ${existing.full_name}. Status changed from ${existing.status} to ${cleanData.status}.`
        : `Updated ${existing.full_name}.`;

      await client.query(
        `INSERT INTO audit_logs (pass_id, pass_number, action, performed_by, user_role, details)
         VALUES ($1, $2, 'PASS_UPDATED', $3, $4, $5)`,
        [id, existing.pass_number, actor.email, actor.role, auditDetails]
      );

      if (assignedOffice !== undefined) {
        await client.query(
          'INSERT INTO audit_logs (pass_id, pass_number, action, performed_by, user_role, details) VALUES ($1, $2, $3, $4, $5, $6)',
          [id, existing.pass_number, 'PASS_OFFICE_ASSIGNED', actor.email, actor.role, 'Assigned office: ' + assignedOffice + '.']
        );
      }
      return updated;
    });
  }

  async delete(id: string, actor: SessionUser): Promise<string> {
    return withTransaction(async (client) => {
      const res = await client.query<{ pass_number: string; office_id: string | null }>(
        'DELETE FROM passes WHERE id = $1 AND pass_office_visible($2, office_id) RETURNING pass_number, office_id',
        [id, officeScope(actor)]
      );
      if (res.rows.length === 0) {
        throw new Error('Pass not found.');
      }
      const passNo = res.rows[0].pass_number;

      await client.query(
        `INSERT INTO audit_logs (pass_number, action, performed_by, user_role, details, office_id)
         VALUES ($1, 'PASS_DELETED', $2, 'ADMIN', 'Pass permanently deleted.', $3)`,
        [passNo, actor.email, res.rows[0].office_id]
      );

      return passNo;
    });
  }

  async updateStatus(id: string, status: PassStatus, actor: SessionUser): Promise<PassEntity> {
    return withTransaction(async (client) => {
      const res = await client.query<PassEntity>(
        `UPDATE passes SET status = $2::varchar, updated_at = NOW(),
           approved_by = CASE WHEN $2::varchar IN ('READY_TO_PRINT', 'APPROVED') AND status NOT IN ('READY_TO_PRINT', 'APPROVED') THEN $3 ELSE approved_by END,
           approved_at = CASE WHEN $2::varchar IN ('READY_TO_PRINT', 'APPROVED') AND status NOT IN ('READY_TO_PRINT', 'APPROVED') THEN NOW() ELSE approved_at END
         WHERE id = $1 AND pass_office_visible($4, office_id) RETURNING *`,
        [id, status, actor.email, officeScope(actor)]
      );
      if (res.rows.length === 0) {
        throw new Error('Pass not found.');
      }
      const updated = res.rows[0];

      await client.query(
        `INSERT INTO audit_logs (pass_id, pass_number, action, performed_by, user_role, details)
         VALUES ($1, $2, $3, $4, 'ADMIN', $5)`,
        [id, updated.pass_number, `STATUS_CHANGE_TO_${status}`, actor.email, `Status changed to ${status}.`]
      );

      return updated;
    });
  }

  async sendToPrintTeam(id: string, actor: SessionUser): Promise<PassEntity> {
    return withTransaction(async (client) => {
      const res = await client.query<PassEntity>('SELECT * FROM passes WHERE id = $1 AND pass_office_visible($2, office_id) FOR UPDATE', [id, officeScope(actor)]);
      if (res.rows.length === 0) {
        throw new Error('Pass not found.');
      }
      const pass = res.rows[0];

      if (pass.status === 'READY_TO_PRINT') {
        return pass;
      }

      if (!['DRAFT', 'APPROVED', 'PENDING_APPROVAL'].includes(pass.status)) {
        throw new Error(
          'Only draft, approved or pending passes can be sent to the print team. Printed cards use the reprint workflow; revoked passes require security review.'
        );
      }

      const updateRes = await client.query<PassEntity>(
        `UPDATE passes
         SET status = 'READY_TO_PRINT', approved_by = CASE WHEN status = 'APPROVED' THEN approved_by ELSE $2 END,
             approved_at = CASE WHEN status = 'APPROVED' THEN approved_at ELSE NOW() END, updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [id, actor.email]
      );
      const updated = updateRes.rows[0];

      await client.query(
        `INSERT INTO audit_logs (pass_id, pass_number, action, performed_by, user_role, details)
         VALUES ($1, $2, 'PASS_SENT_TO_PRINT_TEAM', $3, 'ADMIN', 'Approved and released to its print queue.')`,
        [id, updated.pass_number, actor.email]
      );

      return updated;
    });
  }

  async recordPrintAction(
    ids: string[],
    actor: SessionUser,
    reason?: string,
    preview = false
  ): Promise<{ updated: PassEntity[]; successCount: number }> {
    const uniqueIds = Array.from(new Set(ids));
    if (uniqueIds.length === 0 || uniqueIds.length > 500) {
      throw new Error('Select 1–500 passes.');
    }

    return withTransaction(async (client) => {
      const existingRes = await client.query<PassEntity>(
        'SELECT * FROM passes WHERE id = ANY($1) AND pass_office_visible($2, office_id) ORDER BY id FOR UPDATE',
        [uniqueIds, officeScope(actor)]
      );

      if (existingRes.rows.length !== uniqueIds.length) {
        throw new Error('One or more passes were not found.');
      }

      const invalid = existingRes.rows.find(
        (p) => !['READY_TO_PRINT', 'PRINTED'].includes(p.status)
      );
      if (invalid) {
        throw new Error('Only approved cards in Ready to Print or Printed status may be printed.');
      }

      if (preview) return { updated: [], successCount: existingRes.rows.length };

      const updateRes = await client.query<PassEntity>(
        `UPDATE passes
         SET status = 'PRINTED', printed_count = printed_count + 1, last_printed_at = NOW(), last_printed_by = $2, updated_at = NOW()
         WHERE id = ANY($1) RETURNING *`,
        [uniqueIds, actor.email]
      );

      const action = reason ? 'REPRINT_REQUESTED' : 'PASS_PRINT_REQUESTED';
      const details = reason || 'Authorized print request recorded; physical output must be confirmed at the station.';

      for (const pass of updateRes.rows) {
        await client.query(
          `INSERT INTO audit_logs (pass_id, pass_number, action, performed_by, user_role, details)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [pass.id, pass.pass_number, action, actor.email, actor.role, details]
        );
      }

      return {
        updated: updateRes.rows,
        successCount: updateRes.rows.length,
      };
    });
  }
}
