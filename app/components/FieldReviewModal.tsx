'use client';

import { useState } from 'react';

export type ExtractedField = {
  key: string;
  label: string;
  value: string;
  confidence: number;
  category: string;
  removed?: boolean;
};

interface FieldReviewModalProps {
  imageSrc: string;
  profileId: string;
  documentType: string;
  fields: ExtractedField[];
  onConfirm: (approvedFields: ExtractedField[], saveAsTemplate: boolean) => void;
  onCancel: () => void;
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  identity:  { bg: 'rgba(99,102,241,0.12)',  text: '#818cf8', border: 'rgba(99,102,241,0.3)' },
  financial: { bg: 'rgba(16,185,129,0.12)',  text: '#10b981', border: 'rgba(16,185,129,0.3)' },
  date:      { bg: 'rgba(245,158,11,0.12)',  text: '#f59e0b', border: 'rgba(245,158,11,0.3)' },
  contact:   { bg: 'rgba(236,72,153,0.12)',  text: '#ec4899', border: 'rgba(236,72,153,0.3)' },
  metadata:  { bg: 'rgba(107,114,128,0.12)', text: '#9ca3af', border: 'rgba(107,114,128,0.3)' },
  other:     { bg: 'rgba(107,114,128,0.08)', text: '#6b7280', border: 'rgba(107,114,128,0.2)' },
};

