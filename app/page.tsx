import Link from 'next/link';
import { cookies } from 'next/headers';
import InitialSetupModal from './components/InitialSetupModal';

export default function Home() {
  const cookieStore = cookies();
  const hasNotionKey = cookieStore.has('docsync_notion');
  const hasSkippedNotion = cookieStore.has('docsync_notion_skipped');
  const showNotionSetup = !hasNotionKey && !hasSkippedNotion;

  return (
    <main className="container flex-col items-center justify-center animate-fade-in" style={{ minHeight: '100vh', display: 'flex' }}>
      
      {showNotionSetup && <InitialSetupModal />}
      
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <h1 className="text-gradient" style={{ fontSize: '3rem', marginBottom: '1rem' }}>DocSync AI</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.25rem', maxWidth: '600px', margin: '0 auto' }}>
          Zero-Storage Agentic Document Intelligence for India&apos;s Informal Economy.
        </p>
      </div>

      <div className="glass-panel" style={{ padding: '2rem', width: '100%', maxWidth: '800px' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem', textAlign: 'center' }}>Select Document Profile</h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
          
          {/* Active Profiles */}
          <Link href="/scan/ngo-receipt" style={{ textDecoration: 'none' }}>
            <div className="profile-card" style={cardStyle(true)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1.25rem', color: 'var(--text-primary)', margin: 0 }}>NGO Donation Receipts</h3>
                <span style={badgeStyle('var(--success)')}>Active</span>
              </div>
              <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>Extract donor details, amount, PAN, and date from handwritten trust receipts.</p>
            </div>
          </Link>

          <Link href="/scan/factory-weight-slip" style={{ textDecoration: 'none' }}>
            <div className="profile-card" style={cardStyle(true)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1.25rem', color: 'var(--text-primary)', margin: 0 }}>Factory Scrap Weight-Slips</h3>
                <span style={badgeStyle('var(--success)')}>Active</span>
              </div>
              <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>Extract vehicle no, gross weight, tare weight, and timestamp from kachha bills.</p>
            </div>
          </Link>

          {/* Coming Soon Profiles */}
          <div className="profile-card" style={cardStyle(false)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.25rem', color: 'var(--text-primary)', margin: 0 }}>Fleet Fuel & Petty Cash</h3>
              <span style={badgeStyle('var(--warning)')}>Coming Soon</span>
            </div>
            <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>Parse logistics fuel slips, toll receipts, and driver petty cash notes.</p>
          </div>

          <div className="profile-card" style={cardStyle(false)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.25rem', color: 'var(--text-primary)', margin: 0 }}>Construction Material Inward</h3>
              <span style={badgeStyle('var(--warning)')}>Coming Soon</span>
            </div>
            <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>Digitize sand/cement inward challans for site inventory reconciliation.</p>
          </div>

        </div>
      </div>
      
      <footer style={{ marginTop: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
        <p>100% Zero-Storage Architecture. Data is processed in-memory and discarded.</p>
      </footer>

      {/* Inline styles for hover effects until we add them to globals.css */}
      <style dangerouslySetInnerHTML={{__html: `
        .profile-card {
          transition: all var(--transition-fast);
        }
        .profile-card:hover {
          transform: translateY(-4px);
          box-shadow: var(--shadow-lg);
          border-color: var(--accent-primary) !important;
        }
      `}} />
    </main>
  );
}

// Helper functions for inline styles
function cardStyle(active: boolean) {
  return {
    padding: '1.5rem',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--bg-glass-border)',
    backgroundColor: 'var(--bg-primary)',
    cursor: active ? 'pointer' : 'not-allowed',
    opacity: active ? 1 : 0.6,
    height: '100%',
    display: 'flex',
    flexDirection: 'column' as const,
  };
}

function badgeStyle(color: string) {
  return {
    fontSize: '0.75rem',
    fontWeight: 600,
    padding: '0.25rem 0.5rem',
    borderRadius: 'var(--radius-full)',
    backgroundColor: `${color}20`,
    color: color,
    border: `1px solid ${color}40`,
  };
}
