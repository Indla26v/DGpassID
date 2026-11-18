import { PassEntity } from '../domain/entities/pass.entity';
import { InstitutionType, CategoryType } from '../domain/types/pass-status.enum';

export interface PrintQueueFilter {
  search?: string;
  institution?: InstitutionType;
  category?: CategoryType;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface IPrintService {
  getQueue(filter?: PrintQueueFilter): Promise<{ passes: PassEntity[]; total: number }>;
  markSinglePrinted(id: string, operatorName: string): Promise<PassEntity>;
  markBatchPrinted(ids: string[], operatorName: string): Promise<{ successCount: number }>;
  requestReprint(id: string, reason: string, operatorName: string): Promise<PassEntity>;
}
