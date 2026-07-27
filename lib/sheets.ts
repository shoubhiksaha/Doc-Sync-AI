import { google } from 'googleapis';
import { NgoReceiptData, FactoryWeightSlipData } from './schemas';

export async function syncToGoogleSheets(
  data: NgoReceiptData | FactoryWeightSlipData, 
  profileId: string, 
  accessToken?: string,
  spreadsheetId?: string | null
) {
  if (!accessToken) {
    console.warn("No Google access token provided. Bypassing Google Sheets sync.");
    return { success: true, mock: true };
  }

  // The spreadsheetId will come from the user's settings, but for hackathon demo we can still allow an env fallback 
  // or pass it explicitly. Let's use a hardcoded or env var one if not provided, but auth is strictly USER OAuth.
  const targetSheetId = spreadsheetId || process.env.GOOGLE_SHEET_ID;

  if (!targetSheetId) {
    console.warn("Missing GOOGLE_SHEET_ID. Bypassing Sheets sync.");
    return { success: true, mock: true };
  }

  try {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const sheets = google.sheets({ version: 'v4', auth });

    // Determine values to append based on profile
    let values: unknown[][] = [];
    let range = '';

    if (profileId === 'ngo-receipt') {
      const ngoData = data as NgoReceiptData;
      range = 'NGO_Receipts!A:E';
      values = [[
        ngoData.date,
        ngoData.donorName,
        ngoData.amount,
        ngoData.panNumber || '',
        new Date().toISOString()
      ]];
    } else if (profileId === 'factory-weight-slip') {
      const factoryData = data as FactoryWeightSlipData;
      range = 'Factory_Slips!A:E';
      values = [[
        factoryData.date,
        factoryData.vehicleNumber,
        factoryData.grossWeight,
        factoryData.tareWeight,
        new Date().toISOString()
      ]];
    } else {
      throw new Error('Unsupported profile ID');
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId: targetSheetId,
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
