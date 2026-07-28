import { NextRequest, NextResponse } from 'next/server';
import { syncToNotion } from '@/lib/notion';
import { getDecryptedCookie } from '@/lib/crypto';
import { google } from 'googleapis';
import { getToken } from 'next-auth/jwt';

export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET || 'mock_secret' });
    const accessToken = token?.accessToken as string | undefined;

    const body = await req.json();
    const {
      data,
      profileId,
      spreadsheetId: clientSheetId,
      imageUrl,       // GDrive public link (or notion:// fallback)
      notionFileId,   // Notion file_upload ID for embedding image in Notion page
    } = body;

    if (!data || !profileId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    console.log(`Syncing data for ${profileId}... imageUrl: ${imageUrl || 'none'}`);

    const notionKey = getDecryptedCookie(req, 'docsync_notion') || req.headers.get('x-notion-key');
    const notionDbId = getDecryptedCookie(req, 'docsync_notion_db') || req.headers.get('x-notion-db-id');

    // --- Notion Sync (Run first so we can grab the URL for Sheets if needed) ---
    const notionPromise = syncToNotion(data, profileId, notionKey, notionDbId, notionFileId);
    let notionResult;
    try {
      notionResult = await notionPromise;
    } catch {
      notionResult = { success: false, dummy: false, url: null };
    }

    // Determine the final link to store in Sheets
    // Priority: GDrive link > Notion Page URL > placeholder
    let finalLinkToImage = imageUrl;
    if (!finalLinkToImage && notionResult.url) {
      finalLinkToImage = notionResult.url;
    } else if (!finalLinkToImage) {
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
