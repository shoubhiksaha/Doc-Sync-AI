'use client';

import { useState } from 'react';

// Inlined to avoid cross-boundary server-route imports in client components
export type SuggestedField = {
  key: string;
  label: string;
  example: string;
  confidence: number;
  reason: string;
  required: boolean;
};

interface SheetSetupModalProps {
  profileId: string;
  suggestedFields: SuggestedField[];
  onConfirm: (columns: { key: string; label: string }[], spreadsheetId: string, sheetUrl: string) => void;
  onCancel: () => void;
}

export default function SheetSetupModal({ profileId, suggestedFields, onConfirm, onCancel }: SheetSetupModalProps) {
  const [fields, setFields] = useState<SuggestedField[]>(suggestedFields);
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const sheetTitle = profileId === 'ngo-receipt' ? 'DocSync — NGO Receipts' : 'DocSync — Factory Weight Slips';
  const lowConfidenceCount = fields.filter(f => f.confidence < 75).length;

  function removeField(index: number) {
    setFields(prev => prev.filter((_, i) => i !== index));
  }

  function updateLabel(index: number, newLabel: string) {
    setFields(prev => prev.map((f, i) => i === index ? { ...f, label: newLabel } : f));
  }

  function addField() {
    const label = newFieldLabel.trim();
    if (!label) return;
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    setFields(prev => [...prev, {
      key,
      label,
      example: '',
      confidence: 100,
      reason: 'Manually added by user',
      required: false,
    }]);
    setNewFieldLabel('');
  }

  async function handleConfirm() {
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/sheets/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          columns: fields.map(f => ({ key: f.key, label: f.label })),
          profileId,
          sheetTitle,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create sheet');
      onConfirm(
        fields.map(f => ({ key: f.key, label: f.label })),
        data.spreadsheetId,
        data.spreadsheetUrl,
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setCreating(false);
    }
  }

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
        maxWidth: '640px', width: '100%',
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
        animation: 'fadeIn 200ms ease',
      }}>
        {/* Header */}
        <div style={{ padding: '1.75rem 1.75rem 1.25rem', borderBottom: '1px solid var(--bg-glass-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '1.5rem' }}>📊</span>
            <h2 style={{ fontSize: '1.35rem', margin: 0 }}>Set Up Your Google Sheet</h2>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
            This is a <strong>one-time setup</strong>. AI analyzed your document and proposed these columns.
            Review, rename, or remove any field before creating your sheet.
          </p>

          {/* Warning banner for low confidence */}
          {lowConfidenceCount > 0 && (
            <div style={{
              marginTop: '1rem',
              padding: '0.75rem 1rem',
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.85rem', color: '#d97706',
              display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
            }}>
              <span>⚠️</span>
              <span><strong>{lowConfidenceCount} field{lowConfidenceCount > 1 ? 's have' : ' has'} low AI confidence</strong> — review the amber badges below before confirming.</span>
            </div>
          )}
        </div>

        {/* Field List */}
        <div style={{ padding: '1.25rem 1.75rem' }}>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Proposed Columns ({fields.length})
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {fields.map((field, i) => {
              const isLowConf = field.confidence < 75;
              const confColor = field.confidence >= 85 ? '#10b981' : field.confidence >= 65 ? '#f59e0b' : '#ef4444';
              const isEditing = editingIndex === i;

              return (
                <div key={field.key + i} style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '0.75rem 1rem',
                  background: isLowConf ? 'rgba(245,158,11,0.06)' : 'var(--bg-glass)',
                  border: `1px solid ${isLowConf ? 'rgba(245,158,11,0.3)' : 'var(--bg-glass-border)'}`,
                  borderRadius: 'var(--radius-md)',
                  transition: 'all 150ms ease',
                }}>
                  {/* Confidence Badge */}
                  <span style={{
                    flexShrink: 0,
                    width: '42px', textAlign: 'center',
                    fontSize: '0.72rem', fontWeight: 700,
                    padding: '2px 4px',
                    background: `${confColor}20`,
                    color: confColor,
                    border: `1px solid ${confColor}50`,
                    borderRadius: 'var(--radius-sm)',
                  }}>
                    {field.confidence}%
                  </span>

                  {/* Field Label (editable) */}
                  <div style={{ flex: 1 }}>
                    {isEditing ? (
                      <input
                        autoFocus
                        value={field.label}
                        onChange={(e) => updateLabel(i, e.target.value)}
                        onBlur={() => setEditingIndex(null)}
                        onKeyDown={(e) => e.key === 'Enter' && setEditingIndex(null)}
                        style={{
                          background: 'transparent', border: 'none',
                          borderBottom: '1px solid var(--accent-primary)',
                          color: 'var(--text-primary)', fontSize: '0.95rem',
                          fontWeight: 600, outline: 'none', width: '100%',
                        }}
                      />
                    ) : (
                      <span
                        onClick={() => setEditingIndex(i)}
                        title="Click to rename"
                        style={{
                          fontSize: '0.95rem', fontWeight: 600,
                          cursor: 'text',
                          borderBottom: '1px dashed transparent',
                        }}
                      >
                        {field.label}
                      </span>
                    )}
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '1px' }}>
                      e.g. &ldquo;{field.example || '—'}&rdquo; · {field.reason}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                    <button
                      onClick={() => setEditingIndex(isEditing ? null : i)}
                      title="Rename field"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.9rem', padding: '4px' }}
                    >✏️</button>
                    <button
                      onClick={() => removeField(i)}
                      title="Remove field"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '0.9rem', padding: '4px' }}
                    >✕</button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add custom field */}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <input
              type="text"
              className="form-input"
              placeholder="+ Add a custom column (e.g. Receipt No.)"
              value={newFieldLabel}
              onChange={(e) => setNewFieldLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addField()}
              style={{ flex: 1 }}
            />
            <button
              onClick={addField}
              disabled={!newFieldLabel.trim()}
              className="btn btn-secondary"
              style={{ padding: '0.75rem 1rem', flexShrink: 0 }}
            >Add</button>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '1.25rem 1.75rem', borderTop: '1px solid var(--bg-glass-border)' }}>
          {error && (
            <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-md)', color: '#ef4444', fontSize: '0.875rem' }}>
              ❌ {error}
            </div>
          )}

          {/* Sheet title preview */}
          <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            <span>📄</span>
            <span>Will create: <strong style={{ color: 'var(--text-primary)' }}>&ldquo;{sheetTitle}&rdquo;</strong> in your Google Drive</span>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button onClick={onCancel} className="btn btn-secondary" style={{ flex: 1 }} disabled={creating}>
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="btn btn-primary"
              style={{ flex: 2 }}
              disabled={creating || fields.length === 0}
            >
              {creating ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                  Creating Sheet...
                </span>
              ) : `✅ Create Sheet & Sync (${fields.length} columns)`}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
