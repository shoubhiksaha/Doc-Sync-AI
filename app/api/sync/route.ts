import { NextRequest, NextResponse } from 'next/server';
import { syncToNotion } from '@/lib/notion';
import { loadSettings } from '@/lib/settings-loader';
import { google } from 'googleapis';
import { getToken } from 'next-auth/jwt';
import { uploadToGDrive } from '@/lib/gdrive';
import sharp from 'sharp';

export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET || 'mock_secret' });
    const accessToken = token?.accessToken as string | undefined;

    const formData = await req.formData();
    
    const dataString = formData.get('data') as string;
    const data = dataString ? JSON.parse(dataString) : null;
    const profileId = formData.get('profileId') as string;
    const clientSheetId = formData.get('spreadsheetId') as string | null;
    const documentFile = formData.get('document') as File | null;

    if (!data || !profileId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    console.log(`Syncing data for ${profileId}... document attached: ${!!documentFile}`);

    const { notionKey: loadedNotionKey, notionDbId: loadedNotionDbId } = await loadSettings(req);
    const notionKey = req.headers.get('x-notion-key') || loadedNotionKey;
    const notionDbId = req.headers.get('x-notion-db-id') || loadedNotionDbId;

    let archiveBuffer = null;
    if (documentFile) {
      try {
        const arrayBuffer = await documentFile.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        archiveBuffer = await sharp(buffer)
          .resize({ width: 1500, height: 1500, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 68 })
          .toBuffer();
      } catch (err) {
        console.error('Failed to compress image for Notion archive:', err);
      }
    }

    // --- Notion Sync (Run first so we can grab the URL for Sheets if needed) ---
    const notionPromise = syncToNotion(data, profileId, notionKey, notionDbId, archiveBuffer);
    let notionResult;
    try {
      notionResult = await notionPromise;
    } catch {
      notionResult = { success: false, dummy: false, url: null };
    }

    let gdriveUrl: string | null = null;
    if (archiveBuffer && accessToken && (!notionResult.success || 'dummy' in notionResult)) {
      // If Notion is not configured or failed, upload to Google Drive instead
      const fileName = `${profileId}_${Date.now()}.webp`;
      gdriveUrl = await uploadToGDrive(accessToken, archiveBuffer, fileName);
    }

    // Determine the final link to store in Sheets
    // Priority: Notion Page URL > GDrive Uploaded Link > placeholder
    let finalLinkToImage: string | null = null;
    if (notionResult.url) {
      finalLinkToImage = notionResult.url;
    } else if (gdriveUrl) {
      finalLinkToImage = gdriveUrl;
    } else {
      finalLinkToImage = '—';
    }

    // --- Google Sheets Sync ---
    const spreadsheetId = clientSheetId || process.env.GOOGLE_SHEET_ID;

    const sheetsPromise = (async () => {
      if (!accessToken || !spreadsheetId) {
        console.warn('Skipping Sheets sync: no access token or sheet ID.');
        return { success: true, mock: true };
      }

      const schemaCookieName = `docsync_schema_${profileId.replace(/-/g, '_')}`;
      const schemaRaw = req.cookies.get(schemaCookieName)?.value;
      const schemaKeys: string[] | null = schemaRaw ? JSON.parse(schemaRaw) : null;

      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });
      const sheets = google.sheets({ version: 'v4', auth });

      const sheetName = profileId === 'ngo-receipt' ? 'NGO_Receipts' : 'Factory_Slips';

      let rowValues: unknown[];

      if (schemaKeys) {
        rowValues = schemaKeys.map((key) => {
          if (key === 'synced_at') return new Date().toISOString();
          if (key === 'sync_status') return 'Success';
          if (key === 'link_to_image') return finalLinkToImage;
          if (key === 'net_weight') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const fw = data as any;
            return (fw.grossWeight ?? 0) - (fw.tareWeight ?? 0);
          }
          const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (data as any)[camelKey] ?? (data as any)[key] ?? '';
        });
      } else {
        const baseRow = profileId === 'ngo-receipt'
          ? [data.date, data.donorName, data.amount, data.panNumber || '']
          : [data.date, data.vehicleNumber, data.grossWeight, data.tareWeight];
        rowValues = [...baseRow, finalLinkToImage, new Date().toISOString(), 'Success'];
      }

      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetName}!A:Z`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [rowValues] },
      });

      return { success: true };
    })();

    let sheetsResult;
    try {
      sheetsResult = await sheetsPromise;
    } catch {
      sheetsResult = { success: false };
    }

    const errors: string[] = [];
    const syncDetails: Record<string, string> = {};

    if (!notionResult.success && !('dummy' in notionResult && notionResult.dummy) && notionResult.url !== null) {
      errors.push('Notion Sync Failed');
      syncDetails.notion = 'failed';
    } else {
      syncDetails.notion = notionKey ? 'success' : 'skipped';
    }

    if (!sheetsResult.success) {
      errors.push('Google Sheets Sync Failed');
      syncDetails.sheets = 'failed';
    } else {
      syncDetails.sheets = spreadsheetId ? 'success' : 'skipped';
    }

    if (errors.length > 0) {
      return NextResponse.json({ success: false, errors, syncDetails }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Successfully synced to all destinations',
      syncDetails,
      imageUrl: imageUrl || null,
    });

  } catch (error: unknown) {
    console.error('API Sync Error:', error);
    return NextResponse.json({ error: 'An internal error occurred during data sync' }, { status: 500 });
  }
}
