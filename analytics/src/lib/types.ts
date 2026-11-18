export type Breakdown = { name: string; total: number; printed: number; ready: number };
export type Analytics = {
  updatedAt: string;
  filters: { days: number; institution: string };
  summary: { total: number; printed: number; ready: number; pending: number; issued: number; revoked: number; printRuns: number; reprints: number; today: number; internal: number; external: number; zoneA: number; zoneB: number; zoneC: number };
  offices: (Breakdown & { id: string; pending: number; issued: number; revoked: number })[];
  institutions: Breakdown[];
  categories: Breakdown[];
  departments: Breakdown[];
  statuses: { name: string; total: number }[];
  trend: { date: string; total: number }[];
};
