'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[ui] page error:', error);
  }, [error]);

  return (
    <main className="container" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="glass-panel" style={{ padding: '2rem', maxWidth: '440px', textAlign: 'center' }}>
        <h2 style={{ marginBottom: '0.5rem' }}>This page hit a problem</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
          Other parts of DocSync are unaffected. You can retry, or go back to the home page.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={reset}>Try again</button>
          <Link className="btn btn-secondary" href="/" style={{ textDecoration: 'none' }}>Home</Link>
        </div>
      </div>
    </main>
  );
}
