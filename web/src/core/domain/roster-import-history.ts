export interface RosterImportSummary {
  filename: string;
  detected: number;
  created: number;
  updated: number;
  needsReview: number;
  skipped: number;
  resume?: {
    fingerprint: string;
    importedRows: number[];
    skippedRows: number[];
  };
}

export interface RosterImportHistoryEntry extends RosterImportSummary {
  id: number;
  createdAt: string;
  importedBy: string;
}
