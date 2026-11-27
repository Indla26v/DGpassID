import { cleanAadhaarNumber, cleanMobileNumber, validateGovernmentId, validateMobile } from './identity-validation';
import { policePersonnelPhotoUrl, type PolicePersonnelRow } from './police-personnel-import';
import type { PersonnelPicture } from './personnel-workbook-photos';

export type PhotoOverride = { kind: 'choice'; picture: PersonnelPicture } | { kind: 'replacement'; file: File } | { kind: 'defer' };

export type ReviewPhoto =
  | { kind: 'embedded' | 'chosen'; picture: PersonnelPicture }
  | { kind: 'replacement'; file: File }
  | { kind: 'link'; url: string }
  | { kind: 'defer' }
  | { kind: 'review'; message: string; candidates: PersonnelPicture[] };

export function resolveReviewPhoto(
  row: PolicePersonnelRow, override: PhotoOverride | undefined,
): ReviewPhoto {
  if (override?.kind === 'choice') return { kind: 'chosen', picture: override.picture };
  if (override) return override;
  if (row.embeddedPhoto) {
    return 'error' in row.embeddedPhoto
      ? { kind: 'review', message: row.embeddedPhoto.error, candidates: row.embeddedPhoto.candidates }
      : { kind: 'embedded', picture: row.embeddedPhoto };
  }
  const url = policePersonnelPhotoUrl(row.photoReference);
  if (url) return { kind: 'link', url };
  if (!row.photoReference) return { kind: 'defer' };
  return {
    kind: 'review',
    message: 'Upload the referenced photo in row review or choose Capture later.',
    candidates: [],
  };
}

export function photoBlob(photo: ReviewPhoto): Blob | undefined {
  if ('file' in photo) return photo.file;
  if ('picture' in photo) return new Blob([new Uint8Array(photo.picture.bytes)], { type: photo.picture.mime });
}

export function personnelDetailsIssue(row: PolicePersonnelRow): string {
  if (!row.record.full_name.trim()) return 'Enter the officer’s full name.';
  try {
    validateMobile(cleanMobileNumber(row.record.mobile_number));
    validateGovernmentId('Aadhaar', cleanAadhaarNumber(row.record.govt_id_number));
  } catch (error) {
    return error instanceof Error ? error.message : 'Check the officer’s mobile and Aadhaar numbers.';
  }
  return '';
}
