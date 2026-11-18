import { PassEntity, CreatePassInput, UpdatePassInput } from '../domain/entities/pass.entity';
import { PassStatus, InstitutionType, CategoryType } from '../domain/types/pass-status.enum';

export interface PassFilterOptions {
  search?: string;
  status?: PassStatus;
  institution?: InstitutionType;
  category?: CategoryType;
  zone?: 'A' | 'B' | 'C';
  limit?: number;
  offset?: number;
}

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

export interface IReadablePassRepository {
  findById(id: string): Promise<PassEntity | null>;
  findByPassNumber(passNumber: string): Promise<PassEntity | null>;
  findByVerificationToken(token: string): Promise<PassEntity | null>;
  list(options?: PassFilterOptions): Promise<{ passes: PassEntity[]; total: number }>;
  getStatistics(): Promise<PassStatistics>;
  getNextSequenceNumber(): Promise<number>;
}

export interface IWritablePassRepository {
  create(input: CreatePassInput, token: string, qrPayload: string): Promise<PassEntity>;
  update(id: string, input: UpdatePassInput): Promise<PassEntity | null>;
  delete(id: string): Promise<boolean>;
  updateStatus(id: string, status: PassStatus, operatorName?: string): Promise<PassEntity | null>;
}

export interface IPrintQueueRepository {
  getPrintQueue(options?: {
    search?: string;    institution?: InstitutionType;
    category?: CategoryType;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ passes: PassEntity[]; total: number }>;
  recordPrintAction(id: string, operatorName: string): Promise<PassEntity | null>;
  bulkRecordPrintAction(ids: string[], operatorName: string): Promise<number>;
}

export interface IPassRepository extends IReadablePassRepository, IWritablePassRepository, IPrintQueueRepository {}
