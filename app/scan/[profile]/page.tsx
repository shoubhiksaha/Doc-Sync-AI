'use client';
import { useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast, { Toaster } from 'react-hot-toast';
import { NgoReceiptSchema, FactoryWeightSlipSchema } from '@/lib/schemas';
import SheetSetupModal, { type SuggestedField } from '@/app/components/SheetSetupModal';

type ProcessingStats = {
  originalSize: number;
  ocrSize: number;
  archiveSize: number;
};

type AuditLog = {
  stage: string;
  status: 'success' | 'warning' | 'error';
  message: string;
};

type SheetColumn = { key: string; label: string };

export default function ScanPage() {
  const params = useParams();
  const router = useRouter();
  const profileId = params.profile as string;

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [hasExtracted, setHasExtracted] = useState(false);
  const [stats, setStats] = useState<ProcessingStats | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sheet setup modal state
  const [showSheetModal, setShowSheetModal] = useState(false);
  const [suggestedFields, setSuggestedFields] = useState<SuggestedField[]>([]);
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(null);
  const [spreadsheetUrl, setSpreadsheetUrl] = useState<string | null>(null);
  // Image archive links (from process-document)
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [notionFileId, setNotionFileId] = useState<string | null>(null);
  // Pending data to sync once sheet is created
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pendingSyncData, setPendingSyncData] = useState<Record<string, any> | null>(null);

  const schema = profileId === 'ngo-receipt' ? NgoReceiptSchema : FactoryWeightSlipSchema;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, reset, getValues, formState: { errors, isDirty } } = useForm<Record<string, any>>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
  });

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (isDirty && !window.confirm("You have unsaved manual edits. Proceeding will discard them. Continue?")) return;
      const url = URL.createObjectURL(file);
      setImageSrc(url);
      processImage(file);
    }
  };

  const processImage = async (file: File) => {
    setIsProcessing(true);
    setHasExtracted(false);
    setStats(null);
    setAuditLogs([]);
    try {
      const formData = new FormData();
      formData.append('document', file);
      formData.append('profileId', profileId);
      const res = await fetch('/api/process-document', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        reset(data.data);
        setStats(data.stats);
        if (data.auditLogs) setAuditLogs(data.auditLogs);
        // Store image references for sync
        if (data.imageUrl) setImageUrl(data.imageUrl);
        if (data.notionFileId) setNotionFileId(data.notionFileId);
        setHasExtracted(true);
        const uploadMsg = data.imageUrl ? ' Image archived to Drive ✓' : '';
        toast.success(`Document analyzed!${uploadMsg}`);
      } else {
        toast.error(data.error || 'Failed to process document');
      }
    } catch (err) {
      console.error(err);
      toast.error('Network error during processing.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Check if this profile's sheet has been set up (cookie exists)
  function getSheetIdFromCookie(): string | null {
    if (typeof document === 'undefined') return null;
    const cookieName = `docsync_sheet_${profileId.replace(/-/g, '_')}`;
    const match = document.cookie.match(new RegExp(`(?:^|; )${cookieName}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doSync = async (data: Record<string, any>, sheetId: string | null, cols?: SheetColumn[]) => {
    setIsSyncing(true);
    const toastId = toast.loading('Syncing to Sheets & Notion...');
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, profileId, spreadsheetId: sheetId, columns: cols, imageUrl, notionFileId }),
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onSubmit = async (data: Record<string, any>) => {
    const existingSheetId = getSheetIdFromCookie() || spreadsheetId;

    if (existingSheetId) {
      // Sheet already exists — sync directly
      await doSync(data, existingSheetId);
    } else {
      // First time — trigger AI schema suggestion then show modal
      setPendingSyncData(data);
      const toastId = toast.loading('AI is analyzing your document to design your Sheet...');
      try {
        const res = await fetch('/api/sheets/suggest-schema', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ extractedData: data, profileId }),
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
        // Fallback: sync without a sheet
        await doSync(data, null);
      }
    }
  };

  const handleModalConfirm = async (cols: SheetColumn[], newSheetId: string, newSheetUrl: string) => {
    setShowSheetModal(false);
    setSpreadsheetId(newSheetId);
    setSpreadsheetUrl(newSheetUrl);
    toast.success('Sheet created! Now syncing data...');
    if (pendingSyncData) {
      await doSync(pendingSyncData, newSheetId, cols);
      setPendingSyncData(null);
    }
  };

  const getProfileTitle = () => {
    switch (profileId) {
      case 'ngo-receipt': return 'NGO Donation Receipt';
      case 'factory-weight-slip': return 'Factory Weight-Slip';
      default: return 'Document';
    }
  };

  const formatSize = (bytes: number) => (bytes / 1024).toFixed(1) + ' KB';
  const existingSheetId = getSheetIdFromCookie() || spreadsheetId;

  return (
    <main className="container animate-fade-in" style={{ padding: '2rem 1rem', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Toaster position="top-center" />

      {/* Sheet Setup Modal */}
      {showSheetModal && suggestedFields.length > 0 && (
        <SheetSetupModal
          profileId={profileId}
          suggestedFields={suggestedFields}
          onConfirm={handleModalConfirm}
          onCancel={() => { setShowSheetModal(false); setPendingSyncData(null); }}
        />
      )}

      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', margin: 0 }}>Scanning: {getProfileTitle()}</h1>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {existingSheetId && spreadsheetUrl && (
            <a
              href={spreadsheetUrl}
              target="_blank" rel="noreferrer"
              style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
            >
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
          <p style={{ color: 'var(--text-secondary)' }}>
            {existingSheetId ? 'Sheet is ready. Scan a document to add a row.' : 'First scan will set up your Google Sheet automatically.'}
          </p>
          <input type="file" accept="image/*" capture="environment" ref={fileInputRef} style={{ display: 'none' }} onChange={handleCapture} />
        </div>
      ) : (
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>

          {/* Left Panel: Image */}
          <div className="glass-panel" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            <h3 style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Original Scan</h3>
            <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius-md)', backgroundColor: '#000', minHeight: '300px', display: 'flex' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageSrc} alt="Scanned Document" style={{ width: '100%', objectFit: 'contain' }} />
              {hasExtracted && !isProcessing && (
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                  <div style={{ position: 'absolute', top: '30%', left: '20%', width: '60%', height: '10%', border: '2px solid rgba(99,102,241,0.8)', backgroundColor: 'rgba(99,102,241,0.1)', borderRadius: '4px' }} />
                  <div style={{ position: 'absolute', top: '45%', left: '20%', width: '40%', height: '8%', border: '2px solid rgba(245,158,11,0.8)', backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: '4px' }} />
                  <div style={{ position: 'absolute', top: '60%', left: '20%', width: '50%', height: '8%', border: '2px solid rgba(99,102,241,0.8)', backgroundColor: 'rgba(99,102,241,0.1)', borderRadius: '4px' }} />
                </div>
              )}
              {isProcessing && (
                <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexDirection: 'column', gap: '0.75rem' }}>
                  <div className="animate-pulse" style={{ fontSize: '2rem' }}>⚙️</div>
                  <p style={{ margin: 0 }}>Codex Pipeline Running...</p>
                </div>
              )}
            </div>

            <button className="btn btn-secondary" style={{ marginTop: '1rem' }} onClick={() => fileInputRef.current?.click()}>Retake Photo</button>
            <input type="file" accept="image/*" capture="environment" ref={fileInputRef} style={{ display: 'none' }} onChange={handleCapture} />

            {/* Compression Report */}
            {stats && (
              <div style={{ marginTop: '1.5rem', background: 'var(--bg-secondary)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
                <h4 style={{ fontSize: '0.85rem', marginBottom: '0.75rem', color: 'var(--text-secondary)' }}>⚡ Zero-Storage Compression Report</h4>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                  <span>Original: {formatSize(stats.originalSize)}</span>
                  <span>Archived: {formatSize(stats.archiveSize)}</span>
                </div>
                <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--bg-glass-border)', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${(stats.archiveSize / stats.originalSize) * 100}%`, height: '100%', background: 'linear-gradient(90deg, var(--accent-primary), #ec4899)' }} />
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem', margin: 0 }}>
                  Saved {(((stats.originalSize - stats.archiveSize) / stats.originalSize) * 100).toFixed(0)}% · Processed in-memory · Never written to disk
                </p>
              </div>
            )}

            {/* Audit Logs */}
            {auditLogs.length > 0 && (
              <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <h4 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>🔍 Codex Audit Log</h4>
                {auditLogs.map((log, idx) => (
                  <div key={idx} style={{
                    fontSize: '0.75rem', padding: '0.5rem 0.75rem', borderRadius: '4px',
                    backgroundColor: log.status === 'success' ? 'rgba(16,185,129,0.1)' : log.status === 'warning' ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)',
                    borderLeft: `3px solid ${log.status === 'success' ? '#10b981' : log.status === 'warning' ? '#f59e0b' : '#ef4444'}`,
                  }}>
                    <strong>[{log.stage}]</strong> {log.message}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Panel: Form */}
          <div className="glass-panel" style={{ padding: '1.5rem', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.25rem', margin: 0 }}>Extracted Data</h3>
              {!isProcessing && hasExtracted && (
                <span style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem', backgroundColor: 'rgba(245,158,11,0.15)', color: '#d97706', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 'var(--radius-full)', fontWeight: 600 }}>
                  Review Required
                </span>
              )}
            </div>

            {isProcessing ? (
              <div className="animate-pulse" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {[1, 2, 3, 4].map(i => (
                  <div key={i} style={{ height: '3rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }} />
                ))}
              </div>
            ) : hasExtracted ? (
              <form onSubmit={handleSubmit(onSubmit)}>
                <div className="form-group">
                  <label className="form-label">Date</label>
                  <input type="text" className="form-input" {...register('date')} placeholder="e.g. 24-Oct-2023" />
                  {errors.date?.message && <span style={{ color: 'var(--error)', fontSize: '0.8rem' }}>{String(errors.date.message)}</span>}
                </div>

                {profileId === 'ngo-receipt' ? (
                  <>
                    <div className="form-group">
                      <label className="form-label">Donor Name</label>
                      <input type="text" className="form-input" {...register('donorName')} placeholder="e.g. Rahul Sharma" />
                      {errors.donorName?.message && <span style={{ color: 'var(--error)', fontSize: '0.8rem' }}>{String(errors.donorName.message)}</span>}
                    </div>
                    <div className="form-group">
                      <label className="form-label">Amount (₹)</label>
                      <input type="number" className="form-input" {...register('amount', { valueAsNumber: true })} placeholder="e.g. 5000" />
                      {errors.amount?.message && <span style={{ color: 'var(--error)', fontSize: '0.8rem' }}>{String(errors.amount.message)}</span>}
                    </div>
                    <div className="form-group">
                      <label className="form-label">PAN Number <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
                      <input type="text" className="form-input" {...register('panNumber')} placeholder="e.g. ABCDE1234F" />
                      {errors.panNumber?.message && <span style={{ color: 'var(--error)', fontSize: '0.8rem' }}>{String(errors.panNumber.message)}</span>}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="form-group">
                      <label className="form-label">Vehicle Number</label>
                      <input type="text" className="form-input" {...register('vehicleNumber')} placeholder="e.g. MH-12-AB-1234" />
                      {errors.vehicleNumber?.message && <span style={{ color: 'var(--error)', fontSize: '0.8rem' }}>{String(errors.vehicleNumber.message)}</span>}
                    </div>
                    <div className="form-group">
                      <label className="form-label">Gross Weight (kg)</label>
                      <input type="number" className="form-input" {...register('grossWeight', { valueAsNumber: true })} placeholder="e.g. 15000" />
                      {errors.grossWeight?.message && <span style={{ color: 'var(--error)', fontSize: '0.8rem' }}>{String(errors.grossWeight.message)}</span>}
                    </div>
                    <div className="form-group">
                      <label className="form-label">Tare Weight (kg)</label>
                      <input type="number" className="form-input" {...register('tareWeight', { valueAsNumber: true })} placeholder="e.g. 5000" />
                      {errors.tareWeight?.message && <span style={{ color: 'var(--error)', fontSize: '0.8rem' }}>{String(errors.tareWeight.message)}</span>}
                    </div>
                  </>
                )}

                {/* Sheet status indicator */}
                <div style={{ marginBottom: '1rem', padding: '0.6rem 1rem', borderRadius: 'var(--radius-md)', fontSize: '0.82rem',
                  background: existingSheetId ? 'rgba(16,185,129,0.08)' : 'rgba(99,102,241,0.08)',
                  border: `1px solid ${existingSheetId ? 'rgba(16,185,129,0.25)' : 'rgba(99,102,241,0.25)'}`,
                  color: existingSheetId ? '#10b981' : 'var(--accent-primary)',
                }}>
                  {existingSheetId
                    ? '✅ Google Sheet linked — will sync directly'
                    : '📊 First sync — AI will propose Sheet columns for your review'}
                </div>

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ flex: 1 }}
                    onClick={() => { reset(getValues()); setHasExtracted(false); setImageSrc(null); }}
                  >
                    Discard
                  </button>
                  <button type="submit" disabled={isSyncing} className="btn btn-primary" style={{ flex: 2 }}>
                    {isSyncing ? 'Syncing...' : existingSheetId ? '⬆️ Sync to Sheets & Notion' : '📊 Review & Create Sheet'}
                  </button>
                </div>
              </form>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '3rem' }}>
                <p>Upload a document to extract data</p>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
