import * as XLSX from 'xlsx-js-style';
import { jsPDF } from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';
import {
  buildSectorWiseBlocks, istTimestamp, SECTOR_WISE_COLUMNS, SECTOR_WISE_SUBTITLE, SECTOR_WISE_TITLE,
} from '@/core/domain/deployment-sheet';
import type { PoliceExportRow } from '@/modules/deployment/deployment.repository';

/**
 * Police Force export in the department's sector-wise "Final" format:
 * title rows, the S. No. / Rank / G.No. / Name / Place of working / Mobile No. / District header,
 * then a heading per Zone / Sector / Sub-sector / Point with its officers numbered from 1.
 */

const csvCell = (value: string) => {
  // Neutralise spreadsheet formulas and quote when needed.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function policeExportCsv(rows: PoliceExportRow[], filterSummary = ''): string {
  const width = SECTOR_WISE_COLUMNS.length;
  const line = (cells: string[]) => [...cells, ...Array(Math.max(0, width - cells.length)).fill('')].map(csvCell).join(',');
  const lines = [
    line([SECTOR_WISE_TITLE]),
    line([SECTOR_WISE_SUBTITLE]),
    ...(filterSummary ? [line([`${filterSummary} | Officers: ${rows.length} | Generated: ${istTimestamp()}`])] : []),
    line([...SECTOR_WISE_COLUMNS]),
  ];
  for (const block of buildSectorWiseBlocks(rows)) {
    lines.push(line([block.heading.join(' / ')]));
    for (const record of block.rows) lines.push(line(record));
  }
  return '﻿' + lines.join('\r\n');
}

const thin = { style: 'thin', color: { rgb: '94A3B8' } };
const box = { top: thin, bottom: thin, left: thin, right: thin };

export function policeExportXlsx(rows: PoliceExportRow[], filterSummary: string): Uint8Array {
  const width = SECTOR_WISE_COLUMNS.length;
  const aoa: string[][] = [];
  const merges: XLSX.Range[] = [];
  const kinds: ('title' | 'subtitle' | 'note' | 'header' | 'heading' | 'officer')[] = [];
  const full = (text: string, kind: (typeof kinds)[number]) => {
    merges.push({ s: { r: aoa.length, c: 0 }, e: { r: aoa.length, c: width - 1 } });
    aoa.push([text, ...Array(width - 1).fill('')]);
    kinds.push(kind);
  };

  full(SECTOR_WISE_TITLE, 'title');
  full(SECTOR_WISE_SUBTITLE, 'subtitle');
  full(`${filterSummary} | Officers: ${rows.length} | Generated: ${istTimestamp()}`, 'note');
  aoa.push([...SECTOR_WISE_COLUMNS]);
  kinds.push('header');
  for (const block of buildSectorWiseBlocks(rows)) {
    block.heading.forEach(text => full(text, 'heading'));
    for (const record of block.rows) {
      aoa.push(record);
      kinds.push('officer');
    }
  }

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet['!merges'] = merges;
  sheet['!cols'] = [8, 11, 13, 31, 26, 18, 17].map(wch => ({ wch }));
  kinds.forEach((kind, r) => {
    for (let c = 0; c < width; c += 1) {
      const ref = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[ref] ?? (sheet[ref] = { t: 's', v: '' });
      if (kind === 'title') cell.s = { font: { bold: true, sz: 14 }, alignment: { horizontal: 'center' } };
      else if (kind === 'subtitle') cell.s = { font: { bold: true, sz: 12, underline: true }, alignment: { horizontal: 'center' } };
      else if (kind === 'note') cell.s = { font: { italic: true, sz: 9, color: { rgb: '475569' } }, alignment: { horizontal: 'center' } };
      else if (kind === 'header') cell.s = { font: { bold: true }, fill: { patternType: 'solid', fgColor: { rgb: 'D9E1F2' } }, border: box, alignment: { horizontal: 'center', vertical: 'center', wrapText: true } };
      else if (kind === 'heading') cell.s = { font: { bold: true }, fill: { patternType: 'solid', fgColor: { rgb: 'EEF2F7' } }, border: box, alignment: { horizontal: 'left', vertical: 'center' } };
      else cell.s = { border: box, alignment: { vertical: 'center', horizontal: c === 0 ? 'center' : 'left', wrapText: c === 3 || c === 4 } };
    }
  });
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Final');
  return XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}

// The built-in PDF font is Latin-1 only: swap typographic characters for plain ones.
const pdfText = (value: string) => value.replace(/[–—]/g, '-').replace(/·/g, '|').replace(/[‘’]/g, "'").replace(/[“”]/g, '"');

export function policeExportPdf(rows: PoliceExportRow[], summary: string): Uint8Array {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const width = SECTOR_WISE_COLUMNS.length;

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(SECTOR_WISE_TITLE, pageWidth / 2, 12, { align: 'center' });
  doc.setFontSize(10.5);
  doc.text(SECTOR_WISE_SUBTITLE, pageWidth / 2, 18, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  const note = doc.splitTextToSize(pdfText(`${summary} | Officers: ${rows.length} | Generated: ${istTimestamp()}`), pageWidth - 20);
  doc.text(note, pageWidth / 2, 23, { align: 'center' });

  const body: RowInput[] = [];
  for (const block of buildSectorWiseBlocks(rows)) {
    body.push([{
      content: pdfText(block.heading.join('\n')),
      colSpan: width,
      styles: { fontStyle: 'bold', fillColor: [238, 242, 247], textColor: [15, 23, 42] },
    }]);
    for (const record of block.rows) body.push(record.map(pdfText));
  }

  autoTable(doc, {
    head: [[...SECTOR_WISE_COLUMNS]],
    body,
    startY: 24 + note.length * 3.2,
    margin: { top: 12, left: 8, right: 8, bottom: 12 },
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 7.4, cellPadding: 1.2, overflow: 'linebreak', textColor: [30, 41, 59], lineColor: [148, 163, 184], lineWidth: 0.15 },
    headStyles: { fillColor: [217, 225, 242], textColor: [15, 23, 42], fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { cellWidth: 11, halign: 'center' },
      1: { cellWidth: 16 },
      2: { cellWidth: 17 },
      3: { cellWidth: 48 },
      4: { cellWidth: 40 },
      5: { cellWidth: 24 },
      6: { cellWidth: 'auto' },
    },
    showHead: 'everyPage',
    didDrawPage: () => {
      doc.setTextColor(100, 116, 139);
      doc.setFontSize(7);
      doc.text(`Page ${doc.getNumberOfPages()}`, pageWidth - 20, pageHeight - 5);
    },
  });
  return new Uint8Array(doc.output('arraybuffer'));
}
