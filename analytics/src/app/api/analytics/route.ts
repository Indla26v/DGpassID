import { getAnalytics } from '@/lib/analytics';
import { allowRequest, parseFilters } from '@/lib/request-guard';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const ip = process.env.VERCEL ? request.headers.get('x-real-ip') ?? 'unknown' : 'local';
  if (!allowRequest(ip)) return Response.json({ error: 'Too many requests. Please try again shortly.' }, { status: 429, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } });
  const filters = parseFilters(request.url);
  if (!filters) {
    return Response.json({ error: 'Invalid analytics filters' }, { status: 400 });
  }
  try {
    return Response.json(await getAnalytics(filters.days, filters.institution), { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch {
    console.error('Analytics query failed');
    return Response.json({ error: 'Unable to reach the analytics database. Please try again.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
