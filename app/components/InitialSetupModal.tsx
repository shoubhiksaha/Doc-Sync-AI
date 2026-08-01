'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

export default function InitialSetupModal() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(true);
  const [showGuide, setShowGuide] = useState(false);
  const [notionKey, setNotionKey] = useState('');
  const [notionDb, setNotionDb] = useState('');
  const [saving, setSaving] = useState(false);

  const skipSetup = async () => {
    document.cookie = "docsync_notion_skipped=true; path=/; max-age=315360000"; // 10 years
    // Set default destination to GDrive if they skip Notion
    document.cookie = "docsync_upload_dest=gdrive; path=/; max-age=315360000";
    setIsOpen(false);
    toast.success("Skipped! We'll just use Google Sheets & Drive for now.");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          notionKey, 
          notionDb,
          uploadDest: 'notion' // Default to Notion only if they bother setting it up now
        }),
      });
      
      const data = await res.json();
      if (data.success) {
        toast.success("Notion Connected!");
        setIsOpen(false);
        router.refresh();
      } else {
        toast.error(data.error || "Failed to save settings");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1rem',
    }}>
      <div style={{
        background: 'var(--bg-secondary)', borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--bg-glass-border)',
        maxWidth: '500px', width: '100%',
        boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
        animation: 'fadeIn 200ms ease',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{ padding: '1.75rem 1.75rem 1rem', borderBottom: '1px solid var(--bg-glass-border)' }}>
          <h2 style={{ fontSize: '1.35rem', margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>📝</span> Optional: Connect Notion
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
            Sync extracted data & images directly into a Notion Database. <span style={{ color: 'var(--accent-primary)', fontWeight: 500 }}>Saves your Google Drive space!</span>
          </p>
        </div>

        {/* Content */}
        <div style={{ padding: '1.5rem 1.75rem' }}>
          
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
            <button 
              type="button" 
              onClick={skipSetup}
              style={{
                flex: 1, padding: '0.75rem', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-light)', background: 'transparent',
                color: 'var(--text-primary)', fontWeight: 500, cursor: 'pointer'
              }}
            >
              Skip (Google Drive Only)
            </button>
            <a 
              href="/api/auth/notion"
              style={{
                flex: 1, padding: '0.75rem', borderRadius: 'var(--radius-md)',
                background: '#000000', color: '#ffffff', border: '1px solid rgba(255,255,255,0.1)',
                fontWeight: 600, cursor: 'pointer', textAlign: 'center',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem',
                textDecoration: 'none'
              }}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4z"></path><path d="M4 8h16"></path><path d="M8 4v4"></path></svg>
              Connect to Notion
            </a>
          </div>

          <div style={{ 
            background: 'var(--bg-glass)', border: '1px solid var(--bg-glass-border)',
            padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem',
            fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: '1.6'
          }}>
            <strong style={{ display: 'block', marginBottom: '0.75rem', fontSize: '0.95rem' }}>Auto-Magic Setup ✨</strong>
            <div style={{ marginBottom: '0.5rem' }}><b>Step 1:</b> Click the connect button above.</div>
            <div style={{ marginBottom: '0.5rem' }}><b>Step 2:</b> When Notion asks which pages to share, select the page where you want your database to live.</div>
            <div><b>Step 3:</b> DocSync will automatically create the &quot;DocSync AI Data&quot; database for you and connect it!</div>
          </div>


        </div>
      </div>
    </div>
  );
}
