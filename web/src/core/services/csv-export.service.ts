import { ICsvExportService, PassCsvColumn } from '../interfaces/csv-export-service.interface';
import { PassEntity } from '../domain/entities/pass.entity';
import { OFFICES } from '../domain/offices';
import { getPassValidFrom, PASS_VALID_TO } from '../domain/pass-validity';

export class CsvExportService implements ICsvExportService {
  private formatDate(val: unknown): string {
    if (!val) return '';
    if (val instanceof Date) {
      const year = val.getFullYear();
      const month = String(val.getMonth() + 1).padStart(2, '0');
      const day = String(val.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    const str = String(val).trim();
    const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return `${match[1]}-${match[2]}-${match[3]}`;
    }
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return str;
  }

  private readonly columns: PassCsvColumn[] = [
    { header: 'Pass Number', accessor: (p) => p.pass_number },
    { header: 'Full Name', accessor: (p) => p.full_name },
    { header: 'Father or Spouse Name', accessor: (p) => p.father_or_spouse_name },
    { header: 'Personnel Type', accessor: (p) => p.personnel_type || 'EXTERNAL' },
    {
      header: 'Subdivision / Office',
      accessor: (p) => OFFICES.find((o) => o.id === p.office_id)?.name ?? (p.office_id ? p.office_id : 'Unassigned'),
    },
    { header: 'Office ID', accessor: (p) => p.office_id || 'unassigned' },
    { header: 'Institution', accessor: (p) => p.institution },
    { header: 'Institution Details', accessor: (p) => p.institution_other || '' },
    { header: 'Category', accessor: (p) => p.category },
    { header: 'Category Details', accessor: (p) => p.category_other || '' },
    { header: 'Department', accessor: (p) => p.department },
    { header: 'Designation or Trade', accessor: (p) => p.designation_or_trade || '' },
    { header: 'Mobile Number', accessor: (p) => p.mobile_number },
    { header: 'Govt ID Type', accessor: (p) => p.govt_id_type },
    { header: 'Govt ID Number', accessor: (p) => p.govt_id_number },
    { header: 'Status', accessor: (p) => p.status },
    { header: 'Valid From', accessor: (p) => this.formatDate(getPassValidFrom(p)) },
    { header: 'Valid To', accessor: () => PASS_VALID_TO },
    { header: 'Approved By', accessor: (p) => p.approved_by || '' },
    { header: 'Approved At', accessor: (p) => this.formatDate(p.approved_at) },
  ];

  public sanitizeCellValue(value: unknown, isTextLiteral: boolean = false): string {
    if (value === null || value === undefined) {
      return '""';
    }

    let str = String(value);
    const trimmed = str.trim();

    // If explicitly marked as text literal, or if it is a pure numeric string of 10+ digits (e.g. 12-digit Aadhaar),
    // format as Excel text formula `="123456789012"` so Excel displays full digits without scientific notation
    if (isTextLiteral || /^\d{10,}$/.test(trimmed)) {
      const escaped = trimmed.replace(/"/g, '""');
      return `"=""${escaped}"""`;
    }

    // Prevent CSV formula injection (DDE / CSV Injection in Excel / Calc)
    if (/^[=+@\-\t\r]/.test(trimmed) || /^[=+@\-\t\r]/.test(str)) {
      str = `'${trimmed}`;
    } else {
      str = trimmed;
    }

    // Escape double quotes by doubling them
    const escaped = str.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  public generateCsv(passes: PassEntity[]): string {
    const headerRow = this.columns
      .map((col) => this.sanitizeCellValue(col.header))
      .join(',');

    const dataRows = passes.map((pass) => {
      return this.columns
        .map((col) => {
          const val = col.accessor(pass);
          const isGovtId = col.header === 'Govt ID Number';
          return this.sanitizeCellValue(val, isGovtId);
        })
        .join(',');
    });

    // Prepend UTF-8 Byte Order Mark (BOM) for Excel
    return '\uFEFF' + [headerRow, ...dataRows].join('\r\n');
  }
}
