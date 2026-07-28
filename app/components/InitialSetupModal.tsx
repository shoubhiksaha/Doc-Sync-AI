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
          
          <button 
            type="button" 
            onClick={() => setShowGuide(!showGuide)}
            style={{ 
              background: 'none', border: 'none', 
              color: 'var(--accent-primary)', fontSize: '0.85rem', 
              cursor: 'pointer', padding: 0, marginBottom: '1.25rem',
              display: 'flex', alignItems: 'center', gap: '0.25rem',
              fontWeight: 600
            }}
          >
            {showGuide ? '▼ Hide Guide' : '▶ How to find these keys? (Step-by-Step Guide)'}
          </button>

          {showGuide && (
            <div style={{ 
              background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
              padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem',
              fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.5'
            }}>
              <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '0.5rem' }}>Notion Setup Guide</strong>
              
              <b style={{ color: 'var(--text-primary)' }}>Step 1: Get Access Token</b><br/>
              Go to <a href="https://www.notion.so/my-integrations" target="_blank" style={{ color: 'var(--accent-primary)' }}>notion.so/my-integrations</a>.<br/>
              Click <i>+ New integration</i>. Name it &quot;DocSync AI&quot;.<br/>
              Copy the <b>Internal Integration Secret</b> (starts with <code>secret_</code> or <code>ntn_</code>).<br/><br/>
              
              <b style={{ color: 'var(--text-primary)' }}>Step 2: Create Your Page</b><br/>
              Open Notion and create a new empty page.<br/>
              Type <code>/database</code> and select &quot;Database - Full page&quot;.<br/><br/>
              
              <b style={{ color: 'var(--text-primary)' }}>Step 3: Connect DocSync AI</b><br/>
              On your new Database page, click the <b>...</b> (three dots) at the top-right.<br/>
              Scroll down to &quot;Connections&quot; &gt; &quot;Connect to&quot;.<br/>
              Search for &quot;DocSync AI&quot; and confirm access.<br/><br/>
              
              <b style={{ color: 'var(--text-primary)' }}>Step 4: Get Database ID</b><br/>
              Look at the URL of your database page:<br/>
              <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 4px', borderRadius: '4px', fontSize: '0.75rem' }}>https://notion.so/workspace/<b>395c...38ab</b>?v=...</code><br/>
              Copy the 32-character ID between the slash and the question mark.
            </div>
          )}

          <form onSubmit={handleSave}>
            <div className="form-group">
              <label className="form-label">Notion Integration Token</label>
              <input 
                type="password" 
                className="form-input" 
                placeholder="secret_... or ntn_..."
                value={notionKey}
                onChange={(e) => setNotionKey(e.target.value)}
              />
            </div>
            
            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label className="form-label">Notion Database ID</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="e.g. 395c...38ab"
                value={notionDb}
                onChange={(e) => setNotionDb(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button 
                type="button" 
                onClick={skipSetup}
                className="btn btn-secondary" 
                style={{ flex: 1, fontSize: '0.85rem' }}
              >
                Skip for now<br/>
                <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>(Use G-Drive instead)</span>
              </button>
              <button 
                type="submit" 
                disabled={saving || !notionKey || !notionDb}
                className="btn btn-primary" 
                style={{ flex: 1 }}
              >
                {saving ? 'Connecting...' : 'Connect Notion'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
