import { PassEntity } from '../domain/entities/pass.entity';

export interface PdfExportOptions {
  title?: string;
  subtitle?: string;
  officeName?: string;
  department?: string;
  statusFilter?: string;
}

export interface IPdfExportService {
  generatePdf(passes: PassEntity[], options?: PdfExportOptions): Uint8Array;
}
