'use client';
import { useState, useEffect, Suspense } from 'react';
import { toast } from 'react-hot-toast';
import { useSearchParams } from 'next/navigation';

function SettingsContent() {
  const searchParams = useSearchParams();
  const [openAiKey, setOpenAiKey] = useState('');
  const [notionKey, setNotionKey] = useState('');
  const [notionDbId, setNotionDbId] = useState('');
  const [uploadDest, setUploadDest] = useState('both');
  const [persistent, setPersistent] = useState(false);

  // Load from API on mount
  useEffect(() => {
    // Show toast if just returned from Notion OAuth
    if (searchParams.get('notionConnected') === 'true') {
      toast.success('Notion successfully connected! 🎉');
      // Clean up the URL
      window.history.replaceState({}, '', '/settings');
    }
    
    // Clear old plaintext keys if they exist (migration to secure cookies)
    localStorage.removeItem('openai_key');
    localStorage.removeItem('notion_key');
    localStorage.removeItem('notion_db_id');

    fetch('/api/settings').then(res => res.json()).then(data => {
      if (data.hasOpenAiKey) setOpenAiKey('********');
      if (data.hasNotionKey) setNotionKey('********');
      if (data.hasNotionDbId) setNotionDbId('********');
      if (data.uploadDest) setUploadDest(data.uploadDest);
      if (data.isPersistent) setPersistent(true);
    });
  }, []);

  const handleSave = async () => {
    const payload = {
      openaiKey: openAiKey !== '********' ? openAiKey : undefined,
      notionKey: notionKey !== '********' ? notionKey : undefined,
      notionDbId: notionDbId !== '********' ? notionDbId : undefined,
      uploadDest,
      persistent,
    };

    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      toast.success('Settings securely saved!');
    } else {
      toast.error('Failed to save settings.');
    }
  };

  return (
    <main className="container animate-fade-in" style={{ padding: '2rem 1rem' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '2rem' }}>Settings & Integrations</h1>

        {/* Universal BYOK Section */}
        <section className="glass-panel" style={{ padding: '2rem', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>🧠</span> Universal AI Model Key (BYOK)
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
            DocSync AI supports ANY major AI provider for document extraction and transcription! You can use:
          </p>
          <ul style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem', paddingLeft: '1.25rem', lineHeight: 1.8 }}>
            <li><strong>Google Gemini</strong> (FREE! Starts with <code>AIzaSy...</code>) — Highly recommended for accurate OCR.</li>
            <li><strong>Groq</strong> (FREE! Starts with <code>gsk_...</code>) — Blazing fast LLaMA Vision and Whisper.</li>
            <li><strong>OpenAI</strong> (Paid, starts with <code>sk-...</code> or <code>proj-...</code>) — Full support for GPT-4o and Whisper.</li>
          </ul>
          <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: 'var(--radius-md)', padding: '0.75rem 1rem', fontSize: '0.8rem', marginBottom: '1rem', color: 'var(--text-secondary)' }}>
            💡 <strong>Get a free key:</strong> Go to <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>Groq Console</a> or <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>Google AI Studio</a>. Our <strong>UniversalAIAdapter</strong> will automatically detect which provider your key belongs to!
          </div>
          <div className="form-group">
            <label className="form-label">Gemini, Groq, or OpenAI API Key</label>
            <input 
              type="password" 
              className="form-input" 
              placeholder="AIzaSy... / gsk_... / sk-..." 
              value={openAiKey}
              onChange={(e) => setOpenAiKey(e.target.value)}
            />
          </div>
        </section>

        {/* Notion Section */}
        <section className="glass-panel" style={{ padding: '2rem', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>📓</span> Notion Integration
            </div>
            {notionKey === '********' && (
              <span style={{ fontSize: '0.8rem', backgroundColor: 'rgba(34, 197, 94, 0.1)', color: 'var(--success)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                Connected
              </span>
            )}
          </h2>
          
          <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', fontSize: '0.9rem', lineHeight: 1.6 }}>
            <h3 style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Auto-Magic Setup ✨</h3>
            <p><strong>Step 1:</strong> Click &quot;Connect to Notion&quot; below.</p>
            <p style={{ marginTop: '0.5rem' }}><strong>Step 2:</strong> When Notion asks which pages to share, select the page where you want your database to live.</p>
            <p style={{ marginTop: '0.5rem' }}><strong>Step 3:</strong> DocSync will automatically create the &quot;DocSync AI Data&quot; database for you!</p>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            {notionKey === '********' ? (
              <div style={{ padding: '1rem', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-card)' }}>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Your Notion workspace is securely connected via OAuth.</p>
                <a href="/api/auth/notion" style={{ fontSize: '0.8rem', color: 'var(--primary)', textDecoration: 'underline' }}>Reconnect or change workspace</a>
              </div>
            ) : (
              <a href="/api/auth/notion" className="btn btn-primary" style={{ width: '100%', padding: '0.75rem', fontSize: '1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4z"></path><path d="M4 8h16"></path><path d="M8 4v4"></path></svg>
                Connect to Notion
              </a>
            )}
          </div>
        </section>

        {/* Upload Settings */}
        <section className="glass-panel" style={{ padding: '2rem', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>🖼️</span> Image Archive Destination
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
            Where should the scanned document images be uploaded? Note: Notion links are private (only accessible while logged into your Notion account). GDrive links are publicly viewable.
          </p>
          <div className="form-group">
            <label className="form-label">Upload Images To:</label>
            <select 
              className="form-input" 
              value={uploadDest}
              onChange={(e) => setUploadDest(e.target.value)}
            >
              <option value="both">Both Google Drive & Notion</option>
              <option value="gdrive">Google Drive Only</option>
              <option value="notion">Notion Only</option>
            </select>
          </div>
        </section>
        
        {/* Security / Persistent Mode */}
        <section className="glass-panel" style={{ padding: '2rem', marginBottom: '2rem', border: '1px solid var(--accent-primary)' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>🔐</span> Security Mode
          </h2>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
            <input 
              type="checkbox" 
              id="persistent-mode"
              checked={persistent}
              onChange={(e) => setPersistent(e.target.checked)}
              style={{ marginTop: '4px', width: '1.2rem', height: '1.2rem', accentColor: 'var(--accent-primary)' }}
            />
            <div>
              <label htmlFor="persistent-mode" style={{ display: 'block', fontWeight: 600, fontSize: '1rem', marginBottom: '0.25rem', cursor: 'pointer' }}>
                Remember my keys across devices (Persistent Mode)
              </label>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0, lineHeight: 1.5 }}>
                {persistent ? (
                  <><strong>Persistent Mode:</strong> Your keys will be securely encrypted using Google Cloud KMS and saved to your account in Firestore. They will survive cookie clears and sync across devices.</>
                ) : (
                  <><strong>Stateless Mode (Default):</strong> Maximum privacy. Keys are saved only in an encrypted HttpOnly cookie on this specific device. They are never written to our database.</>
                )}
              </p>
            </div>
          </div>
        </section>

        <button onClick={handleSave} className="btn btn-primary" style={{ width: '100%', fontSize: '1.1rem' }}>
          Save All Settings
        </button>
      </div>
    </main>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="container" style={{ padding: '2rem 1rem' }}>Loading...</div>}>
      <SettingsContent />
    </Suspense>
  );
}
