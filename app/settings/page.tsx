'use client';
import { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';

export default function SettingsPage() {
  const [openAiKey, setOpenAiKey] = useState('');
  const [notionKey, setNotionKey] = useState('');
  const [notionDbId, setNotionDbId] = useState('');

  // Load from API on mount
  useEffect(() => {
    // Clear old plaintext keys if they exist (migration to secure cookies)
    localStorage.removeItem('openai_key');
    localStorage.removeItem('notion_key');
    localStorage.removeItem('notion_db_id');

    fetch('/api/settings').then(res => res.json()).then(data => {
      if (data.hasOpenAiKey) setOpenAiKey('********');
      if (data.hasNotionKey) setNotionKey('********');
      if (data.hasNotionDbId) setNotionDbId('********');
    });
  }, []);

  const handleSave = async () => {
    const payload = {
      openaiKey: openAiKey !== '********' ? openAiKey : undefined,
      notionKey: notionKey !== '********' ? notionKey : undefined,
      notionDbId: notionDbId !== '********' ? notionDbId : undefined,
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

        {/* OpenAI / GitHub Models Section */}
        <section className="glass-panel" style={{ padding: '2rem', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>🧠</span> AI Model Key (BYOK)
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
            DocSync AI uses <strong>gpt-4o-mini</strong> and <strong>gpt-4o</strong> for document extraction. You can use:
          </p>
          <ul style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem', paddingLeft: '1.25rem', lineHeight: 1.8 }}>
            <li><strong>OpenAI API key</strong> — starts with <code>sk-</code> (paid, from platform.openai.com)</li>
            <li><strong>GitHub Personal Access Token</strong> — starts with <code>ghp_</code> or <code>github_pat_</code> (free! via GitHub Marketplace Models)</li>
          </ul>
          <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: 'var(--radius-md)', padding: '0.75rem 1rem', fontSize: '0.8rem', marginBottom: '1rem', color: 'var(--text-secondary)' }}>
            💡 <strong>Get a free GitHub token:</strong> Go to <a href="https://github.com/settings/tokens" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>github.com/settings/tokens</a> → Generate new token (classic) → no scopes needed → copy the <code>ghp_...</code> token.
          </div>
          <div className="form-group">
            <label className="form-label">OpenAI API Key or GitHub PAT</label>
            <input 
              type="password" 
              className="form-input" 
              placeholder="sk-... or ghp_... or github_pat_..." 
              value={openAiKey}
              onChange={(e) => setOpenAiKey(e.target.value)}
            />
          </div>
        </section>

        {/* Notion Section */}
        <section className="glass-panel" style={{ padding: '2rem', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>📓</span> Notion Integration
          </h2>
          
          <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', fontSize: '0.9rem', lineHeight: 1.6 }}>
            <h3 style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Notion Setup Guide</h3>
            <p><strong>Step 1: Get Access Token</strong><br/>
            Go to <a href="https://notion.so/my-integrations" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>notion.so/my-integrations</a>. Click &quot;+ New integration&quot;. Name it &quot;DocSync AI&quot; and submit. Copy the Access token.</p>
            <p style={{ marginTop: '0.5rem' }}><strong>Step 2: Create Your Database Page</strong><br/>
            Open Notion, create an empty page. Type `/database` and select &quot;Database - Full page&quot;.</p>
            <p style={{ marginTop: '0.5rem' }}><strong>Step 3: Connect DocSync AI</strong><br/>
            Click the `...` (three dots) top-right in Notion. Go to &quot;Connections&quot; {'>'} &quot;Connect to&quot;. Search for &quot;DocSync AI&quot;.</p>
            <p style={{ marginTop: '0.5rem' }}><strong>Step 4: Get Database ID</strong><br/>
            Look at the URL: `https://app.notion.com/p/[THIS_IS_THE_ID]?v=...`</p>
          </div>

          <div className="form-group">
            <label className="form-label">Notion Access Token</label>
            <input 
              type="password" 
              className="form-input" 
              placeholder="ntn_..." 
              value={notionKey}
              onChange={(e) => setNotionKey(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Notion Database ID</label>
            <input 
              type="text" 
              className="form-input" 
              placeholder="e.g. 395c...38ab" 
              value={notionDbId}
              onChange={(e) => setNotionDbId(e.target.value)}
            />
          </div>
        </section>

        <button onClick={handleSave} className="btn btn-primary" style={{ width: '100%', fontSize: '1.1rem' }}>
          Save All Settings
        </button>
      </div>
    </main>
  );
}
