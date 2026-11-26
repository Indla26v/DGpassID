import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { describeTargets, INSTRUCTION_COLUMNS, instructionRows } from '@/core/domain/duty-instructions';
import { istTimestamp, SECTOR_WISE_TITLE } from '@/core/domain/deployment-sheet';
import type { DutyInstruction } from '@/modules/deployment/instructions.repository';

const NAVY: [number, number, number] = [31, 73, 112];
// The built-in PDF fonts are Latin-1 only: swap typographic characters for plain ones.
const pdfText = (value: string) => value.replace(/[–—]/g, '-').replace(/[·•]/g, '|').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...');

/** A4 duty instruction: header, heading line, S.No / Report Entities / Date / Time / Place table, closing line. */
export function instructionPdf(instruction: DutyInstruction): Uint8Array {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const width = doc.internal.pageSize.getWidth();
  const margin = 14;
  const text = (value: string, y: number, size: number, style: 'bold' | 'normal', color: [number, number, number], align: 'left' | 'center' = 'left') => {
    doc.setFont('times', style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(pdfText(value), width - margin * 2) as string[];
    doc.text(lines, align === 'center' ? width / 2 : margin, y, { align, lineHeightFactor: 1.35 });
    return y + lines.length * size * 0.3528 * 1.35;
  };

  let y = 14;
  y = text(SECTOR_WISE_TITLE, y, 13, 'bold', [15, 23, 42], 'center') + 1;
  y = text(instruction.title, y, 12, 'bold', NAVY, 'center');
  y = text(`Issued to: ${describeTargets(instruction.targets)}`, y + 1, 9, 'normal', [71, 85, 105], 'center');
  y = text(`Version ${instruction.version}  |  ${istTimestamp(new Date(instruction.updated_at))}${instruction.version > 1 && instruction.revision_note ? `  |  Updated: ${instruction.revision_note}` : ''}`,
    y, 8, 'normal', [100, 116, 139], 'center') + 4;
  if (instruction.heading) y = text(instruction.heading, y, 13, 'bold', NAVY) + 2;

  autoTable(doc, {
    head: [[...INSTRUCTION_COLUMNS]],
    body: instructionRows(instruction.entries).map(row => row.map(pdfText)),
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'grid',
    styles: { font: 'times', fontSize: 11, cellPadding: 3, textColor: [15, 23, 42], lineColor: NAVY, lineWidth: 0.35, valign: 'middle' },
    headStyles: { fillColor: [255, 255, 255], textColor: NAVY, fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { cellWidth: 17, halign: 'center' },
      1: { cellWidth: 42 },
      2: { cellWidth: 32, halign: 'center' },
      3: { cellWidth: 20, halign: 'center' },
      4: { cellWidth: 'auto' },
    },
  });

  const end = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
  if (instruction.closing) text(instruction.closing, end + 8, 13, 'bold', NAVY);
  return new Uint8Array(doc.output('arraybuffer'));
}
