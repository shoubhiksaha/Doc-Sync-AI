'use client';
import { useState, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import toast, { Toaster } from 'react-hot-toast';
import SheetSetupModal, { type SuggestedField } from '@/app/components/SheetSetupModal';
import FieldReviewModal, { type ExtractedField } from '@/app/components/FieldReviewModal';

// Template stored in localStorage per profile
const TEMPLATE_KEY = (profileId: string) => `docsync_template_v1_${profileId}`;

type SavedTemplate = {
  fields: { key: string; label: string }[];
  savedAt: string;
};

type AuditLog = {
  stage: string;
  status: 'success' | 'warning' | 'error';
  message: string;
};

type SheetColumn = { key: string; label: string };

function loadTemplate(profileId: string): SavedTemplate | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(TEMPLATE_KEY(profileId));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveTemplate(profileId: string, fields: { key: string; label: string }[]) {
  if (typeof window === 'undefined') return;
  const template: SavedTemplate = { fields, savedAt: new Date().toISOString() };
  localStorage.setItem(TEMPLATE_KEY(profileId), JSON.stringify(template));
}

function clearTemplate(profileId: string) {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TEMPLATE_KEY(profileId));
}

export default function ScanPage() {
  const params = useParams();
  const router = useRouter();
  const profileId = params.profile as string;

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [stats, setStats] = useState<{ originalSize: number; processedSize: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Adaptive extraction state
  const [showFieldReview, setShowFieldReview] = useState(false);
  const [extractedFields, setExtractedFields] = useState<ExtractedField[]>([]);
  const [documentType, setDocumentType] = useState('');
  const [approvedFields, setApprovedFields] = useState<ExtractedField[] | null>(null);
  const [savedTemplate, setSavedTemplate] = useState<SavedTemplate | null>(() => loadTemplate(profileId));

  // Sheet setup modal state
  const [showSheetModal, setShowSheetModal] = useState(false);
  const [suggestedFields, setSuggestedFields] = useState<SuggestedField[]>([]);
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(null);
  const [spreadsheetUrl, setSpreadsheetUrl] = useState<string | null>(null);

  const [pendingSyncFields, setPendingSyncFields] = useState<ExtractedField[] | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setImageSrc(url);
      setSelectedFile(file);
      setApprovedFields(null);
      setAuditLogs([]);
      setStats(null);
    }
  };

  // STEP 1: Extract all fields from the document (free-form)
  const extractFields = async (file: File) => {
    setIsProcessing(true);
    setAuditLogs([{ stage: 'Extraction', status: 'success', message: 'Running full-document AI extraction...' }]);

    try {
      const formData = new FormData();
      formData.append('document', file);
      formData.append('profileId', profileId);

      // If we have a saved template, hint the AI to focus on those fields
      if (savedTemplate) {
        formData.append('customFields', JSON.stringify(savedTemplate.fields.map(f => f.label)));
      }

      const res = await fetch('/api/extract-freeform', { method: 'POST', body: formData });
      const data = await res.json();

      if (!data.success) {
        toast.error(data.error || 'Extraction failed');
        setAuditLogs([{ stage: 'Extraction', status: 'error', message: data.error || 'Failed' }]);
        return;
      }

      setStats(data.stats);
      setDocumentType(data.documentType);
      setAuditLogs([
        { stage: 'Extraction', status: 'success', message: `Found ${data.fields.length} fields in: ${data.documentType}` },
        ...(data.isMock ? [{ stage: 'System', status: 'warning' as const, message: 'Using mock data — no API key configured' }] : []),
      ]);

      // If template saved — auto-approve and skip review
      if (savedTemplate) {
        // Only keep fields that match saved template keys
        const templateKeys = new Set(savedTemplate.fields.map(f => f.key));
        const matched = data.fields.filter((f: ExtractedField) => templateKeys.has(f.key));
        // Add any template fields not found by AI (with empty values for manual entry)
        const foundKeys = new Set(matched.map((f: ExtractedField) => f.key));
        const missing = savedTemplate.fields
          .filter(f => !foundKeys.has(f.key))
          .map(f => ({ ...f, value: '', confidence: 0, category: 'other' }));

        const finalFields = [...matched, ...missing];
        setApprovedFields(finalFields);

        // Check conditions for auto-sync: all template fields found AND all have >= 95 confidence
        const allFound = missing.length === 0;
        const allHighConfidence = matched.every((f: ExtractedField) => f.confidence >= 95);

        if (allFound && allHighConfidence) {
          setAuditLogs(prev => [...prev, { stage: 'Template', status: 'success', message: `Template matched perfectly (${matched.length} fields) with high confidence. Auto-syncing...` }]);
          // Give React a tick to update the UI, then trigger sync
          setTimeout(() => onSyncClick(finalFields), 500);
        } else {
          setAuditLogs(prev => [...prev, { stage: 'Template', status: 'warning', message: `Template applied but requires review. ${missing.length} missing, ${matched.filter((f: ExtractedField) => f.confidence < 95).length} low confidence.` }]);
          toast('Please review the extracted data before syncing', { icon: '⚠️' });
        }
      } else {
        // Show review modal for first-time / discovery mode
        setExtractedFields(data.fields);
        setShowFieldReview(true);
      }

    } catch (err) {
      console.error(err);
      toast.error('Network error during extraction');
    } finally {
      setIsProcessing(false);
    }
  };

  // STEP 2: User confirmed fields + template preference
  const handleFieldsConfirmed = (fields: ExtractedField[], saveAsTemplate: boolean) => {
    setShowFieldReview(false);
    setApprovedFields(fields);

    if (saveAsTemplate) {
      saveTemplate(profileId, fields.map(f => ({ key: f.key, label: f.label })));
      setSavedTemplate({ fields: fields.map(f => ({ key: f.key, label: f.label })), savedAt: new Date().toISOString() });
      toast.success(`✅ Template saved! Future scans will use ${fields.length} fields automatically.`, { duration: 5000 });
    } else {
      toast(`🔄 Discovery mode — you'll review fields every scan.`, { duration: 4000 });
    }

    // Directly trigger sync step to avoid extra click
    onSyncClick(fields);
  };

  // STEP 3: Sync approved fields to Sheets + Notion
  const doSync = async (fields: ExtractedField[], sheetId: string | null, cols?: SheetColumn[]) => {
    setIsSyncing(true);
    const toastId = toast.loading('Syncing to Sheets & Notion...');

    const data: Record<string, string> = {};
    fields.forEach(f => { data[f.key] = f.value; });

    try {
      const formData = new FormData();
      formData.append('data', JSON.stringify(data));
      formData.append('profileId', profileId);
      if (sheetId) formData.append('spreadsheetId', sheetId);
      if (cols) formData.append('columns', JSON.stringify(cols));
      if (selectedFile) formData.append('document', selectedFile);

      const res = await fetch('/api/sync', {
        method: 'POST',
        body: formData,
      });
      const result = await res.json();
      if (result.success) {
        toast.success('Successfully synced! ✅', { id: toastId });
        if (spreadsheetUrl || result.spreadsheetUrl) {
          toast.success(
            <span>View your Sheet: <a href={spreadsheetUrl || result.spreadsheetUrl} target="_blank" rel="noreferrer" style={{ color: '#818cf8' }}>Open →</a></span>,
            { duration: 6000 }
          );
        }
        setTimeout(() => router.push('/'), 2000);
      } else {
        toast.error(result.errors?.[0] || 'Sync failed', { id: toastId });
      }
    } catch {
      toast.error('Failed to sync data', { id: toastId });
    } finally {
      setIsSyncing(false);
    }
  };

  const onSyncClick = async (overrideFields?: ExtractedField[]) => {
    const fieldsToSync = overrideFields || approvedFields;
    if (!fieldsToSync) return;
    const existingSheetId = getSheetIdFromCookie() || spreadsheetId;

    if (existingSheetId) {
      await doSync(fieldsToSync, existingSheetId);
    } else {
      setPendingSyncFields(fieldsToSync);
      const toastId = toast.loading('AI is designing your Google Sheet columns...');
      try {
        const res = await fetch('/api/sheets/suggest-schema', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ extractedData: Object.fromEntries(fieldsToSync.map(f => [f.key, f.value])), profileId }),
        });
        const result = await res.json();
        if (res.ok && result.fields?.length) {
          setSuggestedFields(result.fields);
          setShowSheetModal(true);
          toast.dismiss(toastId);
        } else {
          throw new Error(result.error || 'No fields returned');
        }
      } catch {
        toast.error('Could not generate schema. Using default columns.', { id: toastId });
        await doSync(fieldsToSync, null);
      }
    }
  };

  const handleModalConfirm = async (cols: SheetColumn[], newSheetId: string, newSheetUrl: string) => {
    setShowSheetModal(false);
    setSpreadsheetId(newSheetId);
    setSpreadsheetUrl(newSheetUrl);
    toast.success('Sheet created! Now syncing data...');
    if (pendingSyncFields) {
      await doSync(pendingSyncFields, newSheetId, cols);
      setPendingSyncFields(null);
    }
  };

  function getSheetIdFromCookie(): string | null {
    if (typeof document === 'undefined') return null;
    const cookieName = `docsync_sheet_${profileId.replace(/-/g, '_')}`;
    const match = document.cookie.match(new RegExp(`(?:^|; )${cookieName}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
  }

  const getProfileTitle = () => {
    switch (profileId) {
      case 'ngo-receipt': return 'NGO Donation Receipt';
      case 'factory-weight-slip': return 'Factory Weight-Slip';
      default: return 'Document';
    }
  };

  const formatSize = (bytes: number) => (bytes / 1024).toFixed(1) + ' KB';
  const existingSheetId = getSheetIdFromCookie() || spreadsheetId;

  if (!isMounted) return null;

  return (
    <main className="container animate-fade-in" style={{ padding: '2rem 1rem', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Toaster position="top-center" />

      {/* Field Review Modal (full-screen, side-by-side) */}
      {showFieldReview && imageSrc && (
        <FieldReviewModal
          imageSrc={imageSrc}
          profileId={profileId}
          documentType={documentType}
          fields={extractedFields}
          onConfirm={handleFieldsConfirmed}
          onCancel={() => setShowFieldReview(false)}
        />
      )}

      {/* Sheet Setup Modal */}
      {showSheetModal && suggestedFields.length > 0 && (
        <SheetSetupModal
          profileId={profileId}
          suggestedFields={suggestedFields}
          onConfirm={handleModalConfirm}
          onCancel={() => { setShowSheetModal(false); setPendingSyncFields(null); }}
        />
      )}

      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', margin: 0 }}>Scanning: {getProfileTitle()}</h1>
          {savedTemplate && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
              <span style={{ fontSize: '0.75rem', color: '#10b981' }}>✅ Template active ({savedTemplate.fields.length} fields)</span>
              <button
                onClick={() => { clearTemplate(profileId); setSavedTemplate(null); toast('Template cleared — back to discovery mode', { icon: '🔄' }); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.7rem', color: 'var(--text-muted)', textDecoration: 'underline', padding: 0 }}
              >
                reset
              </button>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {existingSheetId && spreadsheetUrl && (
            <a href={spreadsheetUrl} target="_blank" rel="noreferrer"
              style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              📊 View Sheet →
            </a>
          )}
          <button className="btn btn-secondary" onClick={() => router.push('/')}>Back</button>
        </div>
      </header>

      {!imageSrc ? (
        <div
          className="glass-panel"
          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', minHeight: '400px' }}
          onClick={() => fileInputRef.current?.click()}
        >
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📷</div>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Tap to Scan</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 0 }}>
            {savedTemplate
              ? `Template ready (${savedTemplate.fields.length} fields) — scan to auto-extract`
              : existingSheetId
                ? 'Sheet is ready. Scan a document to add a row.'
                : 'AI will extract all fields for your review.'}
          </p>
          {savedTemplate && (
            <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem', justifyContent: 'center', maxWidth: '400px' }}>
              {savedTemplate.fields.map(f => (
                <span key={f.key} style={{ fontSize: '0.75rem', padding: '2px 8px', background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 'var(--radius-full)' }}>
                  {f.label}
                </span>
              ))}
            </div>
          )}
          <input type="file" accept="image/*" capture="environment" ref={fileInputRef} style={{ display: 'none' }} onChange={handleCapture} />
        </div>
      ) : (
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>

          {/* Left Panel: Image (sticky) */}
          <div className="glass-panel" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', position: 'sticky', top: '1rem', alignSelf: 'start', zIndex: 10, maxHeight: 'calc(100vh - 2rem)', overflowY: 'auto' }}>
            <h3 style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Original Scan</h3>
            <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius-md)', backgroundColor: '#000', flex: 1, display: 'flex' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageSrc} alt="Scanned Document" style={{ width: '100%', objectFit: 'contain' }} />
              {isProcessing && (
                <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexDirection: 'column', gap: '0.75rem' }}>
                  <div className="animate-pulse" style={{ fontSize: '2rem' }}>🔍</div>
                  <p style={{ margin: 0, fontSize: '0.95rem' }}>AI Extracting All Fields...</p>
                  <p style={{ margin: 0, fontSize: '0.78rem', opacity: 0.7 }}>This may take a few seconds</p>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { fileInputRef.current?.click(); }}>Retake</button>
              {selectedFile && !approvedFields && !isProcessing && (
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => extractFields(selectedFile)}>
                  {savedTemplate ? '🔍 Extract Approved Data' : '🔍 Extract All Fields'}
                </button>
              )}
              {approvedFields && !isProcessing && (
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setShowFieldReview(true); setExtractedFields(approvedFields); }}>
                  ✏️ Re-review
                </button>
              )}
            </div>
            <input type="file" accept="image/*" capture="environment" ref={fileInputRef} style={{ display: 'none' }} onChange={handleCapture} />

            {/* Stats */}
            {stats && (
              <div style={{ marginTop: '1rem', background: 'var(--bg-secondary)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)' }}>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
                  ⚡ {formatSize(stats.originalSize)} → {formatSize(stats.processedSize)} · In-memory, never on disk
                </p>
              </div>
            )}

            {/* Audit Logs */}
            {auditLogs.length > 0 && (
              <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {auditLogs.map((log, idx) => (
                  <div key={idx} style={{
                    fontSize: '0.73rem', padding: '0.4rem 0.65rem', borderRadius: '4px',
                    backgroundColor: log.status === 'success' ? 'rgba(16,185,129,0.1)' : log.status === 'warning' ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)',
                    borderLeft: `3px solid ${log.status === 'success' ? '#10b981' : log.status === 'warning' ? '#f59e0b' : '#ef4444'}`,
                  }}>
                    <strong>[{log.stage}]</strong> {log.message}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Panel: Approved Fields */}
          <div className="glass-panel" style={{ padding: '1.5rem', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.2rem', margin: 0 }}>
                {approvedFields ? `Extracted Data (${approvedFields.length} fields)` : 'Extracted Data'}
              </h3>
              {approvedFields && !isProcessing && (
                <span style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem', backgroundColor: 'rgba(245,158,11,0.15)', color: '#d97706', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 'var(--radius-full)', fontWeight: 600 }}>
                  Review Required
                </span>
              )}
            </div>

            {isProcessing ? (
              <div className="animate-pulse" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <div key={i} style={{ height: '3rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }} />
                ))}
              </div>
            ) : approvedFields ? (
              <>
                {/* Field Value List (editable inline) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.5rem' }}>
                  {approvedFields.map((field, i) => (
                    <div key={field.key + i} style={{
                      padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-glass)', border: '1px solid var(--bg-glass-border)',
                    }}>
                      <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '0.3rem' }}>
                        {field.label}
                      </label>
                      <input
                        type="text"
                        defaultValue={field.value}
                        onChange={e => {
                          const updated = [...approvedFields];
                          updated[i] = { ...updated[i], value: e.target.value };
                          setApprovedFields(updated);
                        }}
                        style={{
                          background: 'transparent', border: 'none', borderBottom: '1px solid var(--bg-glass-border)',
                          color: 'var(--text-primary)', fontSize: '0.97rem', fontWeight: 500,
                          width: '100%', outline: 'none', padding: '2px 0',
                        }}
                        placeholder="—"
                      />
                    </div>
                  ))}
                </div>

                {/* Sheet status */}
                <div style={{ marginBottom: '1rem', padding: '0.6rem 1rem', borderRadius: 'var(--radius-md)', fontSize: '0.82rem',
                  background: existingSheetId ? 'rgba(16,185,129,0.08)' : 'rgba(99,102,241,0.08)',
                  border: `1px solid ${existingSheetId ? 'rgba(16,185,129,0.25)' : 'rgba(99,102,241,0.25)'}`,
                  color: existingSheetId ? '#10b981' : 'var(--accent-primary)',
                }}>
                  {existingSheetId ? '✅ Google Sheet linked — will sync directly' : '📊 First sync — AI will propose Sheet columns for your review'}
                </div>

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setApprovedFields(null); setAuditLogs([]); setStats(null); setImageSrc(null); }}>
                    Discard
                  </button>
                  <button className="btn btn-primary" style={{ flex: 2 }} disabled={isSyncing} onClick={() => onSyncClick()}>
                    {isSyncing ? 'Syncing...' : existingSheetId ? '⬆️ Sync to Sheets & Notion' : '📊 Review & Create Sheet'}
                  </button>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '3rem' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🔍</div>
                <p style={{ marginBottom: '0.5rem' }}>
                  {selectedFile ? 'Click "Extract All Fields" to start AI analysis' : 'Upload a document to begin'}
                </p>
                {!savedTemplate && (
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', opacity: 0.7 }}>
                    AI will extract every visible field for your review
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
