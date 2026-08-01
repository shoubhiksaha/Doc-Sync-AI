import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getToken } from 'next-auth/jwt';
import { cookies } from 'next/headers';
import { getGoogleAuth, ensureFolder } from '@/lib/gdrive';

export type SheetColumn = {
  key: string;
  label: string;
};

export async function POST(req: NextRequest) {
  let currentStep = 'initializing';
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET || 'mock_secret' });
    const accessToken = token?.accessToken as string | undefined;

    const auth = getGoogleAuth(accessToken);
    if (!auth) {
      return NextResponse.json({ error: 'Not authenticated with Google and no demo bot available' }, { status: 401 });
    }

    const body = await req.json();
    const { columns, profileId, sheetTitle } = body as {
      columns: SheetColumn[];
      profileId: string;
      sheetTitle: string;
    };

    if (!columns || columns.length === 0 || !profileId || !sheetTitle) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Silently append metadata tracking columns
    const finalColumns = [
      ...columns,
      { key: 'notes', label: 'Notes (Text/Audio)' },
      { key: 'voice_note_link', label: 'Voice Note Audio Link' },
      { key: 'link_to_image', label: 'Link to Image' },
      { key: 'synced_at', label: 'Synced At' },
      { key: 'sync_status', label: 'Sync Status' },
    ];

    if (!accessToken && !process.env.GOOGLE_SHEET_ID && !process.env.GOOGLE_SHARED_FOLDER_ID) {
      // Service accounts often cannot create spreadsheets from scratch due to lack of Google Workspace storage quota.
      // Therefore, in Demo Mode, we fully mock the sheet creation so the UI can proceed,
      // UNLESS the user has provided a pre-existing GOOGLE_SHEET_ID (or folder).
      const demoId = 'demo-sheet-' + Date.now();
      
      const cookieName = `docsync_sheet_${profileId.replace(/-/g, '_')}`;
      cookies().set(cookieName, demoId, {
        httpOnly: false,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 365, // 1 year
      });

      const schemaCookieName = `docsync_schema_${profileId.replace(/-/g, '_')}`;
      cookies().set(schemaCookieName, JSON.stringify(finalColumns.map(c => c.key)), {
        httpOnly: false,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
      });

      return NextResponse.json({
        success: true,
        spreadsheetId: demoId,
        spreadsheetUrl: `https://docsync.ai/demo-sheet/${demoId}`,
        message: `Sheet "${sheetTitle}" created with ${finalColumns.length} columns (Demo Mode).`,
      });
    }

    const sheets = google.sheets({ version: 'v4', auth: auth as never });
    const drive = google.drive({ version: 'v3', auth: auth as never });

    currentStep = 'creating spreadsheet';
    let spreadsheetId = '';
    const targetSheetName = profileId === 'ngo-receipt' ? 'NGO_Receipts' : 'Factory_Slips';

    if (!accessToken && process.env.GOOGLE_SHEET_ID) {
      // User provided a pre-created blank sheet ID. We just use it!
      spreadsheetId = process.env.GOOGLE_SHEET_ID;
      
      // Try to rename the first sheet and freeze the header row
      try {
        const sheetData = await sheets.spreadsheets.get({ spreadsheetId });
        const sheetId = sheetData.data.sheets?.[0]?.properties?.sheetId || 0;

        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                updateSheetProperties: {
                  properties: {
                    sheetId: sheetId,
                    title: targetSheetName,
                    gridProperties: { frozenRowCount: 1 },
                  },
                  fields: 'title,gridProperties.frozenRowCount',
                }
              }
            ]
          }
        });
      } catch (e) {
        console.warn('Could not rename existing sheet, it might already be renamed:', e);
      }
    } else if (!accessToken && process.env.GOOGLE_SHARED_FOLDER_ID) {
      // Create via Drive API to specify parent folder directly so the service account uses user's quota
      const driveRes = await drive.files.create({
        requestBody: {
          name: sheetTitle,
          mimeType: 'application/vnd.google-apps.spreadsheet',
          parents: [process.env.GOOGLE_SHARED_FOLDER_ID],
        },
        fields: 'id',
      });
      spreadsheetId = driveRes.data.id!;
      
      // Update sheet properties (name and frozen row)
      const sheetData = await sheets.spreadsheets.get({ spreadsheetId });
      const sheetId = sheetData.data.sheets?.[0]?.properties?.sheetId || 0;

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              updateSheetProperties: {
                properties: {
                  sheetId: sheetId,
                  title: targetSheetName,
                  gridProperties: { frozenRowCount: 1 },
                },
                fields: 'title,gridProperties.frozenRowCount',
              }
            }
          ]
        }
      });
    } else {
      // Create a new spreadsheet via Sheets API (standard flow)
      const createResponse = await sheets.spreadsheets.create({
        requestBody: {
          properties: {
            title: sheetTitle,
          },
          sheets: [
            {
              properties: {
                title: targetSheetName,
                gridProperties: { frozenRowCount: 1 }, // freeze header row
              },
            },
          ],
        },
      });
      spreadsheetId = createResponse.data.spreadsheetId!;
    }

    const sheetName = targetSheetName;

    // Move spreadsheet to "DocSync AI" folder if it wasn't created in a shared folder, and wasn't a pre-existing sheet
    if (!(!accessToken && (process.env.GOOGLE_SHARED_FOLDER_ID || process.env.GOOGLE_SHEET_ID))) {
      currentStep = 'moving to folder';
      try {
        const folderName = 'DocSync AI';
        const rootFolderId = await ensureFolder(drive, folderName);
        // We need to fetch the file's current parents to remove them
        const fileRes = await drive.files.get({ fileId: spreadsheetId, fields: 'parents' });
        const previousParents = fileRes.data.parents?.join(',') || '';
        await drive.files.update({
          fileId: spreadsheetId,
          addParents: rootFolderId,
          removeParents: previousParents,
          fields: 'id, parents',
        });
      } catch (err) {
        console.error('Failed to move sheet to folder:', err);
      }
    }

    // Write the header row
    currentStep = 'writing header row';
    const headers = finalColumns.map((c) => c.label);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [headers] },
    });

    // Style the header row: bold, background color
    currentStep = 'styling header row';
    const sheetData = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetId = sheetData.data.sheets?.[0]?.properties?.sheetId ?? 0;
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
              cell: {
                userEnteredFormat: {
                  textFormat: { bold: true },
                  backgroundColor: { red: 0.85, green: 0.92, blue: 0.98 }, // light blue
                  horizontalAlignment: 'CENTER',
                },
              },
              fields: 'userEnteredFormat(textFormat,backgroundColor,horizontalAlignment)',
            },
          },
          {
            autoResizeDimensions: {
              dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: headers.length },
            },
          },
        ],
      },
    });

    currentStep = 'saving cookies';
    // Save the spreadsheet ID as a cookie so next syncs use it directly.
    // Cookie name is per-profile so NGO and Factory use different sheets.
    const cookieName = `docsync_sheet_${profileId.replace(/-/g, '_')}`;
    cookies().set(cookieName, spreadsheetId, {
      httpOnly: false, // readable by client to check if sheet exists
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });

    // Also store the column schema (so sync route knows field order)
    const schemaCookieName = `docsync_schema_${profileId.replace(/-/g, '_')}`;
    cookies().set(schemaCookieName, JSON.stringify(finalColumns.map(c => c.key)), {
      httpOnly: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });

    let successMessage = `Sheet "${sheetTitle}" created with ${headers.length} columns.`;
    if (!accessToken && process.env.GOOGLE_SHEET_ID) {
      successMessage = `Since this is demo we are editing a prexisting sheet, but if used with real mail id it will create a new sheet`;
    }

    return NextResponse.json({
      success: true,
      spreadsheetId,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
      message: successMessage,
    });

  } catch (error: unknown) {
    console.error('Sheet creation error:', error);
    const errorMessage = error instanceof Error 
      ? (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || error.message 
      : 'Unknown error';

    const step = currentStep || 'unknown';
    return NextResponse.json({ 
      error: `Failed during ${step}. Google says: ${errorMessage}` 
    }, { status: 500 });
  }
}
