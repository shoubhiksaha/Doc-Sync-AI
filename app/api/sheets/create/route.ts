import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getToken } from 'next-auth/jwt';
import { cookies } from 'next/headers';

export type SheetColumn = {
  key: string;
  label: string;
};

export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET || 'mock_secret' });
    const accessToken = token?.accessToken as string | undefined;

    if (!accessToken) {
      return NextResponse.json({ error: 'Not authenticated with Google' }, { status: 401 });
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

    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const sheets = google.sheets({ version: 'v4', auth });

    // Create a new spreadsheet
    const createResponse = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title: sheetTitle,
        },
        sheets: [
          {
            properties: {
              title: profileId === 'ngo-receipt' ? 'NGO_Receipts' : 'Factory_Slips',
              gridProperties: { frozenRowCount: 1 }, // freeze header row
            },
          },
        ],
      },
    });

    const spreadsheetId = createResponse.data.spreadsheetId!;
    const sheetName = profileId === 'ngo-receipt' ? 'NGO_Receipts' : 'Factory_Slips';

    // Write the header row
    const headers = columns.map((c) => c.label);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [headers] },
    });

    // Style the header row: bold, background color
    const sheetId = createResponse.data.sheets?.[0].properties?.sheetId ?? 0;
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
                  backgroundColor: { red: 0.24, green: 0.22, blue: 0.55 }, // indigo
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
    cookies().set(schemaCookieName, JSON.stringify(columns.map(c => c.key)), {
      httpOnly: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });

    return NextResponse.json({
      success: true,
      spreadsheetId,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
      message: `Sheet "${sheetTitle}" created with ${headers.length} columns.`,
    });

  } catch (error) {
    console.error('Sheet creation error:', error);
    return NextResponse.json({ error: 'Failed to create Google Sheet. Make sure you are signed in with Google.' }, { status: 500 });
  }
}
