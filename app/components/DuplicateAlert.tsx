import React from 'react';

export type DuplicateAction = 'replace' | 'keep_both';

type DuplicateAlertProps = {
  duplicateCount: number;
  primaryKeyLabel: string;
  primaryKeyValue: string;
  onAction: (action: DuplicateAction) => void;
  onCancel: () => void;
};

export default function DuplicateAlert({ duplicateCount, primaryKeyLabel, primaryKeyValue, onAction, onCancel }: DuplicateAlertProps) {
  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
      backdropFilter: 'blur(4px)'
    }}>
      <div className="glass-panel" style={{ padding: '2.5rem 2rem', maxWidth: '450px', width: '90%', borderRadius: 'var(--radius-lg)', textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem', color: '#f59e0b' }}>⚠️</div>
        <h3 style={{ fontSize: '1.4rem', marginBottom: '0.5rem', color: '#f59e0b' }}>Duplicate Detected</h3>
        
        <p style={{ fontSize: '0.95rem', color: 'var(--text-primary)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
          We found <strong>{duplicateCount} existing record{duplicateCount > 1 ? 's' : ''}</strong> in your Google Sheet with the same {primaryKeyLabel}:<br/>
          <span style={{ display: 'inline-block', marginTop: '0.5rem', padding: '0.4rem 0.8rem', backgroundColor: 'var(--bg-secondary)', borderRadius: '4px', fontWeight: 600 }}>
            {primaryKeyValue}
          </span>
        </p>
        
        {duplicateCount > 1 && (
          <div style={{ fontSize: '0.8rem', color: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', padding: '0.5rem', borderRadius: '4px', marginBottom: '1.5rem' }}>
            Warning: Selecting &quot;Replace&quot; will overwrite all {duplicateCount} matching records.
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', flexDirection: 'column' }}>
          <button className="btn btn-primary" onClick={() => onAction('replace')}>
            Replace Existing Record{duplicateCount > 1 ? 's' : ''}
          </button>
          <button className="btn btn-secondary" onClick={() => onAction('keep_both')}>
            Keep Both (Force Sync)
          </button>
          <button className="btn btn-secondary" style={{ marginTop: '0.5rem', backgroundColor: 'transparent', border: 'none', color: 'var(--text-muted)' }} onClick={onCancel}>
            Cancel Sync
          </button>
        </div>
      </div>
    </div>
  );
}
