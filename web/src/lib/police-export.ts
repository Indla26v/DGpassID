import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { displayRank } from '@/core/domain/ranks';
import { resolveDutyPosting } from '@/core/domain/police-zones';
import type { PoliceExportRow } from '@/modules/deployment/deployment.repository';

/** Police Force roster export (CSV / Excel / PDF) with the duty posting split into its parts. */
export const POLICE_EXPORT_COLUMNS = [
  'S.No', 'Pass No', 'Name', 'Rank', 'Rank (actual)', 'Police ID', 'District / Unit', 'Mobile', 'Age',
  'Zone', 'Sector', 'Sector name', 'Sub-sector', 'Point', 'Duty status', 'Print status',
] as const;

export function policeExportRecords(rows: PoliceExportRow[]): string[][] {
  return rows.map((row, index) => {
    const posting = resolveDutyPosting(row.police_zone, row.police_sector_number, row.police_sector_name);
    const sectorName = posting.subSector && posting.sector ? posting.sector.name
      : row.police_sector_name === 'OTHERS' && row.police_custom_sector ? row.police_custom_sector : row.police_sector_name ?? '';
    const age = row.date_of_birth
      ? String(new Date().getFullYear() - Number(row.date_of_birth.slice(0, 4)) - (new Date().toISOString().slice(5, 10) < row.date_of_birth.slice(5, 10) ? 1 : 0))
      : row.age_years ? String(row.age_years) : '';
    return [
      String(index + 1),
      row.pass_number,
      row.full_name,
      displayRank(row.rank),
      row.rank ?? '',
      row.police_id_number ?? '',
      row.district,
      row.mobile_number,
      age,
      row.police_zone ?? '',
      row.police_sector_number ?? '',
      sectorName,
      posting.subSector ?? '',
      row.police_point_name ?? '',
      row.police_zone ? (row.police_point_code ? 'On point' : 'Allotted') : 'Not allotted',
      row.printed_count > 0 || row.status === 'PRINTED' || row.status === 'ISSUED' ? 'Printed' : 'Not printed',
    ];
  });
}

const csvCell = (value: string) => {
  // Neutralise spreadsheet formulas and quote when needed.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function policeExportCsv(rows: PoliceExportRow[]): string {
  const lines = [POLICE_EXPORT_COLUMNS.join(','), ...policeExportRecords(rows).map(record => record.map(csvCell).join(','))];
  return '﻿' + lines.join('\r\n');
}

export function policeExportXlsx(rows: PoliceExportRow[], filterSummary: string): Uint8Array {
  const sheet = XLSX.utils.aoa_to_sheet([
    [`Police Force roster — ${filterSummary}`],
    [],
    [...POLICE_EXPORT_COLUMNS],
    ...policeExportRecords(rows),
  ]);
  sheet['!cols'] = [6, 18, 26, 9, 9, 14, 18, 13, 6, 26, 10, 32, 34, 34, 13, 12].map(wch => ({ wch }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Police Force');
  return XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}

// The built-in PDF font is Latin-1 only: swap typographic characters for plain ones.
const pdfText = (value: string) => value.replace(/[–—]/g, '-').replace(/·/g, '|').replace(/[‘’]/g, "'").replace(/[“”]/g, '"');

export function policeExportPdf(rows: PoliceExportRow[], summary: string): Uint8Array {
  const filterSummary = pdfText(summary);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const generated = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date()) + ' IST';
  const header = () => {
    doc.setFillColor(11, 37, 69);
    doc.rect(0, 0, pageWidth, 17, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('61st ALL INDIA DGsP / IGPs CONFERENCE - 2026 | POLICE FORCE ROSTER', 12, 8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(`${filterSummary}   |   Officers: ${rows.length}   |   Generated: ${generated}`, 12, 13.5);
  };
  // Narrower set of columns for print.
  const keep = [0, 2, 3, 5, 6, 7, 9, 10, 11, 12, 13, 14];
  autoTable(doc, {
    head: [keep.map(index => POLICE_EXPORT_COLUMNS[index])],
    body: policeExportRecords(rows).map(record => keep.map(index => pdfText(record[index]))),
    startY: 21,
    margin: { top: 21, left: 8, right: 8, bottom: 12 },
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 6.6, cellPadding: 1.3, overflow: 'linebreak', textColor: [30, 41, 59], lineColor: [226, 232, 240], lineWidth: 0.15 },
    headStyles: { fillColor: [11, 37, 69], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 0: { cellWidth: 8, halign: 'center' }, 1: { cellWidth: 30 }, 2: { cellWidth: 13 } },
    didDrawPage: () => {
      header();
      doc.setTextColor(100, 116, 139);
      doc.setFontSize(7);
      doc.text(`Page ${doc.getNumberOfPages()}`, pageWidth - 20, pageHeight - 5);
    },
  });
  return new Uint8Array(doc.output('arraybuffer'));
}
