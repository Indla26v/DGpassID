import type { SessionUser } from './entities/user.entity';

export const OFFICES = [
  { id: 'chandragiri', name: 'Chandragiri Subdivision' },
  { id: 'renigunta', name: 'Renigunta Subdivision' },
  { id: 'tirupati', name: 'Tirupati Subdivision' },
  { id: 'district', name: 'District Head Office' },
] as const;

export type OfficeId = (typeof OFFICES)[number]['id'];
export type OfficeStatistics = {
  id: OfficeId | 'unassigned';
  name: string;
  total: number;
  pending: number;
  ready: number;
  printed: number;
  issued: number;
  revoked: number;
};

export const DUPLICATE_OUTSIDE_OFFICE = 'A matching pass already exists outside your office. Contact the district administrator.';

export function isOfficeId(value: unknown): value is OfficeId {
  return OFFICES.some((office) => office.id === value);
}

export function canViewTeam(user: { role: string; officeId?: OfficeId | null }) {
  return managesAccounts(user);
}

export function managesAccounts(user: { role: string; officeId?: OfficeId | null }) {
  return user.role === 'ADMIN' && (!user.officeId || user.officeId === 'district');
}

export function isSubdivisionUser(user: { role: string; officeId?: OfficeId | null }): boolean {
  return Boolean(user.officeId && user.officeId !== 'district');
}

export function canImportDistrictProforma(user: { role: string; officeId?: OfficeId | null }) {
  return user.role === 'ADMIN' && (!user.officeId || user.officeId === 'district');
}

export function officeScope(user: SessionUser): OfficeId | 'unassigned' | null {
  return managesAccounts(user) ? null : user.officeId ?? 'unassigned';
}

export function canAccessOffice(user: SessionUser, office: OfficeId | null) {
  const scope = officeScope(user);
  return scope === null || scope === (office ?? 'unassigned');
}
