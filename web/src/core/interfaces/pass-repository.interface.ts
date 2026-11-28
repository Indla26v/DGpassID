import { PassEntity, CreatePassInput, UpdatePassInput } from '../domain/entities/pass.entity';
import { PassStatus, InstitutionType, CategoryType, PassType, PoliceDistributionStatus } from '../domain/types/pass-status.enum';

import type { SessionUser } from "../domain/entities/user.entity";
import type { OfficeId, OfficeStatistics } from "../domain/offices";

export type { CreatePassInput, UpdatePassInput };

export type PassFilterOptions = {
  search?: string;
  status?: PassStatus | string;
  passType?: PassType | string;
  policeZone?: string;
  policeSector?: string;
  policeRank?: string;
  policeDistrict?: string;
  issuingCounterId?: string;
  distributionStatus?: PoliceDistributionStatus | string;
  institution?: InstitutionType | string;
  category?: CategoryType | string;
  zone?: 'A' | 'B' | 'C';
  limit?: number;
  offset?: number;
  officeId?: string;
  department?: string;
  policePrintBatch?: boolean;
  recentlyUpdated?: boolean;
};

export type DuplicatePassResult = {
  id: string;
  pass_number: string;
  full_name: string;
  mobile_number: string;
  govt_id_type: string;
  govt_id_number: string;
  status: string;
  printed_count: number;
  created_at: string;
  office_id: OfficeId | null;
};

export type PassStatistics = {
  offices: OfficeStatistics[];
  total: number;
  registryTotal?: number;
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
};

export interface IReadablePassRepository {
  findById(id: string, actor: SessionUser): Promise<PassEntity | null>;
  findByIds(ids: string[], actor: SessionUser): Promise<PassEntity[]>;
  findByPassNumber(passNumber: string, actor: SessionUser): Promise<PassEntity | null>;
  findByVerificationToken(token: string, actor: SessionUser): Promise<PassEntity | null>;
  findDuplicate(
    fullName: string,
    mobileNumber: string,
    govtIdNumber: string,
    excludeId?: string | null
  ): Promise<DuplicatePassResult | null>;
  list(options: PassFilterOptions, isQueue: boolean, actor: SessionUser): Promise<{ passes: PassEntity[]; total: number }>;
  exportPasses(options: PassFilterOptions, actor: SessionUser): Promise<PassEntity[]>;
  getDepartmentCounts(actor: SessionUser): Promise<{ department: string; count: number }[]>;
  getStatistics(actor: SessionUser, includeRegistryTotal?: boolean): Promise<PassStatistics>;
  getPoliceForceStatistics(actor: SessionUser): Promise<{
    total: number;
    pendingDuty: number;
    dutyAssigned: number;
    printed: number;
    collected: number;
    byZone: { zone: string; count: number }[];
    byCounter: { counterId: string; count: number }[];
    districts: string[];
  }>;
}

export interface IWritablePassRepository {
  create(passData: Record<string, unknown>, actor: SessionUser): Promise<PassEntity>;
  update(id: string, passData: Record<string, unknown>, actor: SessionUser): Promise<PassEntity>;
  delete(id: string, actor: SessionUser): Promise<string>;
  updateStatus(id: string, status: PassStatus, actor: SessionUser): Promise<PassEntity>;
  sendToPrintTeam(id: string, actor: SessionUser): Promise<PassEntity>;
  recordPrintAction(ids: string[], actor: SessionUser, reason?: string, preview?: boolean, confirmationId?: string, expectedVersions?: Record<string, string>, printStartedAt?: string): Promise<{ updated: PassEntity[]; successCount: number }>;
  batchAssignPoliceDutyPostings(
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
  }>;
  bulkAssignZones(
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
  ): Promise<{ updatedCount: number }>;
  upsertPolicePass(
    passData: Record<string, unknown>,
    actor: SessionUser,
    /** aadhaarConflictAsNew: a row matching an officer by name / G.No but with a different Aadhaar is saved as a new
     * officer (conflictWith names the existing pass) instead of being refused. */
    options?: { aadhaarConflictAsNew?: boolean }
  ): Promise<{ pass: PassEntity; isNew: boolean; conflictWith?: string }>;
}

export interface IPassRepository extends IReadablePassRepository, IWritablePassRepository {}
