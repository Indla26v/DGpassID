import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pass Operations Analytics | 61st All India DGPs / IGPs Conference 2026',
  description:
    'Live conference pass creation, print production, Bandobusth police deployment, and institution allocation analytics.',
  robots: { index: false, follow: false },
  icons: {
    icon: '/app-logo.png',
  },
};

export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
