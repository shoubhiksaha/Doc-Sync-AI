'use client';
import { signIn } from 'next-auth/react';

export default function LoginPage() {
  return (
    <main className="container animate-fade-in" style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', maxWidth: '400px', width: '100%' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>DocSync AI</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
          Sign in to connect your Google Drive & Sheets securely.
        </p>
        
        <button 
          onClick={() => signIn('google', { callbackUrl: '/' })}
          className="btn btn-primary"
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', fontSize: '1.1rem' }}
        >
          <span>🌐</span> Sign in with Google
        </button>
      </div>
    </main>
  );
}
