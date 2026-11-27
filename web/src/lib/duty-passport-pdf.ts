import fs from 'node:fs';
import path from 'node:path';
import { jsPDF } from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';
import QRCode from 'qrcode';
import { DEFAULT_BACK_TITLE, INSTRUCTION_COLUMNS, instructionRows } from '@/core/domain/duty-instructions';
import {
  PASSPORT_CONFERENCE, PASSPORT_LEAD, PASSPORT_TITLE, passportFields, passportIncharges, passportPeriodLine,
  type InchargeAllotment, type PassportOfficer, type SectorOfficer, type ZoneAccount,
} from '@/core/domain/duty-passport';
import type { DutyInstruction } from '@/modules/deployment/instructions.repository';
import { pdfText } from './instruction-pdf';

type Color = [number, number, number];
const RED: Color = [178, 34, 34];
const HEAD: Color = [30, 41, 59];
const SUB: Color = [51, 65, 85];
const INK: Color = [15, 23, 42];
const RULE: Color = [203, 213, 225];
const BORDER: Color = [71, 85, 105];
const LABEL_FILL: Color = [246, 248, 251];
const TABLE_HEAD_FILL: Color = [238, 242, 247];
const TABLE_LINE: Color = [148, 163, 184];
const PAGE_W = 210;
const MARGIN = 19;
const LABEL_W = 46;
const QR_COL_W = 34;
const QR_SIZE = 27;
const QR_ROWS = 4;

export interface PassportSignature {
  /** PNG / JPEG data URL of the SP's saved authority signature, or null. */
  imageUrl: string | null;
  /** Name block: the name (bold italic), then the designation lines. */
  lines: string[];
}

let logos: { left: string; right: string } | null = null;
function loadLogos() {
  if (!logos) {
    const read = (file: string) => `data:image/png;base64,${fs.readFileSync(path.join(process.cwd(), 'public', file)).toString('base64')}`;
    logos = { left: read('ap-police-logo.png'), right: read('tirupati-district-police-crest.png') };
  }
  return logos;
}

/** Draws the QR code as vector squares (crisp when printed, a few KB per page). */
function drawQr(doc: jsPDF, payload: string, x: number, y: number, size: number) {
  const { modules } = QRCode.create(payload, { errorCorrectionLevel: 'M' });
  const quiet = 1;
  const cell = size / (modules.size + quiet * 2);
  doc.setFillColor(255, 255, 255);
  doc.rect(x, y, size, size, 'F');
  doc.setFillColor(0, 0, 0);
  for (let row = 0; row < modules.size; row += 1) {
    let start = -1;
    for (let col = 0; col <= modules.size; col += 1) {
      const dark = col < modules.size && modules.data[row * modules.size + col];
      if (dark && start < 0) start = col;
      if (!dark && start >= 0) {
        // Slight overlap so neighbouring squares print without hairline gaps.
        doc.rect(x + (start + quiet) * cell, y + (row + quiet) * cell, (col - start) * cell + 0.02, cell + 0.02, 'F');
        start = -1;
      }
    }
  }
}

