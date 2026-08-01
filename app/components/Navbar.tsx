'use client';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();

  // Hide navbar on the login page
  if (pathname === '/login') return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
      <nav style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
        <Link href="/" style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', textDecoration: 'none' }}>
          DocSync AI
        </Link>
        
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <Link href="/settings" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.9rem' }}>
            Settings
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {session?.user?.image ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img 
                src={session.user.image} 
                alt="Profile" 
                style={{ width: '32px', height: '32px', borderRadius: '50%' }}
              />
            ) : (
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>
                👤
              </div>
            )}
            <button 
              onClick={() => {
                document.cookie = "docsync_guest=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
                signOut({ callbackUrl: '/login' });
              }}
              style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', fontSize: '0.9rem' }}
            >
              Logout
            </button>
          </div>
        </div>
      </nav>

      {/* Demo Mode Banner */}
      {!session && (
        <div style={{ 
          backgroundColor: 'rgba(255, 165, 0, 0.1)', 
          borderBottom: '1px solid rgba(255, 165, 0, 0.3)',
          padding: '0.75rem 1rem', 
          textAlign: 'center', 
          fontSize: '0.9rem',
          color: 'var(--text-secondary)'
        }}>
          <strong style={{ color: 'orange' }}>⚠️ Demo Mode Active:</strong> You are currently editing a single, pre-existing global Google Sheet and media is hosted via Catbox.moe for demonstration purposes. 
          <br/>
          If you <strong>Log In with Google</strong>, the app will dynamically create brand new spreadsheets in your personal Google Drive and securely store all extracted images and audio there!
        </div>
      )}
    </div>
  );
}
