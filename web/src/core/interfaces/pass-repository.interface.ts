import { PassEntity, CreatePassInput, UpdatePassInput } from '../domain/entities/pass.entity';
import { PassStatus, InstitutionType, CategoryType } from '../domain/types/pass-status.enum';

import type { SessionUser } from "../domain/entities/user.entity";
import type { OfficeId, OfficeStatistics } from "../domain/offices";

export type { CreatePassInput, UpdatePassInput };

export type PassFilterOptions = {
  search?: string;
  status?: PassStatus | string;
  institution?: InstitutionType | string;
  category?: CategoryType | string;
  zone?: 'A' | 'B' | 'C';
  limit?: number;
  offset?: number;
  officeId?: string;
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
  findByPassNumber(passNumber: string, actor: SessionUser): Promise<PassEntity | null>;
  findByVerificationToken(token: string, actor: SessionUser): Promise<PassEntity | null>;
  findDuplicate(
    fullName: string,
    mobileNumber: string,
    govtIdNumber: string,
    excludeId?: string | null
  ): Promise<DuplicatePassResult | null>;
  list(options: PassFilterOptions, isQueue: boolean, actor: SessionUser): Promise<{ passes: PassEntity[]; total: number }>;
  getStatistics(actor: SessionUser): Promise<PassStatistics>;
}

export interface IWritablePassRepository {
  create(passData: Record<string, unknown>, actor: SessionUser): Promise<PassEntity>;
  update(id: string, passData: Record<string, unknown>, actor: SessionUser): Promise<PassEntity>;
  delete(id: string, actor: SessionUser): Promise<string>;
  updateStatus(id: string, status: PassStatus, actor: SessionUser): Promise<PassEntity>;
  sendToPrintTeam(id: string, actor: SessionUser): Promise<PassEntity>;
  recordPrintAction(ids: string[], actor: SessionUser, reason?: string, preview?: boolean): Promise<{ updated: PassEntity[]; successCount: number }>;
}

export interface IPassRepository extends IReadablePassRepository, IWritablePassRepository {}
