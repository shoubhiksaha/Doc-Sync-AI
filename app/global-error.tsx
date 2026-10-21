'use client';

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', background: '#0f172a', color: '#e2e8f0', display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', margin: 0 }}>
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <h2>DocSync AI couldn&apos;t load</h2>
          <p style={{ opacity: 0.8 }}>Please try again in a moment.</p>
          <button onClick={reset} style={{ padding: '0.6rem 1.2rem', borderRadius: '8px', border: 'none', cursor: 'pointer' }}>Try again</button>
        </div>
      </body>
    </html>
  );
}
