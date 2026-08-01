import React, { useState } from 'react';

type PrimaryKeyModalProps = {
  fields: { key: string; label: string }[];
  onConfirm: (primaryKey: string | null) => void;
};

export default function PrimaryKeyModal({ fields, onConfirm }: PrimaryKeyModalProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
      backdropFilter: 'blur(4px)'
    }}>
      <div className="glass-panel" style={{ padding: '2rem', maxWidth: '450px', width: '90%', borderRadius: 'var(--radius-lg)' }}>
        <h3 style={{ fontSize: '1.4rem', marginBottom: '0.75rem', color: 'var(--text-primary)' }}>Set a Primary Key?</h3>
        <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
          Choose a unique field (like a Receipt Number or PAN) to act as a Primary Key. 
          DocSync AI will alert you if you ever scan a document with a duplicate value and prevent accidental double-syncing.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '2rem', maxHeight: '200px', overflowY: 'auto' }}>
          {fields.map(f => (
            <label
              key={f.key}
              style={{
                display: 'flex', alignItems: 'center', padding: '0.75rem',
                backgroundColor: selectedKey === f.key ? 'rgba(99,102,241,0.1)' : 'var(--bg-secondary)',
                border: `1px solid ${selectedKey === f.key ? 'var(--accent-primary)' : 'var(--bg-glass-border)'}`,
                borderRadius: 'var(--radius-md)', cursor: 'pointer', transition: 'all 0.2s'
              }}
            >
              <input
                type="radio"
                name="primaryKey"
                value={f.key}
                checked={selectedKey === f.key}
                onChange={() => setSelectedKey(f.key)}
                style={{ marginRight: '0.75rem', accentColor: 'var(--accent-primary)' }}
              />
              <span style={{ fontWeight: 500 }}>{f.label}</span>
            </label>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={() => onConfirm(null)}>
            Skip
          </button>
          <button className="btn btn-primary" disabled={!selectedKey} onClick={() => onConfirm(selectedKey)}>
            Set Primary Key
          </button>
        </div>
      </div>
    </div>
  );
}
