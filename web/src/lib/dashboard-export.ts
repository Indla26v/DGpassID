/**
 * Excel downloads of the Police Force dashboard folders. Each sheet starts with the title and the filters in use,
 * then the table exactly as shown (the zone table includes every sector and sub-sector, opened or not).
 */
import type { ColumnCounts, DashboardColumn, MatrixNode } from '@/modules/deployment/dashboard';

type Row = (string | number)[];

async function download(fileBase: string, sheetName: string, title: string, filters: string, rows: Row[], widths: number[]) {
  const XLSX = await import('xlsx');
  const sheet = XLSX.utils.aoa_to_sheet([[title], [filters], [], ...rows]);
  sheet['!cols'] = widths.map(wch => ({ wch }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName.slice(0, 31));
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(book, `${fileBase}-${stamp}.xlsx`);
}

const requiredTotal = (node: MatrixNode) =>
  node.required ? Object.values(node.required).reduce((sum, value) => sum + (value ?? 0), 0) : '';

/** Zone wise deployment: one row per zone, sector and sub-sector, allotted and required for each rank. */
export function exportZoneDeployment(matrix: MatrixNode[], columns: DashboardColumn[], filters: string) {
  const header: Row = ['Zone', 'Sector', 'Sub-sector',
    ...columns.flatMap(column => [`${column} allotted`, `${column} required`]), 'Total allotted', 'Total required'];
  const rows: Row[] = [header];
  const walk = (nodes: MatrixNode[], path: string[]) => {
    for (const node of nodes) {
      const place = [...path, node.label];
      rows.push([place[0] ?? '', place[1] ?? '', place[2] ?? '',
        ...columns.flatMap(column => [node.counts[column] ?? 0, node.required?.[column as keyof typeof node.required] ?? '']),
        node.total, requiredTotal(node)]);
      walk(node.children, place);
    }
  };
  walk(matrix, []);
  return download('zone-wise-deployment', 'Zone wise deployment', 'ZONE WISE DEPLOYMENT', filters, rows,
    [34, 18, 40, ...columns.flatMap(() => [10, 10]), 13, 13]);
}

/** Rank wise personnel: officers in each rank and their share. */
export function exportRankPersonnel(items: { label: string; count: number }[], filters: string) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const rows: Row[] = [['S. No.', 'Rank', 'Officers', 'Share of officers (%)'],
    ...items.map((item, index) => [index + 1, item.label, item.count, total ? Number(((item.count / total) * 100).toFixed(1)) : 0]),
    ['', 'Total', total, total ? 100 : 0]];
  return download('rank-wise-personnel', 'Rank wise personnel', 'RANK WISE PERSONNEL', filters, rows, [8, 18, 12, 20]);
}

/** District / unit wise personnel: officers of each rank per district or unit, with a total row. */
export function exportDistrictPersonnel(rows: { district: string; counts: ColumnCounts; total: number }[],
  columns: DashboardColumn[], totals: ColumnCounts, officers: number, filters: string) {
  const table: Row[] = [['S. No.', 'District / unit', ...columns, 'Total'],
    ...rows.map((row, index) => [index + 1, row.district, ...columns.map(column => row.counts[column] ?? 0), row.total]),
    ['', 'Total', ...columns.map(column => totals[column] ?? 0), officers]];
  return download('district-unit-wise-personnel', 'District unit wise', 'DISTRICT / UNIT WISE PERSONNEL', filters, table,
    [8, 30, ...columns.map(() => 10), 10]);
}
