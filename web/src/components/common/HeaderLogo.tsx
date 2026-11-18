'use client';

import React, { useState } from 'react';

interface HeaderLogoProps {
  type: 'police' | 'iiser';
  className?: string;
  size?: number;
}

export const HeaderLogo: React.FC<HeaderLogoProps> = ({ type, className = '', size = 40 }) => {
  const [error, setError] = useState(false);

  if (type === 'police') {
    return (
      <div
        className={`rounded-lg bg-white p-1 flex items-center justify-center shrink-0 border border-slate-200/50 shadow-xs ${className}`}
        style={{ width: size, height: size }}
      >
        {!error ? (
          <img
            src="/ap-police-logo.png"
            alt="Andhra Pradesh Police Emblem"
            width={size}
            height={size}
            className="w-full h-full object-contain"
            onError={() => setError(true)}
          />
        ) : (
          <svg className="w-full h-full" viewBox="0 0 200 215" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M100 6C82 6 73 22 61 35C44 52 14 55 14 86C14 132 39 178 100 209C161 178 186 132 186 86C186 55 156 52 139 35C127 22 118 6 100 6Z"
              fill="#0B2545"
            />
            <circle cx="100" cy="106" r="46" stroke="#8B1A1A" strokeWidth="12" />
            <text x="100" y="112" textAnchor="middle" fill="#FFFFFF" fontWeight="900" fontSize="22">
              AP
            </text>
            <text x="100" y="180" textAnchor="middle" fill="#FFFFFF" fontWeight="800" fontSize="18" letterSpacing="2">
              POLICE
            </text>
          </svg>
        )}
      </div>
    );
  }

  return (
    <div
      className={`rounded-lg bg-white p-1 flex items-center justify-center shrink-0 border border-slate-200/50 shadow-xs ${className}`}
      style={{ width: size, height: size }}
    >
      {!error ? (
        <img
          src="/IISER_Tirupati_logo.png"
          alt="IISER Tirupati Logo"
          width={size}
          height={size}
          className="w-full h-full object-contain"
          onError={() => setError(true)}
        />
      ) : (
        <svg className="w-full h-full" viewBox="0 0 185 135" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="52" cy="18" r="13" fill="#0B6CB5" />
          <path d="M28 33H56C63 33 67 38 67 45V88C54 83 43 72 39 56V38H28V33Z" fill="#0B6CB5" />
          <text x="76" y="67" fill="#0F172A" fontWeight="900" fontSize="32">
            IISER
          </text>
          <text x="77" y="88" fill="#64748B" fontWeight="600" fontSize="18">
            TIRUPATI
          </text>
        </svg>
      )}
    </div>
  );
};

export default HeaderLogo;
