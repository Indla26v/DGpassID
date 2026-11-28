import { jsPDF } from 'jspdf';
import autoTable, { type CellInput, type RowInput } from 'jspdf-autotable';
import { POLICE_BANDOBUSHT_ZONES } from '@/core/domain/police-zones';
import { FORCE_LABELS, type ForceCategory } from '@/core/domain/ranks';
import { istTimestamp } from '@/core/domain/deployment-sheet';
import { DASHBOARD_COLUMNS, type ColumnCounts, type DashboardColumn, type MatrixNode, type PoliceDashboard } from '@/modules/deployment/dashboard';
import { pdfText } from './instruction-pdf';

type Color = [number, number, number];
const BAND: Color = [221, 217, 196];
const INK: Color = [0, 0, 0];
const MARGIN = 10;
const EXTRA_COLUMNS: DashboardColumn[] = ['RI', 'RSI', 'ARSI', 'ARHC', 'ARPC', 'Others'];

const sum = (counts: ColumnCounts) => Object.values(counts).reduce((total, value) => total + (value ?? 0), 0);
const minus = (from: ColumnCounts, parts: ColumnCounts[]): ColumnCounts => {
  const result: ColumnCounts = {};
  for (const column of DASHBOARD_COLUMNS) {
    const value = (from[column] ?? 0) - parts.reduce((total, part) => total + (part[column] ?? 0), 0);
    if (value > 0) result[column] = value;
  }
  return result;
};
/** "1(A) IISER main gate" -> ["1(A)", "IISER main gate"]. */
const splitSubSector = (name: string): [string, string] => {
  const match = /^(\d+\s*\([A-Z]\))\s*(.*)$/i.exec(name.trim());
  return match ? [match[1].replace(/\s+/g, ''), match[2]] : ['', name];
};
const sectorDigits = (number: string) => number.replace(/^Sector\s*/i, '');

/**
 * Zone-wise bandobast scheme as a PDF, in the layout of the "Zone Wise BB Scheme": a summary of all zones,
 * then one table per zone with its sectors and sub-sectors. Counts are the officers allotted in the app now
 * (not the scheme's planned strength).
 */
