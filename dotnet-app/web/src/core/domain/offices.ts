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

export function isOfficeId(value: unknown): value is OfficeId {
  return OFFICES.some((office) => office.id === value);
}

export function canViewTeam(user: { role: string; officeId?: OfficeId | null }) {
  return user.role === 'ADMIN' && user.officeId === 'district';
}

export function managesAccounts(user: { role: string; officeId?: OfficeId | null }) {
  return user.role === 'ADMIN' && (!user.officeId || user.officeId === 'district');
}
