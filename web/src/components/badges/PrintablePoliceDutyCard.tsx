'use client';

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { HeaderLogo } from '../common/HeaderLogo';
import { PassEntity } from '@/core/domain/entities/pass.entity';
import { formatPhotoUrl } from '@/lib/identity-validation';
import { formatPoliceBadgeZone, formatPoliceSectorAccess, resolveDutyPosting } from '@/core/domain/police-zones';
import { displayRank } from '@/core/domain/ranks';

interface PrintablePoliceDutyCardProps {
  pass: Partial<PassEntity>;
  scale?: number;
  className?: string;
  hideShadow?: boolean;
}

const logoClass = '!rounded-none !border-0 !bg-transparent !p-0 !shadow-none';

export const PrintablePoliceDutyCard: React.FC<PrintablePoliceDutyCardProps> = ({
  pass,
  scale = 1,
  className = '',
  hideShadow = false,
}) => {
  const [qr, setQr] = useState<{ payload: string; url: string } | null>(null);
  const [failedPhoto, setFailedPhoto] = useState('');
  const photo = pass.photo_url ? formatPhotoUrl(pass.photo_url) : '';
  const fullName = pass.full_name || '—';
  const rank = displayRank(pass.rank || pass.designation_or_trade) || '—';
  // police_sector_name holds the sub-sector when one is assigned; show the sector and sub-sector separately.
  const posting = resolveDutyPosting(pass.police_zone, pass.police_sector_number, pass.police_sector_name);
  const subSector = posting.subSector ? posting.subSector.toUpperCase() : '';
  const formattedZone = formatPoliceBadgeZone(pass.police_zone);
  const { sectorNumber, sectorName } = formatPoliceSectorAccess(
    pass.police_sector_number,
    posting.subSector && posting.sector ? posting.sector.name : pass.police_sector_name,
    pass.police_custom_sector,
    pass.security_component
  );
  const number = sectorNumber.replace(/^SECTOR(?:\s+NUMBER)?\s*:?\s*/i, '');
  const payload = pass.qr_payload || (pass.pass_number && pass.verification_token
    ? `${pass.pass_number}|${pass.verification_token}|${fullName.slice(0, 20)}|${rank}|${pass.police_id_number || ''}|${formattedZone}|${sectorName}`
    : '');

  useEffect(() => {
    if (!payload) return;
    let current = true;
    QRCode.toDataURL(payload, {
      width: 230,
      margin: 4,
      color: { dark: '#08224b', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    })
      .then((url) => { if (current) setQr({ payload, url }); })
      .catch((error) => console.error('QR generation failed:', error));
    return () => { current = false; };
  }, [payload]);

  return (
    <div
      id="printableCard"
      className={`printable-card-size grid select-none overflow-hidden rounded-lg border border-[#08224b] bg-white text-[#08224b] ${hideShadow ? '' : 'shadow-xl'} ${className}`}
      style={{
        gridTemplateRows: `38px 65px 30px minmax(0,1fr) 28px ${subSector ? 80 : 68}px 59px 19px`,
        ...(scale !== 1 ? { transform: `scale(${scale})`, transformOrigin: 'top center' } : {}),
      }}
    >
      <div className="grid place-items-center border-b border-white/50 bg-[#08224b] text-[28px] font-black leading-none tracking-[0.015em] text-white">
        DUTY ID CARD
      </div>

      <div className="grid grid-cols-[38px_minmax(0,1fr)_38px] items-center gap-1 bg-[#08224b] px-1.5 text-center text-white">
        <HeaderLogo type="police" size={38} className={logoClass} />
        <div className="min-w-0">
          <h2 className="text-[14px] font-black leading-[1.04]">
            61<sup className="text-[0.65em]">st</sup> ALL INDIA DGSP / IGPS<br />
            CONFERENCE – 2026
          </h2>
          <p className="mt-1 text-[9.5px] font-bold leading-tight">Tirupati, Andhra Pradesh</p>
        </div>
        <HeaderLogo type="tirupati-police" size={38} />
      </div>

      <div className="flex items-center justify-center border-y border-[#08224b] bg-[#e4000b] px-1 text-center text-[19px] font-black leading-none text-white">
        TIRUPATI DISTRICT POLICE
      </div>

      <div className="grid min-h-0 grid-cols-[1fr_2fr] border-b border-[#08224b] text-black">
        <div data-police-badge-photo className="relative min-h-0 overflow-hidden border-r border-[#08224b]">
          {photo && photo !== failedPhoto ? (
            <img src={photo} alt={fullName} className="absolute inset-0 h-full w-full object-cover object-center" onError={() => setFailedPhoto(photo)} />
          ) : (
            <svg aria-hidden="true" className="absolute inset-0 h-full w-full text-black" viewBox="0 0 100 140" preserveAspectRatio="xMidYMax slice" fill="currentColor">
              <path d="M50 15c-16 0-27 11-27 27v13c-7-1-5 16 2 19 2 10 7 19 14 24v8c-1 5-6 9-12 12L0 131v9h100v-9l-27-13c-6-3-11-7-12-12v-8c7-5 12-14 14-24 7-3 9-20 2-19V42c0-16-11-27-27-27Z" />
            </svg>
          )}
        </div>
        <dl className="flex min-w-0 flex-col justify-center gap-2 px-2 py-1.5 text-[11px] font-semibold uppercase leading-tight">
          <div className="line-clamp-2 break-words"><dt className="inline">Name: </dt><dd className="inline text-[14px] font-black">{fullName}</dd></div>
          <div className="line-clamp-2 break-words"><dt className="inline">Rank: </dt><dd className="inline">{rank}</dd></div>
          <div className="break-words"><dt className="inline">Number: </dt><dd className="inline">{pass.police_id_number || '—'}</dd></div>
          <div className="break-words"><dt className="inline">{pass.govt_id_type || 'Aadhaar'}: </dt><dd className="inline tabular-nums">{pass.govt_id_number || '—'}</dd></div>
          <div className="break-words"><dt className="inline">Mobile number: </dt><dd className="inline tabular-nums">{pass.mobile_number || '—'}</dd></div>
        </dl>
      </div>

      <div className="flex items-center justify-center border-b border-[#08224b] px-2 text-center">
        <span className={`line-clamp-2 break-words font-black leading-tight ${formattedZone.length > 42 ? 'text-[10px]' : 'text-[12px]'}`}>{formattedZone}</span>
      </div>

      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_83px] border-b border-[#08224b]">
        <div className="flex min-w-0 flex-col gap-1 border-r border-[#08224b] px-2 py-1.5 font-black uppercase leading-tight">
          <p className="text-[12px]">Sector number: {number}</p>
          <p className={`break-words text-[10px] ${subSector ? 'line-clamp-2' : 'line-clamp-4'}`}>Sector name: {sectorName}</p>
          {subSector && <p className="line-clamp-2 break-words text-[10px]">Sub-sector: {subSector}</p>}
        </div>
        <div className="grid place-items-center">
          {qr?.payload === payload && <img src={qr.url} alt="Verification QR code" className="size-[64px] object-contain" />}
        </div>
      </div>

      <div className="grid min-h-0 grid-cols-2 divide-x divide-[#08224b] text-center">
        <div className="flex min-w-0 flex-col items-center px-2 pb-1.5 pt-1">
          {pass.cardholder_signature_url ? (
            <img src={pass.cardholder_signature_url} alt="Cardholder signature" className="h-[30px] max-w-full object-contain" />
          ) : (
            <span className="mt-1 text-[8px] font-semibold italic">Cardholder Signature</span>
          )}
          <span className="mt-auto w-full border-t border-[#08224b] pt-0.5 text-[7.5px] font-bold uppercase leading-tight">Signature of cardholder</span>
        </div>
        <div className="flex min-w-0 flex-col items-center justify-end px-2 pb-1 pt-0.5">
          {pass.authority_signature_url && (
            <img src={pass.authority_signature_url} alt="Issuing authority signature" className="min-h-0 max-h-[24px] max-w-full object-contain" />
          )}
          <div className="w-full border-t border-[#08224b] pt-0.5 leading-tight">
            <p className="text-[7.5px] font-bold uppercase">Authority signature (with seal)</p>
            <p className="line-clamp-1 break-words text-[8px] font-bold">{pass.authority_name || 'L.Subbarayudu'}</p>
            <p className="line-clamp-2 break-words text-[7px] font-semibold">{pass.authority_title || 'SP / Security Nodal Officer, Tirupati'}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center border-t border-[#e4000b] bg-[#08224b] px-1.5 text-center text-[6.5px] font-semibold leading-tight text-white">
        Display prominently on campus • Non-transferable • Report loss immediately to Security Control Room
      </div>
    </div>
  );
};
