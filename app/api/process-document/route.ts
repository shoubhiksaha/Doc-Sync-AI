import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { runCodexPipeline } from '@/lib/codex-agent';
import { getDecryptedCookie } from '@/lib/crypto';
import { getToken } from 'next-auth/jwt';
import { uploadArchiveToGDrive } from '@/lib/gdrive-upload';
import { uploadArchiveToNotion } from '@/lib/notion-upload';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET || 'mock_secret' });
    const googleAccessToken = token?.accessToken as string | undefined;

    const formData = await req.formData();
    const file = formData.get('document') as File | null;
    const profileId = formData.get('profileId') as string;

    // Read AI key from HttpOnly cookie
    const openaiKey = getDecryptedCookie(req, 'docsync_openai') || req.headers.get('x-openai-key') || undefined;

    // Read Notion key for image upload
    const notionKey = getDecryptedCookie(req, 'docsync_notion') || undefined;
    const uploadDest = req.cookies.get('docsync_upload_dest')?.value || 'both'; // gdrive, notion, both

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

    // Single pipeline using sharp
    // Optimize for both AI (max 2048px) and Archive (under 5MB for Notion, JPEG 95 quality usually < 1MB)
    const ocrBuffer = await sharp(buffer)
      .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 95 })
      .toBuffer();

    // Run AI Codex pipeline on OCR buffer
    const { data: extractedData, auditLogs } = await runCodexPipeline(ocrBuffer, profileId, openaiKey);

    // Generate a filename for the archive
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archiveFilename = `docsync-${profileId}-${timestamp}.jpg`;

    // Upload archive buffer concurrently to GDrive and/or Notion (non-blocking to AI result)
    let imageUrl: string | null = null;
    let notionFileId: string | null = null;

    const uploadPromises: Promise<void>[] = [];

    // Primary: Google Drive (preferred — gives a permanent public link)
    if (googleAccessToken && (uploadDest === 'both' || uploadDest === 'gdrive')) {
      uploadPromises.push(
        uploadArchiveToGDrive(ocrBuffer, archiveFilename, googleAccessToken).then((url) => {
          imageUrl = url;
          console.log('Archive uploaded to GDrive:', url);
        })
      );
    }

    // Secondary: Notion (gives a file_upload ID to embed in the Notion page)
    if (notionKey && (uploadDest === 'both' || uploadDest === 'notion')) {
      uploadPromises.push(
        uploadArchiveToNotion(ocrBuffer, archiveFilename, notionKey).then((fileId) => {
          notionFileId = fileId;
          // If GDrive failed or wasn't used, we'll populate this later from Notion sync response url
          console.log('Archive uploaded to Notion, fileId:', fileId);
        })
      );
    }

    // Wait for both uploads (they run concurrently with the response)
    await Promise.allSettled(uploadPromises);

    return NextResponse.json({
      success: true,
      data: extractedData,
      auditLogs,
      imageUrl,       // Public GDrive link (or null if upload failed)
      notionFileId,   // Notion file_upload ID (or null if not configured)
      message: 'Processed successfully',
      stats: {
        originalSize: buffer.length,
        processedSize: ocrBuffer.length,
      },
    });

  } catch (error: unknown) {
    console.error('Error processing document:', error);
    return NextResponse.json({ error: 'An internal error occurred during document processing.' }, { status: 500 });
  }
}
