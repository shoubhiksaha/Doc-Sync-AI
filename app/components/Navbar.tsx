'use client';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';

export default function Navbar() {
  const { data: session } = useSession();

  // If we are not logged in, don't show the main navbar (middleware handles redirect)
  if (!session) return null;

  return (
    <nav style={{ padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
      <Link href="/" style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', textDecoration: 'none' }}>
        DocSync AI
      </Link>
      
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <Link href="/settings" style={{ color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.9rem' }}>
          Settings
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img 
            src={session.user?.image || ''} 
            alt="Profile" 
            style={{ width: '32px', height: '32px', borderRadius: '50%' }}
          />
          <button 
            onClick={() => signOut()}
            style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', fontSize: '0.9rem' }}
          >
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
}
