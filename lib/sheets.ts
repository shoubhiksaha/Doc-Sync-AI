import { google } from 'googleapis';

export async function syncToGoogleSheets(data: Record<string, unknown>, profileId: string) {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    console.warn("Google credentials not set. Bypassing Google Sheets sync.");
    return { success: true, mock: true };
  }

  try {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (!spreadsheetId) throw new Error("Missing GOOGLE_SHEET_ID");

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // Determine values to append based on profile
    let values: unknown[][] = [];
    let range = '';

    if (profileId === 'ngo-receipt') {
      range = 'NGO_Receipts!A:E';
      values = [[
        data.date,
        data.donorName,
        data.amount,
        data.panNumber || '',
        new Date().toISOString()
      ]];
    } else if (profileId === 'factory-weight-slip') {
      range = 'Factory_Slips!A:E';
      values = [[
        data.date,
        data.vehicleNumber,
        data.grossWeight,
        data.tareWeight,
        new Date().toISOString()
      ]];
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });

    return { success: true };
  } catch (error) {
    console.error("Google Sheets sync error:", error);
    throw new Error("Failed to sync to Google Sheets");
  }
}
