import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Pass Analytics | DGsP / IGPs Conference 2026', description: 'Live pass creation, print production and institution allocation analytics.', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
