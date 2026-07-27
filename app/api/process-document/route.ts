import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('document') as File;
    const profileId = formData.get('profileId') as string;

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

    // For now, return mock structured data based on profile
    // In Day 4, we will hook this up to OpenAI gpt-4o-mini
    let mockData = {};
    if (profileId === 'ngo-receipt') {
      mockData = {
        date: '24-Oct-2023',
        donorName: 'Rahul Sharma',
        amount: '5000',
        panNumber: 'ABCDE1234F',
      };
    } else {
      mockData = {
        date: '24-Oct-2023',
        vehicleNumber: 'MH-12-AB-1234',
        grossWeight: '15000',
        tareWeight: '5000',
      };
    }

    // Return the processed mock data to the client
    return NextResponse.json({ 
      success: true, 
      data: mockData,
      message: 'Processed successfully (Mock)',
      stats: {
        originalSize: buffer.length,
        ocrSize: ocrBuffer.length,
        archiveSize: archiveBuffer.length,
      }
    });
    
  } catch (error: any) {
    console.error('Error processing document:', error);
    return NextResponse.json({ error: error.message || 'Failed to process document' }, { status: 500 });
  }
}
