export interface PersonnelImportSummary {
  filename: string;
  detected: number;
  created: number;
  updated: number;
  needsReview: number;
  skipped: number;
  /** Rows imported with a problem (bad mobile, Aadhaar or photo left blank), listed for review. */
  flagged?: FlaggedImportRow[];
  /** Rows not imported (no name, or refused by the server), kept so they can be corrected and imported later. */
  pending?: PendingImportRow[];
  resume?: {
    fingerprint: string;
    importedRows: number[];
    skippedRows: number[];
  };
}

export interface FlaggedImportRow {
  row: number;
  name: string;
  policeId: string;
  issues: string[];
}

/** Fields of a held-back row that are kept and can be corrected in Re-review. */
export const PENDING_FIELDS = [
  'full_name', 'rank', 'police_id_number', 'mobile_number', 'govt_id_number', 'police_unit_district', 'police_station',
  'force_category', 'gender', 'date_of_birth', 'age_years', 'police_zone', 'police_sector_number', 'police_sector_name',
  'police_point_code', 'police_point_name', 'security_component', 'issuing_counter_id',
] as const;
export type PendingField = (typeof PENDING_FIELDS)[number];

export interface PendingImportRow {
  row: number;
  reason: string;
  record: Partial<Record<PendingField, string>>;
}

/** Most held-back rows kept with one history entry. */
export const MAX_PENDING_ROWS = 2000;

/** Keeps only the known fields of a parsed record, as text. */
export function pendingRecord(record: Record<string, unknown>): PendingImportRow['record'] {
  const kept: PendingImportRow['record'] = {};
  for (const field of PENDING_FIELDS) {
    const value = record[field];
    if (value !== undefined && value !== null && String(value).trim()) kept[field] = String(value).trim().slice(0, 255);
  }
  return kept;
}

/** Most flagged rows kept with one history entry. */
export const MAX_FLAGGED_ROWS = 2000;

export interface PersonnelImportHistoryEntry extends PersonnelImportSummary {
  id: number;
  createdAt: string;
  importedBy: string;
}
