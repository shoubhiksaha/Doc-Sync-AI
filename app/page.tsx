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

          {/* Greyed Out / Coming Soon Profiles */}
          {[
            {
              title: 'Factory Scrap Weight-Slips',
              desc: 'Extract vehicle no, gross weight, tare weight, and timestamp from kachha bills.'
            },
            {
              title: 'Fleet Fuel & Petty Cash',
              desc: 'Parse logistics fuel slips, toll receipts, and driver petty cash notes.'
            },
            {
              title: 'Construction Material Inward',
              desc: 'Digitize sand/cement inward challans for site inventory reconciliation.'
            },
            { title: 'Kirana Store Khatas', desc: 'Convert handwritten credit ledgers into structured customer balance sheets.' },
            { title: 'Mandi Auction Slips', desc: 'Extract crop type, farmer name, weight, and bid price from APMC mandi slips.' },
            { title: 'Transport Lorry Receipts (LR)', desc: 'Digitize consignor, consignee, e-way bill number, and freight amounts.' },
            { title: 'Dairy Collection Slips', desc: 'Parse milk weight, fat percentage, SNF, and rate per liter from local dairy chits.' },
            { title: 'Handloom Weaver Logs', desc: 'Digitize yarn consumed, meters woven, and piece-rate wage calculations.' },
            { title: 'Brick Kiln Token Slips', desc: 'Count bricks molded, baked, and dispatched using daily worker tokens.' },
            { title: 'Medical Store Prescriptions', desc: 'Convert handwritten doctor notes to structured medicine order lists.' },
            { title: 'Jewelry Making (K कारीगरी) Logs', desc: 'Track raw gold issued, wastage, and finished ornament weight.' },
            { title: 'Tailoring Measurement Books', desc: 'Digitize customer measurements and fabric details for boutique management.' },
            { title: 'Caterer Raw Material Bills', desc: 'Parse sabzi mandi and wholesale grocery handwritten invoices.' },
            { title: 'Daily Wage Muster Rolls', desc: 'Extract worker attendance, half-days, and daily payouts from register photos.' },
            { title: 'Scrap Dealer (Kabadiwala) Rates', desc: 'Parse daily rate cards and collection weight receipts by material type.' },
            { title: 'Garage Repair Estimates', desc: 'Digitize handwritten mechanic quotes for spare parts and labor.' },
            { title: 'Agriculture Pesticide Bills', desc: 'Track fertilizers, seed varieties, and agrochemical purchases for farm accounting.' },
            { title: 'Fish Market Auction Chits', desc: 'Parse boat name, catch type, weight, and wholesale bid amounts.' },
            { title: 'Event Decorator Challans', desc: 'Track chairs, tents, and lighting equipment rented out and returned.' },
            { title: 'Cable TV / WiFi Collection Receipts', desc: 'Digitize monthly subscription payments collected door-to-door.' },
            { title: 'Ration Shop (PDS) Distribution Logs', desc: 'Parse family ration card numbers and grain quantities disbursed.' },
            { title: 'Handicraft Artisan Piece-rate Cards', desc: 'Digitize items produced, quality checks, and payment due.' },
            { title: 'Local Courier Delivery Run-sheets', desc: 'Extract tracking numbers, receiver signatures, and COD collected.' },
            { title: 'Godown Storage Receipts', desc: 'Parse farmer name, commodity, bag count, and storage duration.' },
            { title: 'Timber Mart Measurement Slips', desc: 'Digitize wood type, logs count, length, girth, and cubic feet volume.' },
            { title: 'Mobile Repair Job Cards', desc: 'Extract customer issue, IMEI, spare part used, and total repair cost.' },
            { title: 'Street Vendor Daily Finance', desc: 'Digitize micro-loan collections (daily bishi/chit fund payments).' }
          ].map((profile, i) => (
            <div key={i} className="profile-card" style={cardStyle(false)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1.25rem', color: 'var(--text-primary)', margin: 0 }}>{profile.title}</h3>
                <span style={badgeStyle('var(--warning)')}>Coming Soon</span>
              </div>
              <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>{profile.desc}</p>
            </div>
          ))}

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
