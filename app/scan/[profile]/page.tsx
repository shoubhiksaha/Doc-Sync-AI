'use client';
import { useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast, { Toaster } from 'react-hot-toast';
import { NgoReceiptSchema, FactoryWeightSlipSchema } from '@/lib/schemas';

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

  const schema = profileId === 'ngo-receipt' ? NgoReceiptSchema : FactoryWeightSlipSchema;

  // Use Record<string, any> to bypass strict generic union errors gracefully without ts-expect-error on the hook
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<Record<string, any>>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
  });

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (isDirty && !window.confirm("You have unsaved manual edits. Proceeding will discard them. Continue?")) {
        return;
      }
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

      const res = await fetch('/api/process-document', {
        method: 'POST',
        body: formData, // Removed headers since keys are now in HttpOnly cookies
      });

      const data = await res.json();
      if (data.success) {
        // Reset the form with the new data, overriding anything else
        reset(data.data);
        setStats(data.stats);
        if (data.auditLogs) {
          setAuditLogs(data.auditLogs);
        }
        setHasExtracted(true);
        toast.success("Document analyzed successfully!");
      } else {
        toast.error(data.error || 'Failed to process document');
      }
    } catch (err) {
      console.error(err);
      toast.error('Network error occurred while processing document.');
    } finally {
      setIsProcessing(false);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onSubmit = async (data: Record<string, any>) => {
    setIsSyncing(true);
    const toastId = toast.loading('Syncing to Notion & Sheets...');
    
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, profileId }),
      });
      
      const result = await res.json();
      if (result.success) {
        toast.success('Successfully synced!', { id: toastId });
        setTimeout(() => {
          router.push('/');
        }, 1500);
      } else {
        toast.error(result.errors?.[0] || 'Sync failed', { id: toastId });
      }
    } catch {
      toast.error('Failed to sync data', { id: toastId });
    } finally {
      setIsSyncing(false);
    }
  };

  const getProfileTitle = () => {
    switch(profileId) {
      case 'ngo-receipt': return 'NGO Donation Receipt';
      case 'factory-weight-slip': return 'Factory Weight-Slip';
      default: return 'Document';
    }
  };

  const formatSize = (bytes: number) => (bytes / 1024).toFixed(1) + ' KB';

  return (
    <main className="container animate-fade-in" style={{ padding: '2rem 1rem', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Toaster position="top-center" />
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', margin: 0 }}>Scanning: {getProfileTitle()}</h1>
        <button className="btn btn-secondary" onClick={() => router.push('/')}>Back</button>
      </header>

      {!imageSrc ? (
        <div 
          className="glass-panel" 
          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          onClick={() => fileInputRef.current?.click()}
        >
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📷</div>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Tap to Scan</h2>
          <p style={{ color: 'var(--text-secondary)' }}>Uses your device camera</p>
          <input 
            type="file" 
            accept="image/*" 
            capture="environment" 
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handleCapture}
          />
        </div>
      ) : (
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', height: '100%' }}>
          
          {/* Left Panel: Image */}
          <div className="glass-panel" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
            <h3 style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Original Scan</h3>
            <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius-md)', backgroundColor: '#000', minHeight: '300px', display: 'flex' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src={imageSrc} 
                alt="Scanned Document" 
                style={{ width: '100%', objectFit: 'contain' }} 
              />
              
              {/* HITL Bounding Box Overlay */}
              {hasExtracted && !isProcessing && (
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                  <div style={{ position: 'absolute', top: '30%', left: '20%', width: '60%', height: '10%', border: '2px solid rgba(59, 130, 246, 0.8)', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: '4px' }}></div>
                  <div style={{ position: 'absolute', top: '45%', left: '20%', width: '40%', height: '8%', border: '2px solid rgba(234, 179, 8, 0.8)', backgroundColor: 'rgba(234, 179, 8, 0.1)', borderRadius: '4px' }}></div>
                  <div style={{ position: 'absolute', top: '60%', left: '20%', width: '50%', height: '8%', border: '2px solid rgba(59, 130, 246, 0.8)', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderRadius: '4px' }}></div>
                </div>
              )}

              {isProcessing && (
                <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexDirection: 'column' }}>
                  <div className="animate-pulse" style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚙️</div>
                  <p>Processing with AI...</p>
                </div>
              )}
            </div>

            <button className="btn btn-secondary" style={{ marginTop: '1rem' }} onClick={() => fileInputRef.current?.click()}>Retake Photo</button>
            <input 
              type="file" 
              accept="image/*" 
              capture="environment" 
              ref={fileInputRef}
              style={{ display: 'none' }}
              onChange={handleCapture}
            />

            {/* Compression Report */}
            {stats && (
              <div style={{ marginTop: '1.5rem', backgroundColor: 'var(--bg-secondary)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
                <h4 style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>Zero-Storage Compression Report</h4>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  <span>Original: {formatSize(stats.originalSize)}</span>
                  <span>➜</span>
                  <span style={{ color: 'var(--primary)' }}>Archived: {formatSize(stats.archiveSize)}</span>
                </div>
                <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--border)', borderRadius: '3px', marginTop: '0.5rem', overflow: 'hidden' }}>
                  <div style={{ width: `${(stats.archiveSize / stats.originalSize) * 100}%`, height: '100%', backgroundColor: 'var(--primary)' }}></div>
                </div>
              </div>
            )}
            
            {/* Audit Logs */}
            {auditLogs.length > 0 && (
              <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <h4 style={{ fontSize: '0.9rem' }}>Codex Audit Log</h4>
                {auditLogs.map((log, idx) => (
                  <div key={idx} style={{ 
                    fontSize: '0.75rem', padding: '0.5rem', borderRadius: '4px',
                    backgroundColor: log.status === 'success' ? 'rgba(34, 197, 94, 0.1)' : log.status === 'warning' ? 'rgba(234, 179, 8, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    borderLeft: `3px solid ${log.status === 'success' ? '#22c55e' : log.status === 'warning' ? '#eab308' : '#ef4444'}`
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
                <span style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', backgroundColor: 'var(--warning)', color: '#000', borderRadius: 'var(--radius-full)', fontWeight: 600 }}>Human Review Required</span>
              )}
            </div>

            {isProcessing ? (
              <div className="animate-pulse" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {[1, 2, 3, 4].map(i => (
                  <div key={i} style={{ height: '3rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}></div>
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
                      <input type="number" className="form-input" {...register('amount')} placeholder="e.g. 5000" />
                      {errors.amount?.message && <span style={{ color: 'var(--error)', fontSize: '0.8rem' }}>{String(errors.amount.message)}</span>}
                    </div>
                    <div className="form-group">
                      <label className="form-label">PAN Number</label>
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
                      <input type="number" className="form-input" {...register('grossWeight')} placeholder="e.g. 15000" />
                      {errors.grossWeight?.message && <span style={{ color: 'var(--error)', fontSize: '0.8rem' }}>{String(errors.grossWeight.message)}</span>}
                    </div>
                    <div className="form-group">
                      <label className="form-label">Tare Weight (kg)</label>
                      <input type="number" className="form-input" {...register('tareWeight')} placeholder="e.g. 5000" />
                      {errors.tareWeight?.message && <span style={{ color: 'var(--error)', fontSize: '0.8rem' }}>{String(errors.tareWeight.message)}</span>}
                    </div>
                  </>
                )}

                <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
                  <button type="submit" disabled={isSyncing} className="btn btn-primary" style={{ flex: 1 }}>
                    {isSyncing ? 'Syncing...' : 'Sync to G-Sheets & Notion'}
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
