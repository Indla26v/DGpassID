import {
  IPassRepository,
  PassFilterOptions,
  PassStatistics,
  DuplicatePassResult,
} from '@/core/interfaces/pass-repository.interface';
import { PassEntity } from '@/core/domain/entities/pass.entity';
import { PASS_VALID_TO, toConferenceDate } from '@/core/domain/pass-validity';
import { PassStatus } from '@/core/domain/types/pass-status.enum';
import { CAMPUS_PRINT_ZONE_REQUIRED, needsCampusPrintZone } from '@/core/domain/zones';
import { ranksInGroup } from '@/core/domain/ranks';
import { canPrintPassStatus, POLICE_UNPRINTED_STATUSES, policePrintBlocker } from '@/core/domain/police-print';
import { query, withTransaction } from '../db/pool';
import crypto from 'crypto';
import type { PoolClient } from 'pg';
import type { SessionUser } from '@/core/domain/entities/user.entity';
import { normalizeForce, normalizeGender } from '@/core/domain/ranks';
import { canAccessOffice, DUPLICATE_OUTSIDE_OFFICE, isOfficeId, managesAccounts, officeScope, type OfficeStatistics } from '@/core/domain/offices';

const policeDistrict = "COALESCE(NULLIF(BTRIM(police_unit_district), ''), NULLIF(BTRIM(institution_other), ''), 'Tirupati')";
const passListFields = `id, office_id, pass_number, pass_type, full_name, father_or_spouse_name,
  personnel_type, institution, institution_other, category, category_other, department,
  designation_or_trade, dept_hostel_quarter, mobile_number, govt_id_type, govt_id_number,
  rank, police_id_number, police_unit_district, police_zone, police_sector_number, police_sector_name,
  police_point_code, police_point_name, date_of_birth, age_years, deployment_batch_id,
  force_category, police_station, gender,
  police_custom_sector, security_component, custom_security_component, issuing_counter_id,
  distribution_status, collected_at, collected_by_officer, handover_officer_name,
  zone_a, gate_zone_a, zone_b, gate_zone_b, zone_c, gate_zone_c, valid_from, valid_to,
  authority_name, authority_title, has_hologram, has_official_seal, verification_token, qr_payload,
  is_imported, status, printed_count, last_printed_at, last_printed_by, approved_by,
  approved_at, created_at, updated_at,
  COALESCE(BTRIM(photo_url) ~ '^(data:image/|https?://|/|blob:)', false) AS "hasPhoto"`;

