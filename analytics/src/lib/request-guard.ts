// Per-process abuse protection supplements the platform DDoS firewall.
// This is not a global/distributed rate limiter.
const clients = new Map<string, { count: number; expires: number }>();
const WINDOW_MS = 60000;
const MAX_REQUESTS = 60;
const MAX_CLIENTS = 5000;
export function allowRequest(ip: string, now = Date.now()) {
  const current = clients.get(ip);
  if (current && current.expires > now) {
    if (current.count >= MAX_REQUESTS) return false;
    current.count++;
    return true;
  }
  if (clients.size >= MAX_CLIENTS) {
    for (const [key, entry] of clients) if (entry.expires <= now) clients.delete(key);
    if (clients.size >= MAX_CLIENTS) return false;
  }
  clients.set(ip, { count: 1, expires: now + WINDOW_MS });
  return true;
}
export function parseFilters(url: string): { days: number; institution: string } | null {
  if (url.length > 256) return null;
  const params = new URL(url).searchParams;
  if ([...params.keys()].some(key => !['days', 'institution'].includes(key)) || params.getAll('days').length > 1 || params.getAll('institution').length > 1) return null;
  const rawDays = params.get('days') ?? '0';
  const institution = params.get('institution') ?? 'ALL';
  if (!['0', '7', '30', '90'].includes(rawDays) || !['ALL', 'IISER', 'IIT', 'ICI', 'ICU', 'OTHER'].includes(institution)) return null;
  return { days: Number(rawDays), institution };
}
