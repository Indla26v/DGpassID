import type { Metadata, Viewport } from 'next';
import { Analytics } from '@vercel/analytics/react';
import './globals.css';

export const metadata: Metadata = {
  title: '61st All India DGsP / IGPs Conference 2026 – Pass Management',
  description:
    'Duty Access Card Registry and ID Print Station for 61st All India DGsP / IGPs Conference – IISER Campus, Tirupati.',
  icons: {
    icon: '/app-logo.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-100 text-slate-900 antialiased font-sans">
        <a className="skip-link no-print" href="#workspace">
          Skip to workspace
        </a>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
