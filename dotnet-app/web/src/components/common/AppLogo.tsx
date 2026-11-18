import React from 'react';

interface AppLogoProps {
  size?: number;
  className?: string;
}

export const AppLogo: React.FC<AppLogoProps> = ({ size = 40, className = '' }) => {
  return (
    <img
      src="/app-logo.svg"
      alt="Conference Pass"
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
    />
  );
};

export default AppLogo;

