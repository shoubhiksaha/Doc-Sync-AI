import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { extractDocumentData } from '@/lib/openai';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('document') as File;
    const profileId = formData.get('profileId') as string;
    const openaiKey = req.headers.get('x-openai-key');

    if (!file) {
      return NextResponse.json({ error: 'No document provided' }, { status: 400 });
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

    // Pass the OCR buffer to OpenAI for extraction
    if (!openaiKey) {
      return NextResponse.json({
        success: true,
        data: { date: '12-Aug-2023', vehicleNumber: 'MOCK-DATA', grossWeight: 5000, tareWeight: 1000 },
        warning: 'No OpenAI key provided. Using mock data.',
        _metadata: { processedAt: new Date().toISOString() }
      });
    }

    const extractedData = await extractDocumentData(ocrBuffer, profileId, openaiKey);

    // Return the processed data to the client
    return NextResponse.json({ 
      success: true, 
      data: extractedData,
      message: 'Processed successfully',
      stats: {
        originalSize: buffer.length,
        ocrSize: ocrBuffer.length,
        archiveSize: archiveBuffer.length,
      }
    });
    
  } catch (error: unknown) {
    console.error('Error processing document:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to process document';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
