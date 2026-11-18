import { NextResponse } from 'next/server';
import { services } from '@/core/services/service-container';
import { authorizeRequest } from '@/lib/auth/session-helper';

function getTodayIST(): string {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const ist = new Date(utc + 5.5 * 3600000);
  return ist.toISOString().split('T')[0];
}

export async function POST(req: Request) {
  const auth = await authorizeRequest(req, ['ADMIN']);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const body = await req.json();
    let token = (body.token || body.qrPayload || '').toString().trim();

    if (token.includes('|')) {
      const parts = token.split('|');
      if (parts.length > 1) {
        token = parts[1].trim();
      }
    }

    if (!token) {
      return NextResponse.json({ isValid: false, status: 'NOT_FOUND', message: 'Verification token is required.' });
    }

    const pass = await services.passRepository.findByVerificationToken(token, auth.user);
    if (!pass) {
      return NextResponse.json({
        isValid: false,
        status: 'NOT_FOUND',
        message: 'Verification token was not found.',
      });
    }

    let isValid = ['APPROVED', 'READY_TO_PRINT', 'PRINTED', 'ISSUED'].includes(pass.status);
    let statusText: string = pass.status;

    const today = getTodayIST();
    if (pass.valid_from && pass.valid_to) {
      if (today < pass.valid_from || today > pass.valid_to) {
        isValid = false;
        statusText = 'OUTSIDE_VALIDITY';
      }
    }

    const gate = (body.gateId || '').toString().toUpperCase().trim();
    if (gate.length > 0) {
      let zoneRequired: 'zone_a' | 'zone_b' | 'zone_c' | null = null;
      if (gate === 'Z-A' || gate === 'ZONE-A' || gate.includes('HOSTEL') || gate.includes('RESIDENTIAL')) {
        zoneRequired = 'zone_a';
      } else if (gate === 'Z-B' || gate === 'ZONE-B' || gate.includes('ACADEMIC') || gate.includes('ADMIN')) {
        zoneRequired = 'zone_b';
      } else if (gate === 'Z-C' || gate === 'ZONE-C' || gate.includes('SERVICE') || gate.includes('UTILITY')) {
        zoneRequired = 'zone_c';
      }

      if (!zoneRequired || !pass[zoneRequired]) {
        isValid = false;
        statusText = 'ZONE_RESTRICTED';
      }
    }

    const action = isValid ? 'GATE_VERIFIED_ALLOW' : 'GATE_VERIFIED_DENY';
    await services.auditRepository.createLog({
      action,
      performed_by: auth.user.email,
      user_role: 'ADMIN',
      pass_id: pass.id,
      pass_number: pass.pass_number,
      details: `Gate ${gate || 'ALL'}: ${statusText}.`,
    });

    return NextResponse.json({
      isValid,
      status: isValid ? 'VALID' : statusText,
      message: isValid ? 'Access authorized.' : 'Access denied.',
      pass,
      gateMatch: isValid,
    });
  } catch (error) {
    console.error('Verify error:', error);
    return NextResponse.json({ error: 'Failed to verify pass.' }, { status: 500 });
  }
}
