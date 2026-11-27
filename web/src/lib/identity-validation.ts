export function cleanMobileNumber(val?: string | null): string {
  if (!val) return '';
  let cleaned = String(val).replace(/[\s\-\(\)\.]/g, '');
  if (cleaned.startsWith('+91')) {
    cleaned = cleaned.slice(3);
  } else if (cleaned.startsWith('91') && cleaned.length === 12) {
    cleaned = cleaned.slice(2);
  } else if (cleaned.startsWith('0') && cleaned.length === 11) {
    cleaned = cleaned.slice(1);
  }
  return cleaned;
}

export function cleanAadhaarNumber(val?: string | null): string {
  if (!val) return '';
  return String(val).trim().replace(/^=['"]|['"]$/g, '').replace(/[\s\-]/g, '');
}

export function repeatedAadhaarNumbers(values: Iterable<string>): Set<string> {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    const number = cleanAadhaarNumber(value);
    if (!number) continue;
    if (seen.has(number)) repeated.add(number);
    seen.add(number);
  }
  return repeated;
}

export const DUPLICATE_PERSONNEL_AADHAAR = 'This Aadhaar appears on multiple selected rows. Enter the correct Aadhaar for each officer.';

export function validateMobile(value?: string | null): void {
  if (!value || !/^[6-9][0-9]{9}$/.test(value)) {
    throw new Error('Mobile number must contain exactly 10 digits, start with 6–9, and contain no spaces, letters or country code.');
  }
}

export function validateGovernmentId(type: string, value?: string | null): void {
  const patterns: Record<string, { pattern: RegExp; message: string }> = {
    'Aadhaar': {
      pattern: /^[2-9][0-9]{11}$/,
      message: 'Aadhaar must contain exactly 12 digits, start with 2–9, and contain no letters or spaces.',
    },
    'PAN Card': {
      pattern: /^[A-Z]{5}[0-9]{4}[A-Z]$/,
      message: 'PAN must contain 5 uppercase letters, 4 digits and 1 uppercase letter.',
    },
    'Passport': {
      pattern: /^[A-Z][0-9]{7}$/,
      message: 'Passport number must contain 1 uppercase letter followed by 7 digits.',
    },
    'Voter ID': {
      pattern: /^[A-Z]{3}[0-9]{7}$/,
      message: 'Voter ID must contain 3 uppercase letters followed by 7 digits.',
    },
    'Driving License': {
      pattern: /^[A-Z]{2}[0-9]{13,14}$/,
      message: 'Driving licence must contain a 2-letter state code followed by 13–14 digits, without separators.',
    },
    'Institute ID': {
      pattern: /^[A-Za-z0-9/-]{1,32}$/,
      message: 'Institute ID must contain 1–32 letters, digits, hyphens or slashes.',
    },
    'Police ID': {
      pattern: /^[A-Za-z0-9/-]{1,32}$/,
      message: 'Police ID must contain 1–32 letters, digits, hyphens or slashes.',
    },
  };

  const rule = patterns[type];
  if (!rule) {
    throw new Error('Choose a supported government ID type.');
  }
  if (!value || !rule.pattern.test(value)) {
    throw new Error(rule.message);
  }
}

export function isValidPhotoUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (
    !trimmed ||
    trimmed === 'DESK_CAPTURE' ||
    trimmed === 'ATTACHED' ||
    trimmed === '—' ||
    trimmed === 'None' ||
    trimmed === 'null' ||
    trimmed === 'undefined'
  ) {
    return false;
  }
  return (
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('blob:')
  );
}

export function formatPhotoUrl(url?: string | null): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  const gDriveMatch = trimmed.match(
    /(?:drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)|docs\.google\.com\/file\/d\/)([a-zA-Z0-9_-]+)/
  );
  if (gDriveMatch && gDriveMatch[1]) {
    return `https://drive.google.com/thumbnail?id=${gDriveMatch[1]}&sz=w600`;
  }

  return trimmed;
}