const lastY = (doc: jsPDF, fallback: number) => (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? fallback;

/** One A4 page per officer, in the Tirupati District duty passport layout. */
export function dutyPassportPdf(
  instruction: DutyInstruction,
  officers: PassportOfficer[],
  accounts: ZoneAccount[],
  signature: PassportSignature,
  allotments: InchargeAllotment[] = [],
  sectorOfficers: SectorOfficer[] = [],
): Uint8Array {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const { left, right } = loadLogos();
  const crest = doc.getImageProperties(right);
  const crestW = 20 * (crest.width / crest.height);
  const sign = signature.imageUrl ? doc.getImageProperties(signature.imageUrl) : null;
  const period = passportPeriodLine(instruction);
  const rows = instructionRows(instruction.entries).map(row => row.map(pdfText));
  const contentW = PAGE_W - MARGIN * 2;
  const backPoints = (instruction.back_points ?? []).map(point => point.trim()).filter(Boolean);
  const backTitle = instruction.back_title?.trim() || DEFAULT_BACK_TITLE;

  const write = (value: string, x: number, y: number, font: 'times' | 'helvetica', style: string, size: number, color: Color,
    options: { align?: 'left' | 'center' | 'right'; width?: number; charSpace?: number } = {}) => {
    doc.setFont(font, style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(pdfText(value), options.width ?? contentW) as string[];
    doc.text(lines, x, y, { align: options.align ?? 'left', lineHeightFactor: 1.3, charSpace: options.charSpace });
    return y + lines.length * size * 0.3528 * 1.3;
  };

  for (const [index, officer] of officers.entries()) {
    if (index > 0) doc.addPage();
    const qr = officer.qr_payload?.trim() || '';

    // Header: logos either side, title, conference line, duty period, rule.
    doc.addImage(left, 'PNG', MARGIN, 12, 20, 20, 'passport-left-logo', 'FAST');
    doc.addImage(right, 'PNG', PAGE_W - MARGIN - crestW, 12, crestW, 20, 'passport-right-logo', 'FAST');
    write(PASSPORT_TITLE, PAGE_W / 2, 21, 'times', 'bold', 22, RED, { align: 'center', charSpace: 0.4 });
    write(PASSPORT_CONFERENCE, PAGE_W / 2, 27.5, 'helvetica', 'bold', 8, HEAD, { align: 'center', charSpace: 0.15 });
    if (period) write(period, PAGE_W / 2, 32, 'helvetica', 'bold', 8, SUB, { align: 'center', width: 120 });
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.35);
    doc.line(MARGIN, 37, PAGE_W - MARGIN, 37);

    write(PASSPORT_LEAD, MARGIN, 45, 'times', 'bold', 11, INK);

    // Officer box: shaded label column, values, and the QR code in its own column beside the first rows.
    const fields = passportFields(officer, instruction);
    const body: RowInput[] = fields.map(([label, value], rowIndex) => {
      const valueCell = { content: pdfText(value) };
      if (!qr) return [pdfText(label), { ...valueCell, colSpan: 2 }];
      if (rowIndex === 0) return [pdfText(label), valueCell, { content: '', rowSpan: QR_ROWS }];
      if (rowIndex < QR_ROWS) return [pdfText(label), valueCell];
      return [pdfText(label), { ...valueCell, colSpan: 2 }];
    });
    const boxTop = 48.5;
    let qrCell: { x: number; y: number; width: number; height: number } | null = null;
    autoTable(doc, {
      body,
      startY: boxTop,
      margin: { left: MARGIN, right: MARGIN },
      tableWidth: contentW,
      theme: 'plain',
      pageBreak: 'avoid',
      styles: { font: 'helvetica', fontSize: 9.5, textColor: INK, cellPadding: { top: 2.5, bottom: 2.5, left: 3.5, right: 3 }, valign: 'middle' },
      columnStyles: {
        0: { cellWidth: LABEL_W, font: 'times', fontStyle: 'bold', fontSize: 10.5, textColor: HEAD, fillColor: LABEL_FILL },
        1: { cellWidth: 'auto' },
        2: { cellWidth: QR_COL_W },
      },
      didDrawCell: data => {
        const { cell } = data;
        if (data.column.index === 2) qrCell = { x: cell.x, y: cell.y, width: cell.width, height: cell.height };
        doc.setDrawColor(...RULE);
        doc.setLineWidth(0.2);
        const bottom = cell.y + cell.height;
        if (data.row.index + (cell.rowSpan ?? 1) < data.table.body.length) doc.line(cell.x, bottom, cell.x + cell.width, bottom);
        if (data.column.index > 0) doc.line(cell.x, cell.y, cell.x, bottom);
      },
    });
    const boxBottom = lastY(doc, boxTop);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.35);
    doc.roundedRect(MARGIN, boxTop, contentW, boxBottom - boxTop, 2.5, 2.5, 'S');
    const placed = qrCell as { x: number; y: number; width: number; height: number } | null;
    if (qr && placed) {
      const size = Math.min(QR_SIZE, placed.height - 4, placed.width - 4);
      drawQr(doc, qr, placed.x + (placed.width - size) / 2, placed.y + (placed.height - size) / 2, size);
    }

    // Reporting table from the duty instruction.
    let y = boxBottom + 8;
    if (instruction.heading) y = write(instruction.heading, MARGIN, y, 'times', 'bold', 11, INK) + 0.5;
    autoTable(doc, {
      head: [[...INSTRUCTION_COLUMNS]],
      body: rows,
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8.8, cellPadding: { top: 2, bottom: 2, left: 2.5, right: 2.5 }, textColor: INK, lineColor: TABLE_LINE, lineWidth: 0.2, valign: 'middle' },
      headStyles: { font: 'times', fontStyle: 'bold', fontSize: 10, fillColor: TABLE_HEAD_FILL, textColor: HEAD, halign: 'center' },
      columnStyles: {
        0: { cellWidth: 13, halign: 'center', textColor: RED },
        1: { cellWidth: 37, fontStyle: 'bold' },
        2: { cellWidth: 26, halign: 'center' },
        3: { cellWidth: 21, halign: 'center' },
        4: { cellWidth: 'auto' },
      },
      didParseCell: data => {
        if (data.section === 'head' && data.column.index > 0 && data.column.index < 4) data.cell.styles.halign = data.column.index === 1 ? 'left' : 'center';
        if (data.section === 'head' && data.column.index === 4) data.cell.styles.halign = 'left';
      },
    });
    y = lastY(doc, y) + 7;
    if (instruction.closing) y = write(instruction.closing, MARGIN, y, 'times', 'bold', 11, INK) + 3;

    // Footer: Sector Incharge and the next senior officers of the sector on the left, SP name block on the right.
    const { sectorIncharge, subSectorIncharge, topOfficers } = passportIncharges(officer, accounts, allotments, sectorOfficers);
    const footerTop = y + 4;
    let leftY = footerTop;
    const footerLines: [string, string][] = [
      ['Sector Incharge', sectorIncharge],
      ...(subSectorIncharge ? [['Sub-sector Incharge', subSectorIncharge] as [string, string]] : []),
      ...topOfficers.map(item => [item.rank, item.label] as [string, string]),
    ];
    for (const [label, value] of footerLines) {
      write(label, MARGIN, leftY, 'times', 'bold', 10, INK);
      leftY = write(`: ${value}`, MARGIN + 35, leftY, 'helvetica', 'normal', 9, SUB, { width: 70 }) + 1.6;
    }
    const centre = PAGE_W - MARGIN - 33;
    let rightY = footerTop - 2;
    if (sign && signature.imageUrl) {
      const height = Math.min(13, 40 * (sign.height / sign.width));
      const width = height * (sign.width / sign.height);
      doc.addImage(signature.imageUrl, sign.fileType, centre - width / 2, rightY - 4, width, height, 'passport-signature', 'FAST');
      rightY += height - 1;
    }
    signature.lines.forEach((line, lineIndex) => {
      rightY = lineIndex === 0
        ? write(line, centre, rightY, 'times', 'bolditalic', 10.5, HEAD, { align: 'center', width: 70 }) + 0.3
        : write(line, centre, rightY, 'times', 'normal', 9.5, INK, { align: 'center', width: 70 });
    });

    // Back side: Brief Instructions, right after the front so the file prints double-sided (flip on long edge).
    if (backPoints.length) {
      doc.addPage();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...SUB);
      doc.text(pdfText(PASSPORT_CONFERENCE), MARGIN, 16, { charSpace: 0.15 });
      doc.setFont('helvetica', 'normal');
      doc.text(pdfText(`${officer.full_name}${officer.police_id_number ? ` · G.No. ${officer.police_id_number}` : ''}`), PAGE_W - MARGIN, 16, { align: 'right' });
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.35);
      doc.line(MARGIN, 19, PAGE_W - MARGIN, 19);
      let backY = write(backTitle, PAGE_W / 2, 31, 'times', 'bold', 14, INK, { align: 'center', width: contentW - 10 }) + 4;
      for (const [index, point] of backPoints.entries()) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...INK);
        doc.text(`${index + 1}.`, MARGIN + 7, backY, { align: 'right' });
        backY = write(point, MARGIN + 10, backY, 'helvetica', 'normal', 10, INK, { width: contentW - 10 }) + 2.4;
      }
    }
  }

  return new Uint8Array(doc.output('arraybuffer'));
}
