/**
 * Duty instructions: created by the SP, visible to zone / sector logins whose scope overlaps the targets.
 */
import { query } from '@/infrastructure/db/pool';
import type { SessionUser } from '@/core/domain/entities/user.entity';
import type { PolicePrintScope } from '@/core/domain/police-print-scope';
import { instructionVisibleTo, PASSPORT_FIELDS, type InstructionEntry, type InstructionInput, type InstructionTarget } from '@/core/domain/duty-instructions';
import { deploymentScopeOf } from './deployment.repository';

export interface DutyInstruction {
  id: string;
  title: string;
  heading: string;
  closing: string;
  entries: InstructionEntry[];
  targets: InstructionTarget[];
  status: 'ACTIVE' | 'WITHDRAWN';
  version: number;
  revision_note: string | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  withdrawn_at: string | null;
  /** Duty passport details: YYYY-MM-DD dates, text, or null when not set. */
  duty_from: string | null;
  duty_to: string | null;
  duty_hours: string | null;
  security_plan: string | null;
  place_of_duty: string | null;
  signatory: string | null;
  batch: string | null;
  back_title: string | null;
  back_points: string[];
  /** Display name of the login that created it (SP or a zone / sector officer). */
  creator_name: string | null;
}

const fields = `id, title, heading, closing, entries, targets, status, version, revision_note,
  created_by, updated_by, created_at, updated_at, withdrawn_at,
  to_char(duty_from, 'YYYY-MM-DD') AS duty_from, to_char(duty_to, 'YYYY-MM-DD') AS duty_to,
  duty_hours, security_plan, place_of_duty, signatory, batch, back_title, back_points,
  (SELECT u.name FROM app_users u WHERE LOWER(u.email) = LOWER(duty_instructions.created_by) LIMIT 1) AS creator_name`;

/** Zone / sector logins may change only the instructions they created; the SP may change any. */
const ownerOf = (actor: SessionUser) => (actor.role === 'ADMIN' ? null : actor.email);

/** Passport values in column order, blanks as null. */
const passportValues = (input: InstructionInput) =>
  PASSPORT_FIELDS.map(key => input[key] || null);

/** SP: every instruction. Zone / sector login: active instructions for their area only. */
export async function listInstructions(actor: SessionUser): Promise<DutyInstruction[]> {
  const scope = deploymentScopeOf(actor);
  const res = await query<DutyInstruction>(
    `SELECT ${fields} FROM duty_instructions ${scope === 'ALL' ? '' : "WHERE status = 'ACTIVE'"}
      ORDER BY (status = 'ACTIVE') DESC, updated_at DESC LIMIT 500`,
  );
  return scope === 'ALL' ? res.rows : res.rows.filter(row => instructionVisibleTo(row.targets, scope));
}

/** Null when it does not exist or the actor may not see it. */
export async function getInstruction(id: string, actor: SessionUser): Promise<DutyInstruction | null> {
  const res = await query<DutyInstruction>(`SELECT ${fields} FROM duty_instructions WHERE id = $1`, [id]);
  const row = res.rows[0];
  if (!row) return null;
  const scope = deploymentScopeOf(actor);
  if (scope === 'ALL') return row;
  return row.status === 'ACTIVE' && instructionVisibleTo(row.targets, scope) ? row : null;
}

export async function createInstruction(input: InstructionInput, actor: SessionUser): Promise<DutyInstruction> {
  const res = await query<DutyInstruction>(
    `INSERT INTO duty_instructions (title, heading, closing, entries, targets, created_by, updated_by,
       duty_from, duty_to, duty_hours, security_plan, place_of_duty, signatory, batch, back_title, back_points)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $6, $7::date, $8::date, $9, $10, $11, $12, $13, $14, $15::jsonb) RETURNING ${fields}`,
    [input.title, input.heading, input.closing, JSON.stringify(input.entries), JSON.stringify(input.targets), actor.email, ...passportValues(input),
      input.back_title || null, JSON.stringify(input.back_points)],
  );
  return res.rows[0];
}

/** Saves a new version with a note on what changed. Withdrawn instructions, and other logins' instructions for zone logins, are not edited. */
export async function updateInstruction(id: string, input: InstructionInput, note: string, actor: SessionUser): Promise<DutyInstruction | null> {
  const res = await query<DutyInstruction>(
    `UPDATE duty_instructions
        SET title = $2, heading = $3, closing = $4, entries = $5::jsonb, targets = $6::jsonb,
            duty_from = $9::date, duty_to = $10::date, duty_hours = $11, security_plan = $12, place_of_duty = $13, signatory = $14, batch = $15,
            back_title = $17, back_points = $18::jsonb,
            version = version + 1, revision_note = $7, updated_by = $8, updated_at = NOW()
      WHERE id = $1 AND status = 'ACTIVE' AND ($16::text IS NULL OR created_by = $16)
      RETURNING ${fields}`,
    [id, input.title, input.heading, input.closing, JSON.stringify(input.entries), JSON.stringify(input.targets), note, actor.email, ...passportValues(input), ownerOf(actor),
      input.back_title || null, JSON.stringify(input.back_points)],
  );
  return res.rows[0] ?? null;
}

export async function withdrawInstruction(id: string, actor: SessionUser): Promise<DutyInstruction | null> {
  const res = await query<DutyInstruction>(
    `UPDATE duty_instructions
        SET status = 'WITHDRAWN', withdrawn_at = NOW(), updated_by = $2, updated_at = NOW()
      WHERE id = $1 AND status = 'ACTIVE' AND ($3::text IS NULL OR created_by = $3)
      RETURNING ${fields}`,
    [id, actor.email, ownerOf(actor)],
  );
  return res.rows[0] ?? null;
}
