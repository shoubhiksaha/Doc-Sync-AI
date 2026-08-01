'use client';
import { useState, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import toast, { Toaster } from 'react-hot-toast';
import SheetSetupModal, { type SuggestedField } from '@/app/components/SheetSetupModal';
import FieldReviewModal, { type ExtractedField } from '@/app/components/FieldReviewModal';
import PrimaryKeyModal from '@/app/components/PrimaryKeyModal';
import DuplicateAlert, { type DuplicateAction } from '@/app/components/DuplicateAlert';

// Template stored in localStorage per profile
const TEMPLATE_KEY = (profileId: string) => `docsync_template_v1_${profileId}`;

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  identity:  { bg: 'rgba(99,102,241,0.12)',  text: '#818cf8', border: 'rgba(99,102,241,0.3)' },
  financial: { bg: 'rgba(16,185,129,0.12)',  text: '#10b981', border: 'rgba(16,185,129,0.3)' },
  date:      { bg: 'rgba(245,158,11,0.12)',  text: '#f59e0b', border: 'rgba(245,158,11,0.3)' },
  contact:   { bg: 'rgba(236,72,153,0.12)',  text: '#ec4899', border: 'rgba(236,72,153,0.3)' },
  metadata:  { bg: 'rgba(107,114,128,0.12)', text: '#9ca3af', border: 'rgba(107,114,128,0.3)' },
  other:     { bg: 'rgba(107,114,128,0.08)', text: '#6b7280', border: 'rgba(107,114,128,0.2)' },
};

