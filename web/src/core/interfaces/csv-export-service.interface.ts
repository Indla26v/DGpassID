import { PassEntity } from '../domain/entities/pass.entity';

export interface PassCsvColumn {
  header: string;
  accessor: (pass: PassEntity) => string | number | boolean | null | undefined;
}

export interface ICsvExportService {
  generateCsv(passes: PassEntity[]): string;
  sanitizeCellValue(value: unknown): string;
}
