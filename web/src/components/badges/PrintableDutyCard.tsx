'use client';

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { HeaderLogo } from '../common/HeaderLogo';
import { PassEntity } from '@/core/domain/entities/pass.entity';
import { getPassValidFrom, PASS_VALID_TO } from '@/core/domain/pass-validity';
import { isValidPhotoUrl, formatPhotoUrl } from '@/lib/identity-validation';
import { getDefaultGate } from '@/core/domain/zones';

interface PrintableDutyCardProps {
  pass: Partial<PassEntity>;
  side?: 'front';
  scale?: number;
  className?: string;
  hideShadow?: boolean;
  printDate?: string;
}

export const PrintableDutyCard: React.FC<PrintableDutyCardProps> = ({
  pass,
  scale = 1,
  className = '',
  hideShadow = false,
  printDate,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [pass.photo_url]);

  const formattedPhoto = pass.photo_url ? formatPhotoUrl(pass.photo_url) : '';

  const passNumber = pass.pass_number || 'DGPCONF-2026-0142';
  const fullName = pass.full_name || 'Cardholder Name';
  const token = pass.verification_token || 'PV-2026-000000-AP';

  // Category display
  const category =
    pass.category === 'Other' && pass.category_other
      ? pass.category_other
      : pass.category || (pass.personnel_type === 'EXTERNAL' ? 'External Agency' : 'Student');

  // Institution selection is independent of internal/external personnel type.
  const institutionFullNames: Record<string, string> = {
    IISER: 'INDIAN INSTITUTE OF SCIENCE EDUCATION AND RESEARCH (IISER)',
    IIT: 'INDIAN INSTITUTE OF TECHNOLOGY (IIT) TIRUPATI',
    ICI: 'INDIAN CULINARY INSTITUTE (ICI)',
    ICU: 'INDIAN CULINARY INSTITUTE (ICI)',
  };
  const institutionDisplay = pass.institution
    ? institutionFullNames[pass.institution] || 'INSTITUTION / UNIT NOT SELECTED'
    : 'INSTITUTION / UNIT NOT SELECTED';

  // Format Dates
  const formatDate = (d: string) => {
    if (d.includes('/')) return d;
    const parts = d.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return d;
  };

  useEffect(() => {
    const payload =
      pass.qr_payload ||
      `${passNumber}|${token}|${fullName.slice(0, 20)}|${category}|${pass.department || pass.institution || 'IISER'}`;

    QRCode.toDataURL(payload, {
      width: 140,
      margin: 1,
      color: {
        dark: '#0B2545',
        light: '#FFFFFF',
      },
      errorCorrectionLevel: 'M',
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('QR generation failed:', err));
  }, [pass.qr_payload, passNumber, token, fullName, category, pass.department, pass.institution]);

  // Exclusively render Front Side Duty Access Pass (8cm x 12cm)
  return (
    <div
      id="printableCard"
      className={`printable-card-size bg-white border-[1.5px] border-[#0B2545] rounded-lg overflow-hidden flex flex-col justify-between select-none ${
        !hideShadow ? 'shadow-xl' : ''
      } ${className}`}
      style={scale !== 1 ? { transform: `scale(${scale})`, transformOrigin: 'top center' } : undefined}
    >
      {/* 1. TOP HEADER BAND */}
      <div className="bg-[#0B2545] text-white border-b border-[#0B2545] flex flex-col shrink-0">
        {/* Prominent DUTY [PUNCH HOLE] ID CARD Strip */}
        <div className="w-full pt-1 pb-0.5 px-2 border-b border-white/15 bg-black/15 flex items-center justify-center gap-2.5 relative">
          <span className="text-[14.5px] font-black tracking-[0.22em] uppercase leading-none text-white select-none">
            DUTY
          </span>

          {/* Lanyard Slot Punch Hole Guide (Exact Match to Physical Badge Specification) */}
          <div className="relative flex items-center justify-center shrink-0 my-auto" title="Lanyard Slot Punch Hole">
            {/* Center Vertical Punch Alignment Tick Mark */}
            <div className="absolute -top-[3px] -bottom-[3px] w-[1px] bg-white/70 pointer-events-none" />

            {/* Outer Slot Capsule */}
            <div className="w-[36px] h-[10.5px] rounded-full border-[1.2px] border-white flex items-center justify-center bg-white/15 px-[2px] shadow-2xs">
              {/* Inner Dashed Punch Cutout Guide */}
              <div className="w-full h-[4.5px] rounded-full border border-dashed border-white/90" />
            </div>
          </div>

          <span className="text-[14.5px] font-black tracking-[0.22em] uppercase leading-none text-white select-none">
            ID CARD
          </span>
        </div>

        {/* Logos & Conference Title Row */}
        <div className="px-2 py-1 flex items-center justify-between gap-1">
          <HeaderLogo type="police" size={32} className="shrink-0" />

          <div className="text-center flex-1 min-w-0 px-0.5">
            <h2 className="text-[12px] font-black tracking-tight uppercase leading-[1.12] text-white">
              61<sup className="text-[0.65em] normal-case font-extrabold">st</sup> ALL INDIA DGsP / IGPs CONFERENCE – 2026
            </h2>
            <p className="text-[8.5px] font-bold text-slate-200 leading-tight mt-[1px]">
              IISER, Tirupati, Andhra Pradesh
            </p>
          </div>

          <HeaderLogo type="iiser" size={32} className="shrink-0" />
        </div>

        {/* Full-Width Crimson Sub-Banner */}
        <div className="w-full bg-[#8B1A1A] text-white py-[3px] px-2 border-t border-white/25 text-center">
          <span className="block w-full text-[10px] font-black tracking-tight uppercase leading-tight">
            {institutionDisplay}
          </span>
        </div>
      </div>

      {/* 2. PASS ID, CATEGORY & VALIDITY METADATA STRIP */}
      <div className="shrink-0 border-b border-[#0B2545] bg-slate-50">
        <div className="px-2 py-[2.5px] border-b border-[#0B2545]/20 flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[7.2px] font-bold text-slate-600 shrink-0">ID:</span>
            <span className="font-mono font-extrabold text-[#0B2545] text-[8.5px] truncate">
              {passNumber}
            </span>
          </div>
          <span className="px-2 py-[1px] rounded bg-[#0B2545] text-white font-extrabold text-[7.5px] uppercase tracking-wider shrink-0 max-w-[130px] truncate">
            {category}
          </span>
        </div>

        <div className="px-2 py-[2px] bg-white flex items-center justify-between gap-2 text-[7.5px]">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-slate-600">Valid From:</span>
            <span className="font-mono font-extrabold text-[#0B2545] text-[7.8px]">
              {formatDate(printDate || getPassValidFrom(pass) || 'On print')}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-slate-600">Valid To:</span>
            <span className="font-mono font-extrabold text-[#8B1A1A] text-[7.8px]">
              {formatDate(PASS_VALID_TO)}
            </span>
          </div>
        </div>
      </div>

      {/* 3. PASSPORT PHOTO & CARDHOLDER PARTICULARS */}
      <div className="flex-1 grid grid-cols-12 border-b border-[#0B2545] min-h-0 bg-white">
        {/* Photo Column */}
        <div className="col-span-4 p-1.5 border-r border-[#0B2545] flex flex-col items-center justify-center bg-slate-50/70">
          <div className="relative w-[70px] h-[86px] rounded border border-slate-200 overflow-hidden flex items-center justify-center bg-slate-100 shadow-2xs">
            {isValidPhotoUrl(formattedPhoto) && !imageError ? (
              <img
                src={formattedPhoto}
                alt="Passport Photo"
                className="w-full h-full object-cover"
                onError={() => setImageError(true)}
              />
            ) : (
              <div className="p-1 text-center text-[6.5px] font-bold text-slate-400 leading-tight">
                [ PASSPORT PHOTO ]
              </div>
            )}
          </div>
        </div>

        {/* Stacked Personal Details */}
        <div className="col-span-8 px-2.5 py-1 flex flex-col justify-between min-w-0">
          <div className="border-b border-dotted border-slate-300 pb-0.5">
            <span className="block text-[6.8px] font-bold text-slate-500 uppercase leading-none tracking-wider">
              Full Name
            </span>
            <span className="block font-black text-slate-950 text-[11px] uppercase leading-snug truncate mt-[1px]">
              {fullName}
            </span>
          </div>

          <div className="border-b border-dotted border-slate-300 pb-0.5">
            <span className="block text-[6.8px] font-bold text-slate-500 uppercase leading-none tracking-wider">
              Father’s / Spouse’s Name
            </span>
            <span className="block font-bold text-slate-900 text-[9.5px] leading-snug truncate mt-[1px]">
              {pass.father_or_spouse_name || '—'}
            </span>
          </div>

          <div className="border-b border-dotted border-slate-300 pb-0.5">
            <span className="block text-[6.8px] font-bold text-slate-500 uppercase leading-none tracking-wider">
              Working for Department
            </span>
            <span className="block font-bold text-slate-900 text-[9.5px] leading-snug truncate mt-[1px]">
              {pass.department || '—'}
            </span>
          </div>

          <div className="grid grid-cols-12 gap-1.5 pt-[1px]">
            <div className="col-span-5 min-w-0">
              <span className="block text-[6.2px] font-bold text-slate-500 uppercase leading-none tracking-wider">
                Mobile No.
              </span>
              <span className="block font-mono font-bold text-slate-900 text-[8.5px] leading-snug truncate mt-[1px]">
                {pass.mobile_number || '—'}
              </span>
            </div>
            <div className="col-span-7 min-w-0">
              <span className="block text-[6.2px] font-bold text-slate-500 uppercase leading-none tracking-wider">
                Govt. ID Type &amp; No.
              </span>
              <span className="block font-mono font-bold text-slate-900 text-[8.5px] leading-snug truncate mt-[1px]">
                {pass.govt_id_type ? `${pass.govt_id_type}: ` : ''}
                {pass.govt_id_number || '—'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. PERMITTED ACCESS ZONES & QR CODE */}
      <div className="shrink-0 grid grid-cols-12 border-b border-[#0B2545] bg-white">
        <div className="col-span-8 px-2 py-1 border-r border-[#0B2545] flex flex-col justify-between min-w-0">
          <div>
            <div className="text-[7.2px] font-extrabold text-[#0B2545] uppercase tracking-wide mb-0.5">
              Permitted Access Zones:
            </div>
            <div className="flex flex-col gap-0.5">
              {pass.zone_a && (
                <div className="text-[#0B2545] text-[7.2px] font-extrabold leading-tight">
                  <div>Zone-A (Residential / Hostel)</div>
                  <span className="block text-[6px] font-bold text-[#8B1A1A] leading-tight">
                    {pass.gate_zone_a || getDefaultGate(pass.institution, 'A')}
                  </span>
                </div>
              )}
              {pass.zone_b && (
                <div className="text-[#0B2545] text-[7.2px] font-extrabold leading-tight">
                  <div>Zone-B (Academic / Admin)</div>
                  <span className="block text-[6px] font-bold text-[#8B1A1A] leading-tight">
                    {pass.gate_zone_b || getDefaultGate(pass.institution, 'B')}
                  </span>
                </div>
              )}
              {pass.zone_c && (
                <div className="text-[#0B2545] text-[7.2px] font-extrabold leading-tight">
                  <div>Zone-C (Service / Utility)</div>
                  <span className="block text-[6px] font-bold text-[#8B1A1A] leading-tight">
                    {pass.gate_zone_c || getDefaultGate(pass.institution, 'C')}
                  </span>
                </div>
              )}
              {!pass.zone_a && !pass.zone_b && !pass.zone_c && (
                <span className="text-[6.8px] italic text-[#8B1A1A] font-bold">
                  Restricted Access / Escorted Only
                </span>
              )}
            </div>
          </div>
          <div className="text-[5.8px] text-slate-500 font-medium leading-tight mt-0.5">
            Strictly limited to authorized gates listed above.
          </div>
        </div>

        {/* Gate Verification QR */}
        <div className="col-span-4 p-1 flex flex-col items-center justify-center bg-white text-center">
          <div className="p-[2px] border border-slate-300 rounded bg-white flex items-center justify-center w-[52px] h-[52px] shadow-2xs">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="Verification QR Code" className="w-full h-full object-contain" />
            ) : (
              <div className="w-full h-full bg-slate-100 animate-pulse" />
            )}
          </div>
          <span className="text-[5.6px] font-extrabold text-[#0B2545] uppercase tracking-wider mt-[2px] leading-none">
            POLICE VERIFICATION
          </span>
          <span className="font-mono text-[6.2px] font-bold text-[#8B1A1A] mt-[1px] leading-none truncate max-w-[74px]">
            {token}
          </span>
        </div>
      </div>

      {/* 5. DIGITAL SIGNATURES & OFFICIAL SEAL */}
      <div className="shrink-0 grid grid-cols-2 bg-slate-50/50">
        {/* Cardholder Signature */}
        <div className="px-2.5 py-1 border-r border-[#0B2545] flex flex-col justify-between items-center text-center h-[54px]">
          <div className="w-full h-[28px] flex items-center justify-center relative">
            {pass.cardholder_signature_url ? (
              <img
                src={pass.cardholder_signature_url}
                alt="Cardholder Signature"
                className="max-h-[26px] max-w-[105px] object-contain mix-blend-multiply"
              />
            ) : (
              <span className="text-[6.2px] italic text-slate-400">Cardholder Signature</span>
            )}
          </div>
          <div className="w-full">
            <div className="border-t border-[#0B2545] w-11/12 mx-auto pt-[2px] text-[6.8px] font-bold text-[#0B2545] uppercase leading-none">
              Signature of Cardholder
            </div>
          </div>
        </div>

        {/* Issuing Authority Signature & Official Seal */}
        <div className="px-2.5 py-1 flex flex-col justify-between items-center text-center h-[54px] relative overflow-hidden">
          <div className="w-full min-h-0 flex-1 flex items-center justify-center overflow-hidden">
            {pass.authority_signature_url ? (
              <img
                src={pass.authority_signature_url}
                alt="Authority Signature"
                className="max-h-full max-w-[110px] object-contain mix-blend-multiply"
              />
            ) : null}
          </div>
          <div className="w-full shrink-0">
            <div className="border-t border-[#0B2545] w-11/12 mx-auto pt-[2px] text-[6.8px] font-bold text-[#0B2545] uppercase leading-none">
              Issuing Authority (With Seal)
            </div>
            {pass.authority_name && <div className="truncate text-[6.2px] font-bold text-[#0B2545] leading-tight">{pass.authority_name}</div>}
            {pass.authority_title && pass.authority_title !== pass.authority_name && (
              <div className="truncate text-[5.4px] font-semibold text-slate-600 leading-tight">{pass.authority_title}</div>
            )}
          </div>
        </div>
      </div>

      {/* 6. SECURITY FOOTER NOTE */}
      <div className="shrink-0 bg-[#0B2545] text-white border-t border-[#8B1A1A] text-[5.8px] font-medium px-2 py-[2.5px] text-center leading-tight">
        Display prominently on campus • Non-transferable • Report loss immediately to Security Control Room
      </div>
    </div>
  );
};
