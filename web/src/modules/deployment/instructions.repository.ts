/**
 * Duty instructions: created by the SP, visible to zone / sector logins whose scope overlaps the targets.
 */
import { query } from '@/infrastructure/db/pool';
import type { SessionUser } from '@/core/domain/entities/user.entity';
import type { PolicePrintScope } from '@/core/domain/police-print-scope';
import { instructionVisibleTo, type InstructionEntry, type InstructionInput } from '@/core/domain/duty-instructions';
import { deploymentScopeOf } from './deployment.repository';

export interface DutyInstruction {
  id: string;
  title: string;
  heading: string;
  closing: string;
  entries: InstructionEntry[];
  targets: PolicePrintScope[];
  status: 'ACTIVE' | 'WITHDRAWN';
  version: number;
  revision_note: string | null;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  withdrawn_at: string | null;
}

const fields = `id, title, heading, closing, entries, targets, status, version, revision_note,
  created_by, updated_by, created_at, updated_at, withdrawn_at`;

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
    `INSERT INTO duty_instructions (title, heading, closing, entries, targets, created_by, updated_by)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $6) RETURNING ${fields}`,
    [input.title, input.heading, input.closing, JSON.stringify(input.entries), JSON.stringify(input.targets), actor.email],
  );
  return res.rows[0];
}

/** Saves a new version with the SP's note on what changed. Withdrawn instructions are not edited. */
export async function updateInstruction(id: string, input: InstructionInput, note: string, actor: SessionUser): Promise<DutyInstruction | null> {
  const res = await query<DutyInstruction>(
    `UPDATE duty_instructions
        SET title = $2, heading = $3, closing = $4, entries = $5::jsonb, targets = $6::jsonb,
            version = version + 1, revision_note = $7, updated_by = $8, updated_at = NOW()
      WHERE id = $1 AND status = 'ACTIVE'
      RETURNING ${fields}`,
    [id, input.title, input.heading, input.closing, JSON.stringify(input.entries), JSON.stringify(input.targets), note, actor.email],
  );
  return res.rows[0] ?? null;
}

export async function withdrawInstruction(id: string, actor: SessionUser): Promise<DutyInstruction | null> {
  const res = await query<DutyInstruction>(
    `UPDATE duty_instructions
        SET status = 'WITHDRAWN', withdrawn_at = NOW(), updated_by = $2, updated_at = NOW()
      WHERE id = $1 AND status = 'ACTIVE'
      RETURNING ${fields}`,
    [id, actor.email],
  );
  return res.rows[0] ?? null;
}