const VALID_PASS_COLUMNS = new Set([
  'pass_number',
  'pass_type',
  'rank',
  'police_id_number',
  'police_unit_district',
  'police_zone',
  'police_sector_number',
  'police_sector_name',
  'police_point_code',
  'police_point_name',
  'date_of_birth',
  'age_years',
  'force_category',
  'police_station',
  'gender',
  'deployment_batch_id',
  'police_custom_sector',
  'security_component',
  'custom_security_component',
  'issuing_counter_id',
  'distribution_status',
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
  'is_imported',
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

const OPTIONAL_NULLABLE_COLUMNS = ['date_of_birth', 'age_years', 'police_point_code', 'police_point_name', 'force_category', 'police_station', 'gender'];
function blankToNull(data: Record<string, unknown>) {
  for (const key of OPTIONAL_NULLABLE_COLUMNS) {
    if (key in data && (data[key] === '' || data[key] === undefined)) data[key] = null;
  }
}

export class PostgresPassRepository implements IPassRepository {
  private accessCondition(actor: SessionUser, params: unknown[], alias = 'passes'): string {
    if (actor.role !== 'POLICE_PRINT' && actor.role !== 'BANDOBAST_OFFICER') {
      params.push(officeScope(actor));
      return `pass_office_visible($${params.length}, ${alias}.office_id)`;
    }
    params.push(actor.id);
    return `${alias}.pass_type = 'POLICE_FORCE' AND EXISTS (
      SELECT 1 FROM app_users u CROSS JOIN LATERAL jsonb_array_elements(u.police_print_scope) AS assignment
      WHERE u.id = $${params.length} AND u.role IN ('POLICE_PRINT', 'BANDOBAST_OFFICER') AND u.is_active
        AND assignment->>'zone' = ${alias}.police_zone
        AND (assignment->>'sector' IS NULL OR assignment->>'sector' = ${alias}.police_sector_number)
        AND (NULLIF(assignment->>'subSector', '') IS NULL OR assignment->>'subSector' = ${alias}.police_sector_name)
    )`;
  }

  private computeQrPayload(p: Record<string, unknown>): string {
    const zones: string[] = [];
    if (p.zone_a) zones.push('Z-A');
    if (p.zone_b) zones.push('Z-B');
    if (p.zone_c) zones.push('Z-C');
    return `${p.pass_number || ''}|${p.verification_token || ''}|${p.full_name || ''}|${p.category || ''}|${p.institution || ''}|${zones.join(',')}`;
  }

  async findById(id: string, actor: SessionUser, client?: PoolClient): Promise<PassEntity | null> {
    return (await this.findByIds([id], actor, client))[0] ?? null;
  }

  async findByIds(ids: string[], actor: SessionUser, client?: PoolClient): Promise<PassEntity[]> {
    const params: unknown[] = [ids];
    const access = this.accessCondition(actor, params, 'p');
    const res = await query<PassEntity>(
      `SELECT p.*,
              COALESCE(p.authority_signature_url, o.signature_url) as authority_signature_url,
              COALESCE(p.authority_name, o.authority_name, (SELECT value FROM conference_configs WHERE key = 'issuing_authority_name')) as authority_name,
              COALESCE(p.authority_title, o.authority_title, (SELECT value FROM conference_configs WHERE key = 'issuing_authority_title')) as authority_title
       FROM passes p
       LEFT JOIN pass_offices o ON p.office_id = o.id
       WHERE p.id = ANY($1) AND ${access}
       ORDER BY array_position($1::uuid[], p.id)`,
      params,
      client,
    );
    return res.rows;
  }

  async findByPassNumber(passNumber: string, actor: SessionUser): Promise<PassEntity | null> {
    const res = await query<PassEntity>(
      `SELECT p.*,
              COALESCE(p.authority_signature_url, o.signature_url) as authority_signature_url,
              COALESCE(p.authority_name, o.authority_name, (SELECT value FROM conference_configs WHERE key = 'issuing_authority_name')) as authority_name,
              COALESCE(p.authority_title, o.authority_title, (SELECT value FROM conference_configs WHERE key = 'issuing_authority_title')) as authority_title
       FROM passes p
       LEFT JOIN pass_offices o ON p.office_id = o.id
       WHERE p.pass_number = $1 AND pass_office_visible($2, p.office_id)`,
      [passNumber, officeScope(actor)]
    );
    return res.rows[0] || null;
  }

  async findByVerificationToken(token: string, actor: SessionUser): Promise<PassEntity | null> {
    const res = await query<PassEntity>(
      `SELECT p.*,
              COALESCE(p.authority_signature_url, o.signature_url) as authority_signature_url,
              COALESCE(p.authority_name, o.authority_name, (SELECT value FROM conference_configs WHERE key = 'issuing_authority_name')) as authority_name,
              COALESCE(p.authority_title, o.authority_title, (SELECT value FROM conference_configs WHERE key = 'issuing_authority_title')) as authority_title
       FROM passes p
       LEFT JOIN pass_offices o ON p.office_id = o.id
       WHERE p.verification_token = $1 AND pass_office_visible($2, p.office_id)`,
      [token.trim().toUpperCase(), officeScope(actor)]
    );
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

  private buildFilterQuery(
    options: PassFilterOptions,
    isQueue: boolean,
    actor: SessionUser
  ): { whereClause: string; params: unknown[] } {
    const where: string[] = [];
    const params: unknown[] = [];

    const addClause = (clause: string, val: unknown) => {
      params.push(val);
      where.push(clause.replaceAll('?', `$${params.length}`));
    };

    where.push(this.accessCondition(actor, params));
    if (options.officeId) addClause("COALESCE(office_id, 'unassigned') = ?", options.officeId);

    if (options.passType && options.passType !== 'ALL') {
      addClause('pass_type = ?', options.passType);
    }

    if (options.policeZone && options.policeZone.trim().length > 0) {
      addClause('police_zone = ?', options.policeZone.trim());
    }

    if (options.policeSector && options.policeSector.trim().length > 0) {
      addClause('(police_sector_name = ? OR police_sector_number = ?)', options.policeSector.trim());
    }

    if (options.policeRank && options.policeRank.trim().length > 0) {
      addClause('UPPER(rank) = ANY(?::text[])', ranksInGroup(options.policeRank.trim()).map(rank => rank.toUpperCase()));
    }

    if (options.policeDistrict?.trim()) {
      addClause(`LOWER(${policeDistrict}) = LOWER(?)`, options.policeDistrict.trim());
    }

    if (options.issuingCounterId && options.issuingCounterId.trim().length > 0) {
      addClause('issuing_counter_id = ?', options.issuingCounterId.trim());
    }

    if (options.distributionStatus && options.distributionStatus.trim().length > 0) {
      addClause('distribution_status = ?', options.distributionStatus.trim());
    }

    if (options.department && options.department.trim().length > 0) {
      addClause('department = ?', options.department.trim());
    }

    if (options.passType === 'POLICE_FORCE' && options.status === 'READY_TO_PRINT') {
      addClause('status = ANY(?::varchar[])', POLICE_UNPRINTED_STATUSES);
    } else if (options.status && options.status !== 'ALL') {
      addClause('status = ?', options.status);
    } else if (isQueue && !options.status) {
      where.push("status IN ('READY_TO_PRINT', 'PRINTED')");
    }

    if (options.policePrintBatch) {
      where.push(
        "NULLIF(BTRIM(police_zone), '') IS NOT NULL",
        "NULLIF(BTRIM(police_sector_number), '') IS NOT NULL",
        "NULLIF(BTRIM(police_sector_name), '') IS NOT NULL",
        "BTRIM(photo_url) ~ '^(data:image/|https?://|/)'",
      );
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
        '(full_name ILIKE ? OR pass_number ILIKE ? OR department ILIKE ? OR mobile_number ILIKE ? OR govt_id_number ILIKE ? OR designation_or_trade ILIKE ? OR institution_other ILIKE ? OR police_id_number ILIKE ? OR rank ILIKE ? OR police_sector_name ILIKE ?)',
        `%${options.search.trim()}%`
      );
    }

    const whereClause = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';
    return { whereClause, params };
  }

  async list(
    options: PassFilterOptions,
    isQueue: boolean,
    actor: SessionUser
  ): Promise<{ passes: PassEntity[]; total: number }> {
    const { whereClause, params } = this.buildFilterQuery(options, isQueue, actor);

    const countRes = await query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM passes${whereClause}`,
      params
    );
    const total = parseInt(countRes.rows[0]?.total || '0', 10);

    const limit = Math.min(Math.max(options.limit || 50, 1), 500);
    const offset = Math.max(options.offset || 0, 0);

    const queryParams = [...params, limit, offset];
    const limitIndex = params.length + 1;
    const offsetIndex = params.length + 2;
    const orderBy = options.recentlyUpdated ? 'passes.updated_at' : 'passes.created_at';
    const dataRes = await query<PassEntity>(
      `SELECT ${passListFields}
       FROM passes${whereClause} ORDER BY ${orderBy} DESC, passes.id DESC LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
      queryParams
    );

    return {
      passes: dataRes.rows,
      total,
    };
  }

  async exportPasses(
    options: PassFilterOptions,
    actor: SessionUser
  ): Promise<PassEntity[]> {
    const { whereClause, params } = this.buildFilterQuery(options, false, actor);
    const dataRes = await query<PassEntity>(
      `SELECT id, pass_number, full_name, father_or_spouse_name, department, designation_or_trade,
              mobile_number, govt_id_type, govt_id_number, status, valid_from, valid_to,
              office_id, institution, institution_other, category, zone_a, zone_b, zone_c,
              dept_hostel_quarter, created_at, printed_count, last_printed_at, last_printed_by
       FROM passes${whereClause} ORDER BY created_at DESC LIMIT 50000`,
      params
    );
    return dataRes.rows;
  }

  async getDepartmentCounts(
    actor: SessionUser
  ): Promise<{ department: string; count: number }[]> {
    const scope = officeScope(actor);
    const res = await query<{ department: string; count: string }>(
      `SELECT department, COUNT(*)::text AS count
       FROM passes
       WHERE pass_type = 'CAMPUS' AND pass_office_visible($1, office_id)
       GROUP BY department
       ORDER BY COUNT(*) DESC, department ASC`,
      [scope]
    );
    return res.rows.map((r) => ({
      department: r.department,
      count: parseInt(r.count, 10),
    }));
  }

  async getStatistics(actor: SessionUser, includeRegistryTotal = false): Promise<PassStatistics> {
    const scope = officeScope(actor);
    const { grouped, offices, registryTotal } = await withTransaction(async (client) => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
      const grouped = await client.query<{ status: string; institution: string; category: string; n: string }>(
        "SELECT status, institution, category, COUNT(*) AS n FROM passes WHERE pass_type = 'CAMPUS' AND pass_office_visible($1, office_id) GROUP BY status, institution, category",
        [scope]
      );
      const offices = await client.query<OfficeStatistics>(
        `WITH offices AS (
           SELECT id, name FROM pass_offices
           UNION ALL SELECT 'unassigned', 'Unassigned'
         ), counts AS (
           SELECT COALESCE(office_id, 'unassigned') AS id, COUNT(*)::int AS total,
             (COUNT(*) FILTER (WHERE status IN ('DRAFT', 'PENDING_APPROVAL')))::int AS pending,
             (COUNT(*) FILTER (WHERE status = 'READY_TO_PRINT'))::int AS ready,
             (COUNT(*) FILTER (WHERE printed_count > 0 OR status IN ('PRINTED', 'ISSUED')))::int AS printed,
             (COUNT(*) FILTER (WHERE status = 'ISSUED'))::int AS issued,
             (COUNT(*) FILTER (WHERE status = 'REVOKED'))::int AS revoked
           FROM passes WHERE pass_type = 'CAMPUS' AND pass_office_visible($1, office_id) GROUP BY 1
         )
         SELECT o.id, o.name, COALESCE(c.total, 0) AS total, COALESCE(c.pending, 0) AS pending,
           COALESCE(c.ready, 0) AS ready, COALESCE(c.printed, 0) AS printed, COALESCE(c.issued, 0) AS issued,
           COALESCE(c.revoked, 0) AS revoked
         FROM offices o LEFT JOIN counts c USING (id)
         WHERE $1 IS NULL OR $1 = o.id ORDER BY o.id = 'unassigned', o.id = 'district', o.id`,
        [scope],
      );
      const registryTotal = includeRegistryTotal
        ? (await client.query<{ total: number }>('SELECT COUNT(*)::int AS total FROM passes WHERE pass_office_visible($1, office_id)', [scope])).rows[0].total
        : undefined;
      return { grouped: grouped.rows, offices: offices.rows, registryTotal };
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
      registryTotal,
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
      return this.createInTransaction(passData, actor, client);
    });
  }

  private async createInTransaction(
    passData: Record<string, unknown>,
    actor: SessionUser,
    client: PoolClient,
  ): Promise<PassEntity> {
    const requestedOffice = passData.office_id;
    let office = actor.officeId;
    if (managesAccounts(actor) && requestedOffice != null && requestedOffice !== '') {
      if (!isOfficeId(requestedOffice)) throw new Error('Choose a valid office.');
      office = requestedOffice;
    }
    passData.office_id = office;
    delete passData.authority_signature_url;
    blankToNull(passData);

    const status = actor.role === 'PRINT_TEAM' ? 'PENDING_APPROVAL' : (passData.status || 'READY_TO_PRINT');
    if (!['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'READY_TO_PRINT', 'REVOKED'].includes(String(status))) {
      throw new Error('Invalid status for a new pass.');
    }
    passData.status = status;
    if (passData.pass_type === 'POLICE_FORCE') {
      passData.distribution_status = passData.police_zone && passData.police_sector_number && passData.police_sector_name
        ? 'ASSIGNED'
        : 'PENDING_ASSIGNMENT';
    }
    passData.valid_from = '';
    passData.valid_to = PASS_VALID_TO;
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
  }

  async update(id: string, passData: Record<string, unknown>, actor: SessionUser): Promise<PassEntity> {
    return withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(6102028)');
      const params: unknown[] = [id];
      const access = this.accessCondition(actor, params);
      const existingRes = await client.query<PassEntity>(
        `SELECT * FROM passes WHERE id = $1 AND ${access} FOR UPDATE`,
        params
      );
      if (existingRes.rows.length === 0) {
        throw new Error('Pass not found.');
      }
      const existing = existingRes.rows[0];
      if (actor.role === 'POLICE_PRINT' && (Object.keys(passData).length !== 1 || !('photo_url' in passData))) {
        throw new Error('Police print operators may only update the photograph.');
      }
      const allowedCounterFields = new Set([
        'photo_url',
        'institution',
        'zone_a',
        'zone_b',
        'zone_c',
        'gate_zone_a',
        'gate_zone_b',
        'gate_zone_c',
      ]);
      const isCounterUpdate = Object.keys(passData).every((k) => allowedCounterFields.has(k));
      if (actor.role === 'PRINT_TEAM' && existing.status !== 'PENDING_APPROVAL' && !isCounterUpdate) {
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
      if (existing.pass_type === 'POLICE_FORCE' && ['PRINTED', 'ISSUED'].includes(String(passData.status))) {
        throw new Error('Use the police print and handover actions to update this status.');
      }
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

      blankToNull(passData);
      // A new zone / sector clears the duty point unless a point is supplied with it.
      if (!('police_point_code' in passData) && (['police_zone', 'police_sector_number', 'police_sector_name'] as const)
        .some(key => key in passData && (passData[key] || null) !== (existing[key] || null))) {
        passData.police_point_code = null;
        passData.police_point_name = null;
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
      if (existing.pass_type === 'POLICE_FORCE' &&
          ['ASSIGNED', 'PENDING_ASSIGNMENT', null, undefined].includes(existing.distribution_status)) {
        cleanData.distribution_status = merged.police_zone && merged.police_sector_number && merged.police_sector_name
          ? 'ASSIGNED'
          : 'PENDING_ASSIGNMENT';
      }
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
      return await this.findById(updated.id, actor, client) || updated;
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
      if (status === 'PRINTED' || status === 'ISSUED') {
        const { rows: [pass] } = await client.query<PassEntity>(
          'SELECT pass_type, status FROM passes WHERE id = $1 AND pass_office_visible($2, office_id) FOR UPDATE',
          [id, officeScope(actor)],
        );
        if (!pass) throw new Error('Pass not found.');
        if (pass.pass_type === 'POLICE_FORCE' && pass.status !== status) {
          throw new Error('Use the police print and handover actions to update this status.');
        }
      }
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
    preview = false,
    confirmationId?: string,
    expectedVersions?: Record<string, string>,
    printStartedAt = new Date().toISOString(),
  ): Promise<{ updated: PassEntity[]; successCount: number }> {
    const uniqueIds = Array.from(new Set(ids));
    if (uniqueIds.length === 0 || uniqueIds.length > 500) {
      throw new Error('Select 1–500 passes.');
    }

    return withTransaction(async (client) => {
      const params: unknown[] = [uniqueIds];
      const access = this.accessCondition(actor, params);
      const existingRes = await client.query<PassEntity>(
        `SELECT * FROM passes WHERE id = ANY($1) AND ${access} ORDER BY id FOR UPDATE`,
        params
      );

      if (existingRes.rows.length !== uniqueIds.length) {
        throw new Error('One or more passes were not found.');
      }

      const changed = expectedVersions && existingRes.rows.find(
        pass => new Date(pass.updated_at).getTime() !== Date.parse(expectedVersions[pass.id]),
      );
      if (changed) {
        throw new Error(`The pass changed (${changed.pass_number}). Reopen the print preview before printing.`);
      }

      const confirmationTag = confirmationId ? ` [Print confirmation ${confirmationId}]` : '';
      // The pass locks also serialize retries for the same confirmation.
      const alreadyRecorded = new Set<string>();
      if (confirmationTag && !preview) {
        const result = await client.query<{ pass_id: string }>(
          `SELECT pass_id FROM audit_logs
           WHERE pass_id = ANY($1) AND performed_by = $2
             AND action IN ('PASS_PRINT_REQUESTED', 'REPRINT_REQUESTED')
             AND right(details, length($3::text)) = $3`,
          [uniqueIds, actor.email, confirmationTag]
        );
        for (const row of result.rows) alreadyRecorded.add(row.pass_id);
      }

      const pending = existingRes.rows.filter(pass => !alreadyRecorded.has(pass.id));
      const invalid = pending.find(pass => !canPrintPassStatus(pass));
      if (invalid) {
        throw new Error(invalid.pass_type === 'POLICE_FORCE'
          ? `${invalid.pass_number}: This police pass cannot be printed in its current status.`
          : 'Only approved cards in Ready to Print or Printed status may be printed.');
      }
      const unassigned = pending.find(needsCampusPrintZone);
      if (unassigned) {
        throw new Error(`${unassigned.pass_number}: ${CAMPUS_PRINT_ZONE_REQUIRED}`);
      }
      for (const pass of pending) {
        if (pass.pass_type !== 'POLICE_FORCE') continue;
        const blocker = policePrintBlocker(pass);
        if (blocker) throw new Error(`${pass.pass_number}: ${blocker}`);
      }

      if (preview) return { updated: [], successCount: existingRes.rows.length };
      if (pending.length === 0) return { updated: existingRes.rows, successCount: existingRes.rows.length };

      const updateRes = await client.query<PassEntity>(
        `UPDATE passes
         SET status = 'PRINTED',
             printed_count = printed_count + 1,
             last_printed_at = $3,
             last_printed_by = $2,
             valid_from = $4,
             valid_to = $5,
             updated_at = NOW()
         WHERE id = ANY($1) RETURNING *`,
        [pending.map(pass => pass.id), actor.email, printStartedAt, toConferenceDate(printStartedAt), PASS_VALID_TO]
      );

      const action = reason ? 'REPRINT_REQUESTED' : 'PASS_PRINT_REQUESTED';
      const details = (
        reason || (confirmationTag
          ? 'Operator confirmed the badge printed.'
          : 'Authorized print request recorded; physical output must be confirmed at the station.')
      ) + confirmationTag;

      for (const pass of updateRes.rows) {
        await client.query(
          `INSERT INTO audit_logs (pass_id, pass_number, action, performed_by, user_role, details)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [pass.id, pass.pass_number, action, actor.email, actor.role, details]
        );
      }

      return {
        updated: [...updateRes.rows, ...existingRes.rows.filter(pass => alreadyRecorded.has(pass.id))],
        successCount: existingRes.rows.length,
      };
    });
  }

  async issuePolicePass(id: string, actor: SessionUser): Promise<PassEntity> {
    return withTransaction(async client => {
      const params: unknown[] = [id];
      const access = this.accessCondition(actor, params);
      const { rows: [pass] } = await client.query<PassEntity>(
        `SELECT * FROM passes WHERE id = $1 AND pass_type = 'POLICE_FORCE' AND ${access} FOR UPDATE`,
        params,
      );
      if (!pass) throw new Error('Police pass not found.');
      if (pass.status === 'ISSUED' && pass.distribution_status === 'COLLECTED') return pass;
      if (pass.status !== 'PRINTED' || pass.printed_count < 1) {
        throw new Error('Confirm a successful print before issuing the badge.');
      }
      const { rows: [issued] } = await client.query<PassEntity>(
        `UPDATE passes SET status = 'ISSUED', distribution_status = 'COLLECTED',
         collected_by_officer = true, collected_at = NOW(), handover_officer_name = $2,
         updated_at = NOW() WHERE id = $1 RETURNING *`,
        [id, actor.name],
      );
      await client.query(
        `INSERT INTO audit_logs (pass_id, pass_number, action, performed_by, user_role, details, office_id)
         VALUES ($1, $2, 'POLICE_PASS_ISSUED', $3, $4, 'Badge handed to cardholder.', $5)`,
        [id, issued.pass_number, actor.email, actor.role, issued.office_id],
      );
      return issued;
    });
  }

  async bulkAssignZones(
    ids: string[],
    zones: {
      zone_a: boolean;
      zone_b: boolean;
      zone_c: boolean;
      gate_zone_a?: string;
      gate_zone_b?: string;
      gate_zone_c?: string;
      dept_hostel_quarter?: string;
    },
    actor: SessionUser
  ): Promise<{ updatedCount: number }> {
    const uniqueIds = Array.from(new Set(ids));
    if (uniqueIds.length === 0 || uniqueIds.length > 500) {
      throw new Error('Select 1–500 passes to assign zones.');
    }

    return withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(6102028)');
      const scope = officeScope(actor);

      const updateRes = await client.query<{ id: string; pass_number: string }>(
        `UPDATE passes
         SET zone_a = $2,
             zone_b = $3,
             zone_c = $4,
             gate_zone_a = $5,
             gate_zone_b = $6,
             gate_zone_c = $7,
             dept_hostel_quarter = COALESCE($8, dept_hostel_quarter),
             updated_at = NOW()
         WHERE id = ANY($1) AND pass_office_visible($9, office_id)
         RETURNING id, pass_number`,
        [
          uniqueIds,
          zones.zone_a,
          zones.zone_b,
          zones.zone_c,
          zones.gate_zone_a || null,
          zones.gate_zone_b || null,
          zones.gate_zone_c || null,
          zones.dept_hostel_quarter || null,
          scope,
        ]
      );

      const zoneTags = [
        zones.zone_a ? 'Zone A' : '',
        zones.zone_b ? 'Zone B' : '',
        zones.zone_c ? 'Zone C' : '',
      ].filter(Boolean).join(', ') || 'No Zones';

      for (const pass of updateRes.rows) {
        await client.query(
          `INSERT INTO audit_logs (pass_id, pass_number, action, performed_by, user_role, details, office_id)
           VALUES ($1, $2, 'PASS_ZONES_UPDATED', $3, $4, $5, $6)`,
          [
            pass.id,
            pass.pass_number,
            actor.email,
            actor.role,
            `Bulk security zones assigned: ${zoneTags}.`,
            actor.officeId || null,
          ]
        );
      }

      return { updatedCount: updateRes.rowCount ?? 0 };
    });
  }

  async getPoliceForceStatistics(actor: SessionUser): Promise<{
    total: number;
    pendingDuty: number;
    dutyAssigned: number;
    printed: number;
    collected: number;
    byZone: { zone: string; count: number }[];
    byCounter: { counterId: string; count: number }[];
    districts: string[];
  }> {
    const scope: unknown[] = [];
    const access = this.accessCondition(actor, scope);
    const mainRes = await query<{
      total: string;
      pending_duty: string;
      duty_assigned: string;
      printed: string;
      collected: string;
      districts: string[];
    }>(
      `SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE distribution_status = 'PENDING_ASSIGNMENT') as pending_duty,
        COUNT(*) FILTER (WHERE distribution_status = 'ASSIGNED') as duty_assigned,
        COUNT(*) FILTER (WHERE status = 'PRINTED' OR printed_count > 0) as printed,
        COUNT(*) FILTER (WHERE distribution_status = 'COLLECTED' OR collected_by_officer = TRUE) as collected,
        ARRAY_AGG(DISTINCT ${policeDistrict}) AS districts
       FROM passes
       WHERE pass_type = 'POLICE_FORCE' AND ${access}`,
      scope
    );

    const zonesRes = await query<{ zone: string; count: string }>(
      `SELECT COALESCE(police_zone, 'Unassigned') as zone, COUNT(*)::text as count
       FROM passes
       WHERE pass_type = 'POLICE_FORCE' AND ${access}
       GROUP BY police_zone
       ORDER BY COUNT(*) DESC`,
      scope
    );

    const countersRes = await query<{ counter_id: string; count: string }>(
      `SELECT COALESCE(issuing_counter_id, 'Unassigned') as counter_id, COUNT(*)::text as count
       FROM passes
       WHERE pass_type = 'POLICE_FORCE' AND ${access}
       GROUP BY issuing_counter_id
       ORDER BY COUNT(*) DESC`,
      scope
    );

    const row = mainRes.rows[0] || {
      total: '0',
      pending_duty: '0',
      duty_assigned: '0',
      printed: '0',
      collected: '0',
      districts: [],
    };

    return {
      total: parseInt(row.total, 10),
      pendingDuty: parseInt(row.pending_duty, 10),
      dutyAssigned: parseInt(row.duty_assigned, 10),
      printed: parseInt(row.printed, 10),
      collected: parseInt(row.collected, 10),
      byZone: zonesRes.rows.map((r) => ({ zone: r.zone, count: parseInt(r.count, 10) })),
      byCounter: countersRes.rows.map((r) => ({ counterId: r.counter_id, count: parseInt(r.count, 10) })),
      districts: [...new Map((row.districts || []).sort((a, b) => a.localeCompare(b))
        .map(district => [district.toLowerCase(), district])).values()],
    };
  }

  async batchAssignPoliceDutyPostings(
    items: Array<{
      police_id_number?: string;
      mobile_number?: string;
      police_zone: string;
      police_sector_number: string;
      police_sector_name: string;
      police_custom_sector?: string;
      security_component?: string;
      issuing_counter_id?: string;
    }>,
    actor: SessionUser
  ): Promise<{
    totalProcessed: number;
    matchedCount: number;
    unmatchedCount: number;
    unmatchedItems: Array<{ police_id_number?: string; mobile_number?: string; reason: string }>;
  }> {
    if (!items || items.length === 0) {
      return { totalProcessed: 0, matchedCount: 0, unmatchedCount: 0, unmatchedItems: [] };
    }

    return withTransaction(async (client) => {
      // 1. High-speed pre-fetch of all eligible POLICE_FORCE passes in current actor office scope
      const candidatesRes = await client.query<{
        id: string;
        pass_number: string;
        police_id_number: string | null;
        govt_id_number: string;
        mobile_number: string;
      }>(
        `SELECT id, pass_number, police_id_number, govt_id_number, mobile_number
         FROM passes
         WHERE pass_type = 'POLICE_FORCE' AND pass_office_visible($1, office_id)`,
        [officeScope(actor)]
      );

      // 2. Build O(1) indexed lookup tables in memory
      const idMap = new Map<string, { id: string; pass_number: string }>();
      const mobileMap = new Map<string, { id: string; pass_number: string }>();

      for (const row of candidatesRes.rows) {
        if (row.police_id_number && row.police_id_number.trim()) {
          idMap.set(row.police_id_number.trim().toLowerCase(), { id: row.id, pass_number: row.pass_number });
        }
        if (row.govt_id_number && row.govt_id_number.trim()) {
          idMap.set(row.govt_id_number.trim().toLowerCase(), { id: row.id, pass_number: row.pass_number });
        }
        const cleanMob = row.mobile_number ? row.mobile_number.trim().replace(/[^0-9]/g, '') : '';
        if (cleanMob.length >= 10) {
          mobileMap.set(cleanMob.slice(-10), { id: row.id, pass_number: row.pass_number });
        }
      }

      // 3. Reconcile input items against indexed records
      const matchedUpdates: Array<{
        id: string;
        pass_number: string;
        police_zone: string;
        police_sector_number: string;
        police_sector_name: string;
        police_custom_sector: string | null;
        security_component: string | null;
        issuing_counter_id: string | null;
      }> = [];

      const unmatchedItems: Array<{ police_id_number?: string; mobile_number?: string; reason: string }> = [];

      for (const item of items) {
        const pId = item.police_id_number ? item.police_id_number.trim() : null;
        const mob = item.mobile_number ? item.mobile_number.trim().replace(/[^0-9]/g, '') : null;

        if (!pId && !mob) {
          unmatchedItems.push({ reason: 'Missing both Police ID and Mobile Number' });
          continue;
        }

        let match: { id: string; pass_number: string } | undefined;
        if (pId) {
          match = idMap.get(pId.toLowerCase());
        }
        if (!match && mob) {
          const mobSuffix = mob.length >= 10 ? mob.slice(-10) : mob;
          match = mobileMap.get(mobSuffix);
        }

        if (!match) {
          unmatchedItems.push({
            police_id_number: pId || undefined,
            mobile_number: mob || undefined,
            reason: 'No matching police officer found in records',
          });
          continue;
        }

        matchedUpdates.push({
          id: match.id,
          pass_number: match.pass_number,
          police_zone: item.police_zone,
          police_sector_number: item.police_sector_number,
          police_sector_name: item.police_sector_name,
          police_custom_sector: item.police_custom_sector || null,
          security_component: item.security_component || null,
          issuing_counter_id: item.issuing_counter_id || null,
        });
      }

      // 4. Perform chunked bulk updates using PostgreSQL UNNEST (500 items per batch)
      const CHUNK_SIZE = 500;
      for (let i = 0; i < matchedUpdates.length; i += CHUNK_SIZE) {
        const chunk = matchedUpdates.slice(i, i + CHUNK_SIZE);

        const ids = chunk.map((c) => c.id);
        const zones = chunk.map((c) => c.police_zone);
        const secNums = chunk.map((c) => c.police_sector_number);
        const secNames = chunk.map((c) => c.police_sector_name);
        const customSecs = chunk.map((c) => c.police_custom_sector);
        const secComps = chunk.map((c) => c.security_component);
        const counters = chunk.map((c) => c.issuing_counter_id);

        await client.query(
          `UPDATE passes AS p
           SET police_zone = u.police_zone,
               police_sector_number = u.police_sector_number,
               police_sector_name = u.police_sector_name,
               police_custom_sector = u.police_custom_sector,
               security_component = u.security_component,
               issuing_counter_id = COALESCE(u.issuing_counter_id, p.issuing_counter_id),
               distribution_status = CASE WHEN p.distribution_status = 'COLLECTED' OR p.collected_by_officer
                 THEN p.distribution_status ELSE 'ASSIGNED' END,
               updated_at = NOW()
           FROM (
             SELECT * FROM UNNEST(
               $1::uuid[],
               $2::varchar[],
               $3::varchar[],
               $4::varchar[],
               $5::varchar[],
               $6::varchar[],
               $7::varchar[]
             ) AS t(id, police_zone, police_sector_number, police_sector_name, police_custom_sector, security_component, issuing_counter_id)
           ) AS u
           WHERE p.id = u.id`,
          [ids, zones, secNums, secNames, customSecs, secComps, counters]
        );

        // Bulk insert audit logs for this chunk
        await client.query(
          `INSERT INTO audit_logs (pass_id, pass_number, action, performed_by, user_role, details, office_id)
           SELECT u.id, p.pass_number, 'DUTY_ASSIGNED', $1, $2, 'Duty posting assigned: ' || u.police_zone || ' - ' || u.police_sector_name, p.office_id
           FROM (
             SELECT * FROM UNNEST(
               $3::uuid[],
               $4::varchar[],
               $5::varchar[]
             ) AS t(id, police_zone, police_sector_name)
           ) AS u
           JOIN passes p ON p.id = u.id`,
          [actor.email, actor.role, ids, zones, secNames]
        );
      }

      return {
        totalProcessed: items.length,
        matchedCount: matchedUpdates.length,
        unmatchedCount: unmatchedItems.length,
        unmatchedItems,
      };
    });
  }

  async upsertPolicePass(
    passData: Record<string, unknown>,
    actor: SessionUser
  ): Promise<{ pass: PassEntity; isNew: boolean }> {
    return withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(6102028)');
      const pId = (passData.police_id_number as string)?.trim() || null;
      const aadhaar = (passData.govt_id_number as string)?.trim() || null;
      const cleanMob = (passData.mobile_number as string)?.trim().replace(/[^0-9]/g, '') || null;
      const mobSuffix = cleanMob && cleanMob.length >= 10 ? cleanMob.slice(-10) : cleanMob;
      const fullName = (passData.full_name as string)?.trim() || null;

      // Look for an existing police pass
      let existingPass: PassEntity | null = null;
      if (pId || aadhaar || (fullName && mobSuffix)) {
        const queryRes = await client.query<PassEntity>(
          `SELECT * FROM passes
           WHERE pass_type = 'POLICE_FORCE'
             AND (
               ($1::text IS NOT NULL AND LOWER(police_id_number) = LOWER($1))
               OR ($2::text IS NOT NULL AND govt_id_number = $2)
               OR ($3::text IS NOT NULL AND $4::text IS NOT NULL AND LOWER(TRIM(full_name)) = LOWER(TRIM($3)) AND RIGHT(REGEXP_REPLACE(mobile_number, '[^0-9]', '', 'g'), 10) = $4)
             )
           LIMIT 2`,
          [pId, aadhaar, fullName, mobSuffix]
        );
        if (queryRes.rows.length > 1) {
          throw new Error('The identifiers match multiple police officers. Check the Police ID, Aadhaar and mobile number.');
        }
        existingPass = queryRes.rows[0] || null;
      }

      if (existingPass) {
        if (aadhaar && existingPass.govt_id_number && aadhaar !== existingPass.govt_id_number) {
          throw new Error('The Aadhaar number does not match the existing officer.');
        }
        const sameName = fullName?.replace(/[^\p{L}\p{N}]/gu, '').toUpperCase() ===
          existingPass.full_name.replace(/[^\p{L}\p{N}]/gu, '').toUpperCase();
        const incomingDistrict = (passData.police_unit_district as string | undefined)?.trim().toLowerCase();
        const existingDistrict = existingPass.police_unit_district?.trim().toLowerCase();
        const sameOfficerId = pId && pId.toLowerCase() === existingPass.police_id_number?.trim().toLowerCase() &&
          incomingDistrict && incomingDistrict === existingDistrict;
        if (!sameName && !sameOfficerId) {
          throw new Error('The Aadhaar or Police ID matches a record with a different officer name. Check the identifiers before importing.');
        }
        // Update existing police pass with new duty/proforma info
        const replaceDuty = ['police_zone', 'police_sector_number', 'police_sector_name', 'police_point_code'].some(key => key in passData);
        const pointCode = replaceDuty ? passData.police_point_code || null : existingPass.police_point_code ?? null;
        const pointName = replaceDuty ? passData.police_point_name || null : existingPass.police_point_name ?? null;
        const zone = replaceDuty ? passData.police_zone || null : existingPass.police_zone;
        const sectorNo = replaceDuty ? passData.police_sector_number || null : existingPass.police_sector_number;
        const sectorName = replaceDuty ? passData.police_sector_name || null : existingPass.police_sector_name;
        const sameDuty = zone === existingPass.police_zone &&
          sectorNo === existingPass.police_sector_number && sectorName === existingPass.police_sector_name;
        const customSector = sectorName === 'OTHERS'
          ? passData.police_custom_sector || (sameDuty ? existingPass.police_custom_sector : null)
          : null;
        const securityComp = (passData.security_component as string)?.trim() || existingPass.security_component;
        const counterId = (passData.issuing_counter_id as string)?.trim() || existingPass.issuing_counter_id;
        const rank = (passData.rank as string)?.trim() || existingPass.rank;
        const unit = (passData.police_unit_district as string)?.trim() || existingPass.police_unit_district;
        const father = (passData.father_or_spouse_name as string)?.trim() || existingPass.father_or_spouse_name;
        const hasDuty = Boolean(zone && sectorNo && sectorName);
        const updatedName = fullName || existingPass.full_name;

        const updateRes = await client.query<PassEntity>(
          `UPDATE passes
           SET rank = COALESCE($2, rank),
               father_or_spouse_name = COALESCE($3, father_or_spouse_name),
               police_unit_district = COALESCE($4, police_unit_district),
               institution_other = COALESCE($4, institution_other),
               police_zone = $5,
               police_sector_number = $6,
               police_sector_name = $7,
               security_component = $8,
               issuing_counter_id = $9,
               distribution_status = CASE
                 WHEN NOT $18::boolean OR distribution_status = 'COLLECTED' OR collected_by_officer THEN distribution_status
                 WHEN $10::boolean THEN 'ASSIGNED'
                 ELSE 'PENDING_ASSIGNMENT'
               END,
               full_name = $11,
               designation_or_trade = COALESCE($2, designation_or_trade),
               police_id_number = COALESCE($12, police_id_number),
               mobile_number = COALESCE($13, mobile_number),
               govt_id_number = COALESCE($14, govt_id_number),
               photo_url = COALESCE($15, photo_url),
               qr_payload = $16,
               police_custom_sector = $17,
               police_point_code = $19,
               police_point_name = $20,
               date_of_birth = COALESCE($21::date, date_of_birth),
               age_years = COALESCE($22::smallint, age_years),
               force_category = COALESCE($23, force_category),
               police_station = COALESCE($24, police_station),
               gender = COALESCE($25, gender),
               updated_at = NOW()
           WHERE id = $1
           RETURNING *`,
          [
            existingPass.id,
            rank,
            father,
            unit,
            zone,
            sectorNo,
            sectorName,
            securityComp,
            counterId,
            hasDuty,
            updatedName,
            pId,
            cleanMob,
            aadhaar,
            passData.photo_url ?? null,
            this.computeQrPayload({ ...existingPass, full_name: updatedName }),
            replaceDuty ? customSector : existingPass.police_custom_sector,
            replaceDuty,
            pointCode,
            pointName,
            passData.date_of_birth || null,
            passData.age_years ?? null,
            passData.force_category || (existingPass.force_category ? null : normalizeForce('', rank)),
            (passData.police_station as string | undefined)?.trim() || null,
            passData.gender || (existingPass.gender ? null : normalizeGender('', rank)),
          ]
        );

        await client.query(
          `INSERT INTO audit_logs (pass_id, pass_number, action, performed_by, user_role, details, office_id)
           VALUES ($1, $2, 'POLICE_PERSONNEL_UPDATED', $3, $4, 'Officer personnel record and bandobusth duty assignment updated via single import.', $5)`,
          [existingPass.id, existingPass.pass_number, actor.email, actor.role, actor.officeId || null]
        );

        return { pass: updateRes.rows[0], isNew: false };
      }

      // If not existing, create a new pass
      passData.rank ||= 'PC';
      passData.designation_or_trade ||= passData.rank;
      passData.father_or_spouse_name ||= '—';
      passData.police_unit_district ||= 'Tirupati';
      passData.institution_other ||= passData.police_unit_district;
      passData.force_category ||= normalizeForce('', passData.rank as string);
      passData.gender ||= normalizeGender('', passData.rank as string);
      const newPass = await this.createInTransaction(passData, actor, client);
      return { pass: newPass, isNew: true };
    });
  }
}
