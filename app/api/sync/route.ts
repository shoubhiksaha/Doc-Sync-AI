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
    const { data, profileId, spreadsheetId: clientSheetId } = body;

    if (!data || !profileId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    console.log(`Syncing data for ${profileId}...`);

    const notionKey = getDecryptedCookie(req, 'docsync_notion') || req.headers.get('x-notion-key');
    const notionDbId = getDecryptedCookie(req, 'docsync_notion_db') || req.headers.get('x-notion-db-id');

    // --- Google Sheets Sync ---
    // spreadsheetId comes from the client (saved in cookie after setup modal)
    // or falls back to env var for legacy support
    const spreadsheetId = clientSheetId || process.env.GOOGLE_SHEET_ID;

    const sheetsPromise = (async () => {
      if (!accessToken || !spreadsheetId) {
        console.warn('Skipping Sheets sync: no access token or sheet ID.');
        return { success: true, mock: true };
      }

      // Read column schema from the cookie (set by /api/sheets/create)
      const schemaCookieName = `docsync_schema_${profileId.replace(/-/g, '_')}`;
      const schemaRaw = req.cookies.get(schemaCookieName)?.value;
      const schemaKeys: string[] = schemaRaw ? JSON.parse(schemaRaw) : null;

      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });
      const sheets = google.sheets({ version: 'v4', auth });

      const sheetName = profileId === 'ngo-receipt' ? 'NGO_Receipts' : 'Factory_Slips';

      let rowValues: unknown[];

      if (schemaKeys) {
        // Dynamic mapping: use the column order from the setup modal
        rowValues = schemaKeys.map((key) => {
          // Handle derived fields
          if (key === 'synced_at') return new Date().toISOString();
          if (key === 'sync_status') return 'Success';
          if (key === 'net_weight') {
            const fw = data as { grossWeight?: number; tareWeight?: number };
            return (fw.grossWeight ?? 0) - (fw.tareWeight ?? 0);
          }

          // Convert snake_case key → camelCase for lookup in data
          const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (data as any)[camelKey] ?? (data as any)[key] ?? '';
        });
      } else {
        // Legacy static mapping (no schema cookie)
        if (profileId === 'ngo-receipt') {
          rowValues = [data.date, data.donorName, data.amount, data.panNumber || '', new Date().toISOString()];
        } else {
          rowValues = [data.date, data.vehicleNumber, data.grossWeight, data.tareWeight, new Date().toISOString()];
        }
      }

      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetName}!A:Z`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [rowValues] },
      });

      return { success: true };
    })();

    // --- Notion Sync ---
    const notionPromise = syncToNotion(data, profileId, notionKey, notionDbId);

    const [sheetsResult, notionResult] = await Promise.allSettled([sheetsPromise, notionPromise]);

    const errors: string[] = [];
    const syncDetails: Record<string, string> = {};

    if (notionResult.status === 'rejected') {
      errors.push('Notion Sync Failed');
      syncDetails.notion = 'failed';
    } else {
      syncDetails.notion = 'success';
    }

    if (sheetsResult.status === 'rejected') {
      errors.push('Google Sheets Sync Failed');
      syncDetails.sheets = 'failed';
    } else {
      syncDetails.sheets = 'success';
    }

    if (errors.length > 0) {
      console.error('Sync errors:', errors);
      return NextResponse.json({ success: false, errors, syncDetails }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Successfully synced to all destinations', syncDetails });
  } catch (error: unknown) {
    console.error('API Sync Error:', error);
    return NextResponse.json({ error: 'An internal error occurred during data sync' }, { status: 500 });
  }
}