const catStyle = (cat?: string) => CATEGORY_COLORS[cat || 'other'] || CATEGORY_COLORS.other;
const confColor = (c: number) => c >= 85 ? '#10b981' : c >= 65 ? '#f59e0b' : '#ef4444';

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
  const [pendingReview, setPendingReview] = useState(false);
  const [pendingAutoSync, setPendingAutoSync] = useState<ExtractedField[] | null>(null);
  const [extractedFields, setExtractedFields] = useState<ExtractedField[]>([]);
  const [documentType, setDocumentType] = useState('');
  const [approvedFields, setApprovedFields] = useState<ExtractedField[] | null>(null);
  const [savedTemplate, setSavedTemplate] = useState<SavedTemplate | null>(() => loadTemplate(profileId));
  const [syncResult, setSyncResult] = useState<{ success: boolean; details: ExtractedField[]; url: string } | null>(null);
  const [showPrimaryKeyModal, setShowPrimaryKeyModal] = useState(false);
  const [duplicateAlertData, setDuplicateAlertData] = useState<{ count: number; label: string; value: string; fieldsToSync: ExtractedField[]; existingSheetId: string | null; cols?: SheetColumn[] } | null>(null);

  // Note & Audio State
  const [noteText, setNoteText] = useState('');
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  useEffect(() => {
    if (audioBlob) {
      const url = URL.createObjectURL(audioBlob);
      setAudioUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setAudioUrl(null);
    }
  }, [audioBlob]);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);

  useEffect(() => {
    if (!isRecording && !isTranscribing) {
      if (pendingReview) {
        setShowFieldReview(true);
        setPendingReview(false);
      }
      if (pendingAutoSync) {
        setTimeout(() => onSyncClick(pendingAutoSync), 500);
        setPendingAutoSync(null);
      }
    }
  }, [isRecording, isTranscribing, pendingReview, pendingAutoSync]);

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

  const toggleVoiceRecord = async () => {
    if (isRecording) {
      if (mediaRecorder) mediaRecorder.stop();
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/mp4' });
        setAudioBlob(blob);
        stream.getTracks().forEach(track => track.stop());

        // Call backend for Whisper transcription
        setIsTranscribing(true);
        try {
          const formData = new FormData();
          formData.append('audio', blob, 'voicenote.webm');
          const res = await fetch('/api/transcribe', { method: 'POST', body: formData });
          const data = await res.json();
          if (data.text) {
            setNoteText(prev => prev ? `${prev}\n\n${data.text}` : data.text);
            toast.success('Audio transcribed successfully');
          } else {
            toast.error(data.error || 'Transcription failed (Check OpenAI Key)');
          }
        } catch (err) {
          toast.error('Network error during transcription');
        } finally {
          setIsTranscribing(false);
        }
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      toast.success('Recording... tap mic to stop.');
    } catch (err) {
      console.error(err);
      toast.error('Microphone access denied');
    }
  };

  const handleCapture = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setImageSrc(url);
      setSelectedFile(file);
      setExtractedFields([]);
      setApprovedFields(null);
      setSyncResult(null);
      setNoteText('');
      setAudioBlob(null);
      setAuditLogs([]);
      setStats(null);
      setPendingReview(false);
      setPendingAutoSync(null);
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

        if (allFound && allHighConfidence) {
          setAuditLogs(prev => [...prev, { stage: 'Template', status: 'success', message: `Template matched perfectly (${matched.length} fields) with high confidence. Auto-syncing...` }]);
          if (isRecording || isTranscribing) {
            toast('Analysis complete! Auto-sync will start when voice note finishes.', { icon: '⏳' });
            setPendingAutoSync(finalFields);
          } else {
            setTimeout(() => onSyncClick(finalFields), 500);
          }
        } else {
          setAuditLogs(prev => [...prev, { stage: 'Template', status: 'warning', message: `Template applied but requires review. ${missing.length} missing, ${matched.filter((f: ExtractedField) => f.confidence < 95).length} low confidence.` }]);
          toast('Extraction complete! Please review the data.', { icon: '✅' });
        }
      } else {
        // Show review inline for first-time / discovery mode
        setExtractedFields(data.fields);
        toast('Extraction complete! You can review the fields on the right.', { icon: '✅' });
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
      setShowPrimaryKeyModal(true);
    } else {
      toast(`🔄 Discovery mode — you'll review fields every scan.`, { duration: 4000 });
      onSyncClick(fields);
    }
  };

  const handlePrimaryKeyConfirm = (primaryKey: string | null) => {
    setShowPrimaryKeyModal(false);
    if (primaryKey) {
      document.cookie = `docsync_pk_${profileId.replace(/-/g, '_')}=${primaryKey}; path=/; max-age=31536000`;
      toast.success('Primary Key set! Duplicates will be blocked.');
    }
    if (approvedFields) onSyncClick(approvedFields);
  };

  // STEP 3: Sync approved fields to Sheets + Notion
  const doSync = async (fields: ExtractedField[], sheetId: string | null, cols?: SheetColumn[], duplicateAction?: DuplicateAction) => {
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
      if (duplicateAction) formData.append('duplicateAction', duplicateAction);
      if (noteText) formData.append('noteText', noteText);
      if (audioBlob) formData.append('audioFile', audioBlob, 'voicenote.webm');

      const res = await fetch('/api/sync', {
        method: 'POST',
        body: formData,
      });

      if (res.status === 409) {
        toast.dismiss(toastId);
        const conflictData = await res.json();
        setDuplicateAlertData({
          count: conflictData.duplicateCount,
          label: conflictData.primaryKeyLabel || 'Primary Key',
          value: conflictData.primaryKeyValue,
          fieldsToSync: fields,
          existingSheetId: sheetId,
          cols
        });
        setIsSyncing(false);
        return;
      }

      const result = await res.json();
      if (result.success) {
        toast.success('Successfully synced! ✅', { id: toastId });
        setSyncResult({
          success: true,
          details: fields,
          url: spreadsheetUrl || result.spreadsheetUrl || result.syncDetails?.sheets || ''
        });
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
    const val = match ? decodeURIComponent(match[1]) : null;
    
    // Clear out old mock sheet IDs so the app uses the real Google Sheet from .env.local
    if (val && val.startsWith('demo-sheet-')) {
      document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
      return null;
    }
    
    return val;
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
          {profileId === 'ngo-receipt' && (
            <a 
              href="/sample-ngo-receipt.png" 
              download="Sample_NGO_Receipt.png"
              onClick={(e) => e.stopPropagation()} 
              style={{ marginTop: '1.5rem', fontSize: '0.85rem', color: 'var(--accent-primary)', textDecoration: 'underline' }}
            >
              Don&apos;t have a document? Download a Sample NGO Receipt
            </a>
          )}
          <input type="file" accept="image/*" capture="environment" ref={fileInputRef} style={{ display: 'none' }} onChange={handleCapture} />
        </div>
      ) : syncResult ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
          <div className="glass-panel" style={{ padding: '3rem 2rem', textAlign: 'center', maxWidth: '500px', width: '100%', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem', color: '#10b981' }}>✅</div>
            <h2 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>Sync Complete</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Your document has been successfully digitized and safely synced to your databases.</p>
            
            <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: '1.25rem', marginBottom: '2rem', textAlign: 'left' }}>
              <h4 style={{ fontSize: '0.9rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '1rem', letterSpacing: '0.05em' }}>Synced Data</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {syncResult.details.map((field) => (
                  <div key={field.key} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--bg-glass-border)', paddingBottom: '0.5rem' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{field.label}</span>
                    <span style={{ fontWeight: 500, fontSize: '0.95rem' }}>{field.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', flexDirection: 'column' }}>
              {(syncResult.url && syncResult.url.startsWith('http')) && (
                <a href={syncResult.url} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
                  📊 Open Google Sheet
                </a>
              )}
              <button className="btn btn-primary" onClick={() => router.push('/')}>
                Scan Another Document
              </button>
            </div>
          </div>
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
              {selectedFile && !isProcessing && (
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => extractFields(selectedFile)}>
                  {savedTemplate ? '🔍 Extract Approved Data' : '🔍 Extract All Fields'}
                </button>
              )}
            </div>
            <input type="file" accept="image/*" capture="environment" ref={fileInputRef} style={{ display: 'none' }} onChange={handleCapture} />

            {/* Note & Voice Note */}
            {selectedFile && (
              <div style={{ marginTop: '1rem', background: 'var(--bg-secondary)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--bg-glass-border)' }}>
                <h4 style={{ fontSize: '0.9rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>📝</span> Add a Note (Audio or Text)
                </h4>
                
                {isTranscribing && (
                  <div style={{ padding: '0.5rem', marginBottom: '0.75rem', fontSize: '0.8rem', background: 'rgba(59,130,246,0.1)', color: 'var(--accent-primary)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="animate-spin">⏳</span> AI is transcribing your voice...
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <textarea 
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Type a note or tap mic to record..."
                    style={{ flex: 1, padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', background: 'var(--bg-card)', color: 'var(--text-primary)', resize: 'vertical', minHeight: '60px', fontSize: '0.9rem' }}
                  />
                  <button 
                    onClick={toggleVoiceRecord}
                    disabled={isTranscribing}
                    style={{ background: isRecording ? 'var(--error)' : 'var(--accent-primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-full)', width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: isTranscribing ? 'not-allowed' : 'pointer', flexShrink: 0, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', opacity: isTranscribing ? 0.5 : 1 }}
                  >
                    {isRecording ? <span style={{fontSize:'1.2rem'}}>⏹️</span> : <span style={{fontSize:'1.2rem'}}>🎤</span>}
                  </button>
                </div>
                
                {audioUrl && !isRecording && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem', background: 'var(--bg-card)', padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }}>
                    <audio controls src={audioUrl} style={{ height: '32px', flex: 1 }} />
                    <button onClick={() => setAudioBlob(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--error)', fontSize: '1.2rem' }} title="Delete Audio">
                      🗑️
                    </button>
                  </div>
                )}
              </div>
            )}

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

          {/* Right Panel: Approved or Extracted Fields */}
          <div className="glass-panel" style={{ padding: '1.5rem', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '1.2rem', margin: 0 }}>
                {(approvedFields || extractedFields.length > 0) ? `Extracted Data (${(approvedFields || extractedFields).length} fields)` : 'Extracted Data'}
              </h3>
              {(approvedFields || extractedFields.length > 0) && !isProcessing && (
                <span style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem', backgroundColor: 'rgba(245,158,11,0.15)', color: '#d97706', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 'var(--radius-full)', fontWeight: 600 }}>
                  {approvedFields ? 'Ready for Sync' : 'Needs Review'}
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
                  {approvedFields.map((field, i) => {
                    const cs = catStyle(field.category);
                    const conf = field.confidence || 100;
                    return (
                      <div key={field.key + i} style={{
                        padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-glass)', border: '1px solid var(--bg-glass-border)',
                        display: 'flex', gap: '1rem', alignItems: 'center'
                      }}>
                        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'center', minWidth: '70px' }}>
                          <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '3px 6px', background: cs.bg, color: cs.text, border: `1px solid ${cs.border}`, borderRadius: '4px', textAlign: 'center', whiteSpace: 'nowrap', textTransform: 'uppercase' }}>
                            {field.category || 'other'}
                          </span>
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '3px 6px', background: `${confColor(conf)}15`, color: confColor(conf), border: `1px solid ${confColor(conf)}30`, borderRadius: '4px' }}>
                            {conf}%
                          </span>
                        </div>
                        
                        <div style={{ flex: 1, minWidth: 0 }}>
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
                      </div>
                    );
                  })}
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
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setApprovedFields(null); setExtractedFields([]); setAuditLogs([]); setStats(null); setImageSrc(null); setSelectedFile(null); }}>
                    Discard
                  </button>
                  <button
                    className="btn btn-primary"
                    style={{ width: '100%', padding: '0.9rem', fontSize: '1.05rem', marginTop: 'auto' }}
                    onClick={() => onSyncClick(approvedFields)}
                    disabled={isSyncing}
                  >
                    {isSyncing ? 'Syncing...' : 'Sync to Database →'}
                  </button>
                </div>
              </>
            ) : extractedFields.length > 0 ? (
              <div style={{ margin: '-1.5rem', height: 'calc(100% + 3rem)' }}>
                <FieldReviewModal
                  inline={true}
                  imageSrc={imageSrc!}
                  profileId={profileId}
                  documentType="Document"
                  fields={extractedFields}
                  onConfirm={handleFieldsConfirmed}
                  onCancel={() => {
                    setApprovedFields(null);
                    setExtractedFields([]);
                    setAuditLogs([]);
                    setStats(null);
                    setImageSrc(null);
                    setSelectedFile(null);
                  }}
                />
              </div>
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

      {showPrimaryKeyModal && savedTemplate && (
        <PrimaryKeyModal
          fields={savedTemplate.fields}
          onConfirm={handlePrimaryKeyConfirm}
        />
      )}
      
      {duplicateAlertData && (
        <DuplicateAlert
          duplicateCount={duplicateAlertData.count}
          primaryKeyLabel={duplicateAlertData.label}
          primaryKeyValue={duplicateAlertData.value}
          onAction={(action) => {
            setDuplicateAlertData(null);
            doSync(duplicateAlertData.fieldsToSync, duplicateAlertData.existingSheetId, duplicateAlertData.cols, action);
          }}
          onCancel={() => {
            setDuplicateAlertData(null);
            toast('Sync cancelled.', { icon: '🚫' });
          }}
        />
      )}
    </main>
  );
}
