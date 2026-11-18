import crypto from 'crypto';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(password, salt, 210000, 64, 'sha512');
  return `pbkdf2-sha512$210000$${salt.toString('hex').toUpperCase()}$${hash.toString('hex').toUpperCase()}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const parts = stored.split('$');
    if (parts.length !== 4 || parts[0] !== 'pbkdf2-sha512' || parts[1] !== '210000') {
      return false;
    }
    const salt = Buffer.from(parts[2], 'hex');
    const expected = Buffer.from(parts[3], 'hex');
    if (salt.length !== 16 || expected.length !== 64) {
      return false;
    }
    const actual = crypto.pbkdf2Sync(password, salt, 210000, 64, 'sha512');
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function tokenHash(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex').toUpperCase();
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex').toUpperCase();
}