export default function FieldReviewModal({
  imageSrc, profileId, documentType, fields: initialFields, onConfirm, onCancel,
}: FieldReviewModalProps) {
  const [fields, setFields] = useState<ExtractedField[]>(initialFields);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [newValue, setNewValue] = useState('');
  const [imageZoomed, setImageZoomed] = useState(false);
  const [step, setStep] = useState<'review' | 'template'>('review');
  const [editLabelVal, setEditLabelVal] = useState('');
  const [editValueVal, setEditValueVal] = useState('');

  const activeFields = fields.filter(f => !f.removed);

  function removeField(i: number) {
    setFields(prev => prev.map((f, idx) => idx === i ? { ...f, removed: true } : f));
  }

  function restoreField(i: number) {
    setFields(prev => prev.map((f, idx) => idx === i ? { ...f, removed: false } : f));
  }

  function startEdit(i: number) {
    setEditingIndex(i);
    setEditLabelVal(fields[i].label);
    setEditValueVal(fields[i].value);
  }

  function saveEdit(i: number) {
    setFields(prev => prev.map((f, idx) =>
      idx === i ? { ...f, label: editLabelVal, value: editValueVal } : f
    ));
    setEditingIndex(null);
  }

  function addField() {
    const label = newLabel.trim();
    const value = newValue.trim();
    if (!label) return;
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    setFields(prev => [...prev, { key, label, value, confidence: 100, category: 'other' }]);
    setNewLabel('');
    setNewValue('');
  }

  const confColor = (c: number) => c >= 85 ? '#10b981' : c >= 65 ? '#f59e0b' : '#ef4444';
  const catStyle = (cat: string) => CATEGORY_COLORS[cat] || CATEGORY_COLORS.other;

  // ─── STEP 2: Template Dialog ───────────────────────────────────────────────
  if (step === 'template') {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1200,
        background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
      }}>
        <div style={{
          background: 'var(--bg-secondary)', borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--bg-glass-border)', maxWidth: '520px', width: '100%',
          boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
          animation: 'fadeSlideUp 250ms cubic-bezier(0.34, 1.56, 0.64, 1)',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            padding: '2rem 2rem 1.5rem',
            background: 'linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(16,185,129,0.08) 100%)',
            borderBottom: '1px solid var(--bg-glass-border)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '3.5rem', marginBottom: '0.75rem', lineHeight: 1 }}>🎯</div>
            <h2 style={{ fontSize: '1.4rem', margin: '0 0 0.75rem', fontWeight: 700 }}>
              One last thing before we sync!
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', margin: 0, lineHeight: 1.6 }}>
              You&apos;ve reviewed and confirmed <strong style={{ color: 'var(--text-primary)' }}>{activeFields.length} fields</strong> from this{' '}
              <strong style={{ color: 'var(--text-primary)' }}>{profileId.replace(/-/g, ' ')}</strong>.
            </p>
          </div>

          {/* The big question */}
          <div style={{ padding: '1.5rem 2rem' }}>
            <div style={{
              background: 'var(--bg-glass)', border: '1px solid var(--bg-glass-border)',
              borderRadius: 'var(--radius-lg)', padding: '1.25rem 1.5rem', marginBottom: '1.5rem',
            }}>
              <p style={{ fontSize: '1.05rem', fontWeight: 600, margin: '0 0 0.5rem', color: 'var(--text-primary)' }}>
                Will all your future <em style={{ fontStyle: 'normal', color: 'var(--accent-primary)' }}>{profileId.replace(/-/g, ' ')}</em> receipts always have these same fields?
              </p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.6 }}>
                If yes, we&apos;ll remember this layout so you never have to review fields again — just scan and sync!
              </p>
            </div>

            {/* Approved fields preview */}
            <div style={{ marginBottom: '1.5rem' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.6rem' }}>
                Fields that will be saved as template
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {activeFields.map(f => (
                  <span key={f.key} style={{
                    fontSize: '0.8rem', padding: '3px 10px',
                    background: 'rgba(99,102,241,0.12)', color: '#818cf8',
                    border: '1px solid rgba(99,102,241,0.25)', borderRadius: 'var(--radius-full)',
                  }}>
                    {f.label}
                  </span>
                ))}
              </div>
            </div>

            {/* CTA buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button
                className="btn btn-primary"
                onClick={() => onConfirm(activeFields, true)}
                style={{ padding: '1rem 1.5rem', fontSize: '1rem', borderRadius: 'var(--radius-lg)', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '2px' }}
              >
                <span>✅ Yes — Save this layout as my template</span>
                <span style={{ fontSize: '0.78rem', opacity: 0.8, fontWeight: 400 }}>
                  Next scans will auto-extract these {activeFields.length} fields. No review needed.
                </span>
              </button>

              <button
                className="btn btn-secondary"
                onClick={() => onConfirm(activeFields, false)}
                style={{ padding: '0.9rem 1.5rem', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '2px' }}
              >
                <span>🔄 No — My receipts vary, always ask me to review</span>
                <span style={{ fontSize: '0.78rem', opacity: 0.65, fontWeight: 400 }}>
                  Stay in discovery mode — full review for every scan.
                </span>
              </button>

              <button
                onClick={() => setStep('review')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.83rem', padding: '0.5rem', textDecoration: 'underline' }}
              >
                ← Go back and change fields
              </button>
            </div>
          </div>
        </div>

        <style>{`
          @keyframes fadeSlideUp {
            from { opacity: 0; transform: translateY(20px) scale(0.97); }
            to   { opacity: 1; transform: translateY(0)    scale(1);    }
          }
        `}</style>
      </div>
    );
  }

  // ─── STEP 1: Field Review UI ───────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1100,
      background: 'var(--bg-primary)',
      display: 'flex', overflow: 'hidden',
    }}>
      {/* LEFT: Image Panel */}
      <div style={{
        width: imageZoomed ? '62%' : '42%',
        transition: 'width 300ms ease',
        flexShrink: 0, display: 'flex', flexDirection: 'column',
        background: 'var(--bg-secondary)', borderRight: '1px solid var(--bg-glass-border)',
      }}>
        {/* Image header */}
        <div style={{
          padding: '0.9rem 1.25rem', borderBottom: '1px solid var(--bg-glass-border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
        }}>
          <div>
            <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Source Document</p>
            <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-primary)', marginTop: '2px', fontWeight: 500 }}>{documentType}</p>
          </div>
          <button
            onClick={() => setImageZoomed(z => !z)}
            style={{
              background: 'var(--bg-glass)', border: '1px solid var(--bg-glass-border)',
              borderRadius: 'var(--radius-md)', padding: '0.4rem 0.9rem',
              cursor: 'pointer', color: 'var(--text-primary)', fontSize: '0.82rem', fontWeight: 500,
              transition: 'background 150ms', boxShadow: 'var(--shadow-sm)',
            }}
          >
            {imageZoomed ? '⟵ Shrink' : '🔍 Zoom In'}
          </button>
        </div>

        {/* Image */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageSrc}
          alt="Source document"
          style={{ flex: 1, objectFit: 'contain', width: '100%', maxHeight: 'calc(100vh - 80px)', padding: '0.75rem' }}
        />
      </div>

      {/* RIGHT: Review Panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', minWidth: 0, background: 'var(--bg-primary)' }}>

        {/* Sticky header with instructions */}
        <div style={{
          padding: '1.5rem 1.5rem 0', background: 'var(--bg-primary)',
          position: 'sticky', top: 0, zIndex: 20, borderBottom: '1px solid var(--bg-glass-border)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
            <div>
              <h2 style={{ margin: '0 0 0.3rem', fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                📋 Review Extracted Fields
              </h2>
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                AI found <strong style={{ color: 'var(--text-primary)' }}>{fields.length}</strong> fields from your document
              </p>
            </div>
            <button
              onClick={onCancel}
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-glass-border)', cursor: 'pointer', color: 'var(--text-primary)', fontSize: '1.2rem', padding: '0.4rem 0.6rem', borderRadius: 'var(--radius-md)', lineHeight: 1, flexShrink: 0, boxShadow: 'var(--shadow-sm)' }}
            >
              ✕
            </button>
          </div>

          {/* Instruction Banner */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem',
            marginBottom: '1.5rem',
          }}>
            {[
              { icon: '✕', color: 'var(--error)', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)', text: 'Remove fields that are irrelevant or wrong' },
              { icon: '✏️', color: 'var(--warning)', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)', text: 'Edit any label or fix an incorrect value' },
              { icon: '+', color: 'var(--success)', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.2)', text: 'Add fields the AI missed from the document' },
            ].map(tip => (
              <div key={tip.icon} style={{
                padding: '0.85rem', borderRadius: 'var(--radius-md)',
                background: tip.bg, border: `1px solid ${tip.border}`,
                display: 'flex', flexDirection: 'column', gap: '0.4rem',
              }}>
                <span style={{ fontWeight: 800, color: tip.color, fontSize: '1.1rem' }}>{tip.icon}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 500, lineHeight: 1.4 }}>{tip.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Fields list */}
        <div style={{ padding: '1.5rem', flex: 1, background: 'var(--bg-primary)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {fields.map((field, i) => {
              const cs = catStyle(field.category);
              const isEditing = editingIndex === i;
              
              if (field.removed) {
                return (
                  <div key={field.key + i} style={{
                    background: 'var(--bg-secondary)', border: '1px dashed var(--bg-glass-border)',
                    borderRadius: 'var(--radius-md)', padding: '1rem',
                    display: 'flex', gap: '1rem',
                    alignItems: 'center', opacity: 0.65, boxShadow: 'none',
                  }}>
                    {/* Category + Confidence */}
                    <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'center', minWidth: '70px', opacity: 0.7 }}>
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '3px 6px', background: cs.bg, color: cs.text, border: `1px solid ${cs.border}`, borderRadius: '4px', textAlign: 'center', whiteSpace: 'nowrap', textTransform: 'uppercase' }}>
                        {field.category}
                      </span>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '3px 6px', background: `${confColor(field.confidence)}15`, color: confColor(field.confidence), border: `1px solid ${confColor(field.confidence)}30`, borderRadius: '4px' }}>
                        {field.confidence}%
                      </span>
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'line-through' }}>
                        {field.label}
                      </div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: field.value ? 'normal' : 'italic', textDecoration: 'line-through' }}>
                        {field.value || '— not found'}
                      </div>
                    </div>
                    <button
                      onClick={() => restoreField(i)}
                      style={{ background: 'var(--bg-primary)', border: '1px solid var(--bg-glass-border)', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-primary)', fontSize: '0.9rem', padding: '8px 14px', fontWeight: 600, boxShadow: 'var(--shadow-sm)', transition: 'all 150ms' }}
                    >
                      Restore
                    </button>
                  </div>
                );
              }

              return (
                <div key={field.key + i} style={{
                  background: isEditing ? 'var(--bg-secondary)' : 'var(--bg-primary)',
                  border: `1px solid ${isEditing ? 'var(--accent-primary)' : 'var(--bg-glass-border)'}`,
                  borderRadius: 'var(--radius-md)', padding: '1rem',
                  display: 'flex', gap: '1rem',
                  alignItems: isEditing ? 'flex-start' : 'center',
                  transition: 'all 150ms ease', boxShadow: 'var(--shadow-sm)',
                }}>
                  {/* Category + Confidence */}
                  <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'center', minWidth: '70px' }}>
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '3px 6px', background: cs.bg, color: cs.text, border: `1px solid ${cs.border}`, borderRadius: '4px', textAlign: 'center', whiteSpace: 'nowrap', textTransform: 'uppercase' }}>
                      {field.category}
                    </span>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '3px 6px', background: `${confColor(field.confidence)}15`, color: confColor(field.confidence), border: `1px solid ${confColor(field.confidence)}30`, borderRadius: '4px' }}>
                      {field.confidence}%
                    </span>
                  </div>

                  {/* Label + Value */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {isEditing ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        <input
                          autoFocus
                          value={editLabelVal}
                          onChange={e => setEditLabelVal(e.target.value)}
                          placeholder="Field label"
                          style={{ background: 'var(--bg-primary)', border: '1px solid var(--accent-primary)', borderRadius: '6px', padding: '0.5rem 0.75rem', color: 'var(--text-primary)', fontSize: '0.95rem', fontWeight: 600, outline: 'none', width: '100%', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)' }}
                        />
                        <input
                          value={editValueVal}
                          onChange={e => setEditValueVal(e.target.value)}
                          placeholder="Value from document"
                          style={{ background: 'var(--bg-primary)', border: '1px solid var(--bg-glass-border)', borderRadius: '6px', padding: '0.5rem 0.75rem', color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none', width: '100%', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)' }}
                        />
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                          <button onClick={() => saveEdit(i)} className="btn btn-primary" style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}>Save</button>
                          <button onClick={() => setEditingIndex(null)} className="btn btn-secondary" style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {field.label}
                        </div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 600, color: field.value ? 'var(--text-primary)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: field.value ? 'normal' : 'italic' }}>
                          {field.value || '— not found'}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Action buttons */}
                  {!isEditing && (
                    <div style={{ flexShrink: 0, display: 'flex', gap: '0.4rem' }}>
                      <button
                        onClick={() => startEdit(i)} title="Edit label or value"
                        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-glass-border)', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-primary)', fontSize: '1rem', padding: '6px 10px', transition: 'all 150ms', boxShadow: 'var(--shadow-sm)' }}
                      >✏️</button>
                      <button
                        onClick={() => removeField(i)} title="Remove this field"
                        style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px', cursor: 'pointer', color: 'var(--error)', fontSize: '1rem', padding: '6px 10px', transition: 'all 150ms', boxShadow: 'var(--shadow-sm)' }}
                      >✕</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add missing field */}
          <div style={{
            marginTop: '1.5rem',
            background: 'var(--bg-secondary)',
            border: '1px dashed var(--bg-glass-border)',
            borderRadius: 'var(--radius-md)', padding: '1.25rem 1.5rem',
          }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 700, margin: '0 0 0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              + Add a Field the AI Missed
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <input
                type="text"
                className="form-input"
                placeholder="Field name (e.g. Receipt Number)"
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addField()}
                style={{ flex: '2 1 140px', background: 'var(--bg-primary)' }}
              />
              <input
                type="text"
                className="form-input"
                placeholder="Value from image"
                value={newValue}
                onChange={e => setNewValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addField()}
                style={{ flex: '2 1 120px', background: 'var(--bg-primary)' }}
              />
              <button
                onClick={addField}
                disabled={!newLabel.trim()}
                className="btn btn-primary"
                style={{ flexShrink: 0, padding: '0.6rem 1.25rem' }}
              >
                Add Field
              </button>
            </div>
          </div>
        </div>

        {/* Sticky footer */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderTop: '1px solid var(--bg-glass-border)',
          background: 'var(--bg-secondary)',
          position: 'sticky', bottom: 0, zIndex: 20,
          display: 'flex', gap: '1rem', alignItems: 'center',
        }}>
          <span style={{ flex: 1, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--text-primary)', fontSize: '1.1rem' }}>{activeFields.length}</strong> field{activeFields.length !== 1 ? 's' : ''} ready to sync
          </span>
          <button onClick={onCancel} className="btn btn-secondary" style={{ flexShrink: 0, padding: '0.75rem 1.5rem' }}>
            Discard
          </button>
          <button
            onClick={() => setStep('template')}
            className="btn btn-primary"
            disabled={activeFields.length === 0}
            style={{ minWidth: '220px', flexShrink: 0, padding: '0.75rem 1.5rem', fontSize: '1.05rem' }}
          >
            Confirm {activeFields.length} Fields →
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
      `}</style>
    </div>
  );
}
