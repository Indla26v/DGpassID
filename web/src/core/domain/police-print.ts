import type { PassEntity } from './entities/pass.entity';
import { isValidPhotoUrl } from '@/lib/identity-validation';
import type { PassStatus } from './types/pass-status.enum';

export const POLICE_UNPRINTED_STATUSES: readonly PassStatus[] = ['PENDING_APPROVAL', 'APPROVED', 'READY_TO_PRINT'];

export function canPrintPassStatus(pass: Pick<PassEntity, 'pass_type' | 'status'>) {
  return pass.status === 'PRINTED' || (pass.pass_type === 'POLICE_FORCE'
    ? POLICE_UNPRINTED_STATUSES.includes(pass.status)
    : pass.status === 'READY_TO_PRINT');
}

export function policePrintBlocker(pass: PassEntity): string {
  if (!pass.police_zone?.trim() || !pass.police_sector_number?.trim() || !pass.police_sector_name?.trim()) {
    return 'Assign a zone and sector before printing.';
  }
  if (!isValidPhotoUrl(pass.photo_url)) {
    return 'Add a cardholder photo before printing.';
  }
  return '';
}