export function schemePdf(data: PoliceDashboard, options: { force?: string; zone?: string; district?: string } = {}): Uint8Array {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const width = pageW - MARGIN * 2;

  // AR / Others columns only when officers of those ranks are allotted, so totals always add up.
  const columns: DashboardColumn[] = [
    ...DASHBOARD_COLUMNS.filter(column => !EXTRA_COLUMNS.includes(column)),
    ...EXTRA_COLUMNS.filter(column => data.matrix.some(zone => (zone.counts[column] ?? 0) > 0)),
  ];
  const countCells = (counts: ColumnCounts, total: number, bold = false): CellInput[] => [
    ...columns.map(column => ({ content: counts[column] ? String(counts[column]) : '', styles: bold ? { fontStyle: 'bold' as const } : {} })),
    { content: total ? String(total) : '', styles: { fontStyle: 'bold' as const } },
  ];
  const head = (first: string, second: string) => [[first, second, ...columns, 'Total'].map(content => ({ content, styles: { halign: 'center' as const } }))];
  const lastY = () => (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? MARGIN;
  const rankWidth = (column: DashboardColumn) => column === 'Addl. SP' || column === 'ASI/HC' || column === 'Others' ? 13 : 9;
  const columnStyles = Object.fromEntries([
    [0, { cellWidth: 13, halign: 'center' as const }],
    [1, { cellWidth: 'auto' as const }],
    ...columns.map((column, index) => [index + 2, { cellWidth: rankWidth(column), halign: 'center' as const }]),
    [columns.length + 2, { cellWidth: 12, halign: 'center' as const }],
  ]);
  const table = (startY: number, firstHead: string, secondHead: string, body: RowInput[]) => autoTable(doc, {
    head: head(firstHead, secondHead),
    body,
    startY,
    margin: { left: MARGIN, right: MARGIN, bottom: 14 },
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8.2, cellPadding: 1.3, textColor: INK, lineColor: INK, lineWidth: 0.2, valign: 'middle', overflow: 'linebreak' },
    headStyles: { fillColor: [255, 255, 255], textColor: INK, fontStyle: 'bold' },
    columnStyles,
  });
  const band = (y: number, lines: string[]) => {
    const height = 4.2 + lines.length * 5;
    doc.setFillColor(...BAND);
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.2);
    doc.rect(MARGIN, y, width, height, 'FD');
    doc.setTextColor(...INK);
    lines.forEach((line, index) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(index === 0 ? 11.5 : 9.5);
      doc.text(pdfText(line), pageW / 2, y + 5.6 + index * 5, { align: 'center' });
    });
    return y + height;
  };

  // Title and the zone summary.
  let y = band(MARGIN, ['DGs/IGs Conference - 2026', 'Zone Wise BB Scheme']);
  const scope = [
    'Allotted strength',
    options.force ? `Force: ${FORCE_LABELS[options.force as ForceCategory] ?? options.force}` : '',
    options.zone ? `Zone: ${options.zone}` : '',
    options.district ? `District: ${options.district}` : '',
    `as on ${istTimestamp()}`,
  ].filter(Boolean).join('  |  ');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(pdfText(scope), pageW / 2, y + 4.5, { align: 'center' });
  y += 7;

  const grand: ColumnCounts = {};
  for (const zone of data.matrix) for (const column of columns) grand[column] = (grand[column] ?? 0) + (zone.counts[column] ?? 0);
  const zoneInfo = (node: MatrixNode) => POLICE_BANDOBUSHT_ZONES.find(zone => zone.name === node.key);
  table(y, 'Zone', 'Place of bandobust', [
    ...data.matrix.map(node => [String(zoneInfo(node)?.number ?? ''), pdfText(node.key), ...countCells(node.counts, node.total)]),
    [{ content: 'Grand Total', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold' } }, ...countCells(grand, sum(grand), true)],
  ]);
  y = lastY() + 8;

  // One table per zone.
  for (const node of data.matrix) {
    const zone = zoneInfo(node);
    if (!zone) continue;
    if (y > pageH - 50) { doc.addPage(); y = MARGIN; }
    y = band(y, [`Zone - ${zone.number} ${zone.name}`, ...(zone.subtitle ? [`(${zone.subtitle})`] : [])]);
    const hasSubSectors = zone.sectors.some(sector => sector.subSectors?.length);
    const body: RowInput[] = [];
    for (const sector of zone.sectors) {
      const sectorNode = node.children.find(child => child.key === `${zone.name}|${sector.number}`);
      const sectorCounts = sectorNode?.counts ?? {};
      if (sector.subSectors?.length) {
        body.push([{ content: pdfText(`Sector - ${sectorDigits(sector.number)} - ${sector.name}`), colSpan: columns.length + 3, styles: { fontStyle: 'bold', halign: 'left' } }]);
        const subCounts = sector.subSectors.map(sub => sectorNode?.children.find(child => child.key === `${zone.name}|${sector.number}|${sub}`)?.counts ?? {});
        const sectorLevel = minus(sectorCounts, subCounts);
        if (sum(sectorLevel)) body.push([sectorDigits(sector.number), 'Sector level (not on a sub-sector)', ...countCells(sectorLevel, sum(sectorLevel))]);
        sector.subSectors.forEach((sub, index) => {
          const [number, name] = splitSubSector(sub);
          body.push([number, pdfText(name), ...countCells(subCounts[index], sum(subCounts[index]))]);
        });
      } else {
        const style = hasSubSectors ? { fontStyle: 'bold' as const } : {};
        body.push([{ content: sectorDigits(sector.number), styles: style }, { content: pdfText(sector.name), styles: style },
          ...countCells(sectorCounts, sum(sectorCounts), hasSubSectors)]);
      }
    }
    body.push([{ content: 'Total', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold' } }, ...countCells(node.counts, node.total, true)]);
    table(y, 'S.No', hasSubSectors ? 'Point' : 'Sector Name', body);
    y = lastY() + 8;
  }

  // Page numbers.
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(90, 90, 90);
    doc.text(`Zone Wise BB Scheme (allotted)  |  Page ${page} of ${pages}`, pageW / 2, pageH - 6, { align: 'center' });
  }
  return new Uint8Array(doc.output('arraybuffer'));
}
