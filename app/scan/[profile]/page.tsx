'use client';
import { useState, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast, { Toaster } from 'react-hot-toast';
import { NgoReceiptSchema, FactoryWeightSlipSchema, NgoReceiptData, FactoryWeightSlipData } from '@/lib/schemas';

export default function ScanPage() {
  const params = useParams();
  const router = useRouter();
  const profileId = params.profile as string;
  
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [extractedData, setExtractedData] = useState<FormData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Setup form based on profile
  const schema = profileId === 'ngo-receipt' ? NgoReceiptSchema : FactoryWeightSlipSchema;
  type FormData = NgoReceiptData | FactoryWeightSlipData;

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    // @ts-expect-error: Zod coerce types are incompatible with generic union form types here
    resolver: zodResolver(schema),
  });

  // Auto-populate form when extraction is done
  useEffect(() => {
    if (extractedData) {
      reset(extractedData);
    }
  }, [extractedData, reset]);

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setImageSrc(url);
      processImage(file);
    }
  };

  const processImage = async (file: File) => {
    setIsProcessing(true);
    setExtractedData(null);
    try {
      const formData = new FormData();
      formData.append('document', file);
      formData.append('profileId', profileId);

      const openaiKey = localStorage.getItem('openai_key') || '';
      const res = await fetch('/api/process-document', {
        method: 'POST',
        headers: {
          'x-openai-key': openaiKey
        },
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        setExtractedData(data.data);
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

  const onSubmit = async (data: FormData) => {
    setIsSyncing(true);
    const toastId = toast.loading('Syncing to Notion & Sheets...');
    
    try {
      const openaiKey = localStorage.getItem('openai_key') || '';
      const notionKey = localStorage.getItem('notion_key') || '';
      const notionDbId = localStorage.getItem('notion_db_id') || '';
      const sheetKey = localStorage.getItem('sheet_id') || '';

      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-openai-key': openaiKey,
          'x-notion-key': notionKey,
          'x-notion-db-id': notionDbId,
          'x-sheet-id': sheetKey,
        },
        body: JSON.stringify({ data, profileId }),
      });
      
      const result = await res.json();
      if (result.success) {
        toast.success('Successfully synced!', { id: toastId });
        // Optionally redirect back or clear state
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
          <div className="glass-panel" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <h3 style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Original Scan</h3>
            <div style={{ flex: 1, position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius-md)', backgroundColor: '#000' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src={imageSrc} 
                alt="Scanned Document" 
                style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
              />
              {isProcessing && (
                <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexDirection: 'column' }}>
                  <div className="animate-pulse" style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚙️</div>
                  <p>Processing with AI...</p>
                </div>
              )}
            </div>
            <button className="btn btn-secondary" style={{ marginTop: '1rem' }} onClick={() => setImageSrc(null)}>Retake Photo</button>
          </div>

          {/* Right Panel: Form */}
          <div className="glass-panel" style={{ padding: '1.5rem', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1.25rem', margin: 0 }}>Extracted Data</h3>
              {!isProcessing && extractedData && (
                <span style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', backgroundColor: 'var(--warning)', color: '#000', borderRadius: 'var(--radius-full)', fontWeight: 600 }}>Human Review Required</span>
              )}
            </div>

            {isProcessing ? (
              <div className="animate-pulse" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {[1, 2, 3, 4].map(i => (
                  <div key={i} style={{ height: '3rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)' }}></div>
                ))}
              </div>
            ) : extractedData ? (
              (() => {
                const formErrors = errors as unknown as Record<string, { message?: string }>;
                return (
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  <form onSubmit={handleSubmit(onSubmit as any)}>
                    <div className="form-group">
                      <label className="form-label">Date</label>
                      <input type="text" className="form-input" {...register('date')} placeholder="e.g. 24-Oct-2023" />
                      {formErrors.date?.message && <span style={{ color: 'var(--error)', fontSize: '0.8rem' }}>{formErrors.date.message}</span>}
                    </div>
                    
                    {profileId === 'ngo-receipt' ? (
                      <>
                        <div className="form-group">
                          <label className="form-label">Donor Name</label>
                          <input type="text" className="form-input" {...register('donorName')} placeholder="e.g. Rahul Sharma" />
                          {formErrors.donorName?.message && <span style={{ color: 'var(--error)', fontSize: '0.8rem' }}>{formErrors.donorName.message}</span>}
                        </div>
                        <div className="form-group">
                          <label className="form-label">Amount (₹)</label>
                          <input type="number" className="form-input" {...register('amount')} placeholder="e.g. 5000" />
                          {formErrors.amount?.message && <span style={{ color: 'var(--error)', fontSize: '0.8rem' }}>{formErrors.amount.message}</span>}
                        </div>
                        <div className="form-group">
                          <label className="form-label">PAN Number</label>
                          <input type="text" className="form-input" {...register('panNumber')} placeholder="e.g. ABCDE1234F" />
                          {formErrors.panNumber?.message && <span style={{ color: 'var(--error)', fontSize: '0.8rem' }}>{formErrors.panNumber.message}</span>}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="form-group">
                          <label className="form-label">Vehicle Number</label>
                          <input type="text" className="form-input" {...register('vehicleNumber')} placeholder="e.g. MH-12-AB-1234" />
                          {formErrors.vehicleNumber?.message && <span style={{ color: 'var(--error)', fontSize: '0.8rem' }}>{formErrors.vehicleNumber.message}</span>}
                        </div>
                        <div className="form-group">
                          <label className="form-label">Gross Weight (kg)</label>
                          <input type="number" className="form-input" {...register('grossWeight')} placeholder="e.g. 15000" />
                          {formErrors.grossWeight?.message && <span style={{ color: 'var(--error)', fontSize: '0.8rem' }}>{formErrors.grossWeight.message}</span>}
                        </div>
                        <div className="form-group">
                          <label className="form-label">Tare Weight (kg)</label>
                          <input type="number" className="form-input" {...register('tareWeight')} placeholder="e.g. 5000" />
                          {formErrors.tareWeight?.message && <span style={{ color: 'var(--error)', fontSize: '0.8rem' }}>{formErrors.tareWeight.message}</span>}
                        </div>
                      </>
                    )}

                    <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
                      <button type="submit" disabled={isSyncing} className="btn btn-primary" style={{ flex: 1 }}>
                        {isSyncing ? 'Syncing...' : 'Sync to G-Sheets & Notion'}
                      </button>
                    </div>
                  </form>
                );
              })()
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
