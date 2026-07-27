import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { runCodexPipeline } from '@/lib/codex-agent';
import { getDecryptedCookie } from '@/lib/crypto';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('document') as File | null;
    const profileId = formData.get('profileId') as string;
    
    // Read key securely from HttpOnly cookie
    const openaiKey = getDecryptedCookie(req, 'docsync_openai') || req.headers.get('x-openai-key') || undefined;

    if (!file) {
      return NextResponse.json({ error: 'No document provided' }, { status: 400 });
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Invalid file type. Only images are allowed.' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File size exceeds the 20MB limit.' }, { status: 413 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log(`Processing image for profile: ${profileId}`);

    // Dual-branch pipeline using sharp
    // Branch 1: High-res for OCR (2048px max, JPEG 95)
    const ocrBuffer = await sharp(buffer)
      .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 95 })
      .toBuffer();

    // Branch 2: Low-res for Archive (1500px max, WebP 68)
    const archiveBuffer = await sharp(buffer)
      .resize({ width: 1500, height: 1500, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 68 })
      .toBuffer();

    // Pass the OCR buffer to Codex Pipeline for extraction
    const { data: extractedData, auditLogs } = await runCodexPipeline(ocrBuffer, profileId, openaiKey);

    // Return the processed data to the client
    return NextResponse.json({ 
      success: true, 
      data: extractedData,
      auditLogs,
      message: 'Processed successfully',
      stats: {
        originalSize: buffer.length,
        ocrSize: ocrBuffer.length,
        archiveSize: archiveBuffer.length,
      }
    });
    
  } catch (error: unknown) {
    console.error('Error processing document:', error);
    return NextResponse.json({ error: 'An internal error occurred during document processing.' }, { status: 500 });
  }
}
