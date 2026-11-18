export const digitsOnly = (value: string, maxLen?: number) => {
  const digits = value.replace(/[^0-9]/g, '');
  return typeof maxLen === 'number' ? digits.slice(0, maxLen) : digits;
};

export function getGovtIdInputConstraints(idType: string) {
  switch (idType) {
    case 'Aadhaar':
      return {
        minLength: 12,
        maxLength: 12,
        pattern: '[2-9][0-9]{11}',
        title: 'Exactly 12 digits; first digit 2–9',
        inputMode: 'numeric' as const,
      };
    case 'PAN Card':
      return {
        minLength: 10,
        maxLength: 10,
        pattern: '[A-Z]{5}[0-9]{4}[A-Z]',
        title: '5 letters, 4 digits, 1 letter',
        inputMode: 'text' as const,
      };
    case 'Passport':
      return {
        minLength: 8,
        maxLength: 8,
        pattern: '[A-Z][0-9]{7}',
        title: '1 letter followed by 7 digits',
        inputMode: 'text' as const,
      };
    case 'Voter ID':
      return {
        minLength: 10,
        maxLength: 10,
        pattern: '[A-Z]{3}[0-9]{7}',
        title: '3 letters followed by 7 digits',
        inputMode: 'text' as const,
      };
    case 'Driving License':
      return {
        minLength: 15,
        maxLength: 16,
        pattern: '[A-Z]{2}[0-9]{13,14}',
        title: '2-letter state code followed by 13–14 digits; no separators',
        inputMode: 'text' as const,
      };
    default:
      return {
        minLength: 1,
        maxLength: 32,
        pattern: '[A-Za-z0-9/\\-]{1,32}',
        title: '1–32 letters, digits, hyphens or slashes',
        inputMode: 'text' as const,
      };
  }
}

export function formatGovtIdInput(value: string, idType: string) {
  if (idType === 'Aadhaar') {
    return digitsOnly(value, 12);
  }
  const clean = value.toUpperCase().replace(idType === 'Institute ID' ? /[^A-Z0-9/\-]/g : /[^A-Z0-9]/g, '');
  return clean.slice(0, getGovtIdInputConstraints(idType).maxLength);
}

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
  };

  const rule = patterns[type];
  if (!rule) {
    throw new Error('Choose a supported government ID type.');
  }
  if (!value || !rule.pattern.test(value)) {
    throw new Error(rule.message);
  }
}
