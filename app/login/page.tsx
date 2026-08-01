'use client';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();

  const handleDemoLogin = () => {
    document.cookie = "docsync_guest=true; path=/; max-age=86400"; // 1 day
    router.push('/');
  };

  return (
    <main className="container animate-fade-in" style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', maxWidth: '400px', width: '100%' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>DocSync AI</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
          Sign in to connect your Google Drive & Sheets securely.
        </p>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <button 
            onClick={() => signIn('google', { callbackUrl: '/' })}
            className="btn btn-primary"
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', fontSize: '1.1rem' }}
          >
            <span>🌐</span> Sign in with Google
          </button>

          <button 
            onClick={handleDemoLogin}
            className="btn btn-secondary"
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', fontSize: '1rem', opacity: 0.8 }}
          >
            Try Demo Mode (No Login)
          </button>
          
          <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'left' }}>
            <strong>💡 How it works:</strong>
            <ul style={{ paddingLeft: '1.25rem', marginTop: '0.5rem', marginBottom: 0 }}>
              <li><strong>Demo Mode:</strong> Uses a single global Google Sheet and free public media hosting (Catbox.moe) so judges can test instantly without logging in.</li>
              <li style={{ marginTop: '0.25rem' }}><strong>Google Login:</strong> Creates private spreadsheets and securely uploads media directly to your personal Google Drive.</li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
