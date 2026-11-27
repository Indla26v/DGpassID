import { authorizeRequest } from '@/lib/auth/session-helper';
import { services } from '@/core/services/service-container';
import { canAccessOffice, isOfficeId, managesAccounts, OFFICES } from '@/core/domain/offices';

export async function GET(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN']);
  if (auth.errorResponse) return auth.errorResponse;

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || 'full';
  const format = (searchParams.get('format') || 'csv').toLowerCase();
  const officeIdParam = searchParams.get('office_id');
  const departmentParam = searchParams.get('department')?.trim() || undefined;
  const statusParam = searchParams.get('status') || undefined;

  // Full registry export is strictly restricted to Central Super Admin and District SP
  if (type === 'full' && !managesAccounts(auth.user)) {
    return new Response(JSON.stringify({ error: 'Full registry export is restricted to District SP and Administrators.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (type !== 'full' && type !== 'subdivision' && type !== 'department') {
    return Response.json({ error: 'Choose a valid export type.' }, { status: 400 });
  }

  const targetOfficeId = officeIdParam === 'unassigned' || isOfficeId(officeIdParam) ? officeIdParam : undefined;
  if ((type === 'subdivision' || officeIdParam !== null) && !targetOfficeId) {
    return Response.json({ error: 'Choose a valid office for export.' }, { status: 400 });
  }
  if (type === 'department' && !departmentParam) {
    return Response.json({ error: 'Choose a department for export.' }, { status: 400 });
  }
  if (targetOfficeId && !canAccessOffice(auth.user, targetOfficeId === 'unassigned' ? null : targetOfficeId)) {
    return Response.json({ error: 'You do not have permission to export records for this office.' }, { status: 403 });
  }

  const passes = await services.passRepository.exportPasses(
    {
      officeId: targetOfficeId,
      passType: type === 'full' ? undefined : 'CAMPUS',
      department: departmentParam,
      status: statusParam && statusParam !== 'ALL' ? statusParam : undefined,
    },
    auth.user
  );

  const dateStr = new Date().toISOString().slice(0, 10);
  const ext = format === 'pdf' ? 'pdf' : 'csv';
  let filename = `dgp-passes-full-export-${dateStr}.${ext}`;

  if (type === 'subdivision' && targetOfficeId) {
    filename = `dgp-passes-${targetOfficeId}-${dateStr}.${ext}`;
  } else if (type === 'department' && departmentParam) {
    const safeDeptSlug = departmentParam
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    filename = `dgp-passes-dept-${safeDeptSlug}-${dateStr}.${ext}`;
  }

  // Record audit log asynchronously
  void services.auditRepository.createLog({
    action: 'DATA_EXPORT',
    performed_by: auth.user.email,
    user_role: 'ADMIN',
    details: `Exported ${passes.length} passes (Format: ${format.toUpperCase()}, Type: ${type}, Office: ${targetOfficeId || 'all-in-scope'}, Dept: ${departmentParam || 'all'}, Status: ${statusParam || 'all'}).`,
  }).catch((err) => console.error('Export audit log failed:', err));

  if (format === 'pdf') {
    const officeName = targetOfficeId
      ? OFFICES.find((o) => o.id === targetOfficeId)?.name ?? (targetOfficeId === 'unassigned' ? 'Unassigned' : targetOfficeId)
      : undefined;

    const pdfBytes = services.pdfExportService.generatePdf(passes, {
      officeName,
      department: departmentParam,
      statusFilter: statusParam,
    });

    return new Response(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  }

  // Default: CSV
  const csv = services.csvExportService.generateCsv(passes);

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
