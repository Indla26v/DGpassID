export interface PassStatistics {
  offices: import('../domain/offices').OfficeStatistics[];
  total: number;
  draft: number;
  pendingApproval: number;
  approved: number;
  readyToPrint: number;
  printed: number;
  issued: number;
  revoked: number;
  byInstitution: {
    IISER: number;
    IIT: number;
    ICI?: number;
    ICU: number;
    Other: number;
  };
  byCategory: {
    Student: number;
    'Faculty/Staff': number;
    Worker: number;
    Other: number;
  };
}
