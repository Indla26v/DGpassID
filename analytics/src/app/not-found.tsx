import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f1f5f9',
        padding: '24px',
      }}
    >
      <div
        style={{
          maxWidth: '460px',
          width: '100%',
          backgroundColor: '#ffffff',
          borderRadius: '24px',
          border: '1px solid rgba(226, 232, 240, 0.9)',
          boxShadow: '0 6px 24px -16px rgba(11, 37, 69, 0.35)',
          padding: '36px 32px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: '52px',
            height: '52px',
            borderRadius: '9999px',
            backgroundColor: '#fff1f2',
            color: '#8b1a1a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
          }}
        >
          <ShieldAlert size={24} />
        </div>
        <h1
          style={{
            fontSize: '20px',
            fontWeight: 700,
            color: '#0b2545',
            marginBottom: '8px',
          }}
        >
          Page Not Found
        </h1>
        <p
          style={{
            fontSize: '13px',
            color: '#64748b',
            marginBottom: '24px',
            lineHeight: 1.5,
          }}
        >
          The requested pass analytics view or report resource could not be found.
        </p>
        <Link href="/" className="pill-btn pill-btn-primary">
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
