export interface PersonnelImportSummary {
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

export interface PersonnelImportHistoryEntry extends PersonnelImportSummary {
  id: number;
  createdAt: string;
  importedBy: string;
}
