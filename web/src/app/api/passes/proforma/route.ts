import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const format = (searchParams.get('format') || 'xlsx').toLowerCase();

  const filename = format === 'csv'
    ? 'Official_DGP_Conference_Pass_Proforma_Template_2026.csv'
    : 'Official_DGP_Conference_Pass_Proforma_Template_2026.xlsx';

  const filePath = path.join(process.cwd(), 'public', filename);

  if (!fs.existsSync(filePath)) {
    // Fallback to project root if running locally
    const rootPath = path.join(process.cwd(), '..', filename);
    if (fs.existsSync(rootPath)) {
      const buffer = fs.readFileSync(rootPath);
      const contentType = format === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }
    return NextResponse.json({ error: 'Proforma template file not found.' }, { status: 404 });
  }

  const buffer = fs.readFileSync(filePath);
  const contentType = format === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
