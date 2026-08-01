import { NextRequest, NextResponse } from 'next/server';
import { syncToNotion } from '@/lib/notion';
import { loadSettings } from '@/lib/settings-loader';
import { google } from 'googleapis';
import { getToken } from 'next-auth/jwt';
import { uploadToGDrive, ensureFolder, getGoogleAuth, makeFilePublic } from '@/lib/gdrive';
import sharp from 'sharp';

import { saveMediaLocallyForDemo } from '@/lib/demo-storage';

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
    const noteText = formData.get('noteText') as string | null;
    const audioFile = formData.get('audioFile') as File | null;
    const uploadDest = (formData.get('uploadDest') as string) || 'both';

    if (!data || !profileId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    console.log(`Syncing data for ${profileId}... document attached: ${!!documentFile}`);

    const { notionKey: loadedNotionKey, notionDbId: loadedNotionDbId } = await loadSettings(req);
    const notionKey = req.headers.get('x-notion-key') || loadedNotionKey;
    const notionDbId = req.headers.get('x-notion-db-id') || loadedNotionDbId;

    let archiveBuffer: Buffer | null = null;
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

    const finalNoteText = noteText || '';
    let audioBuffer: Buffer | null = null;
    
    if (audioFile) {
      audioBuffer = Buffer.from(await audioFile.arrayBuffer());
    }

    let gdriveUrl: string | null = null;
    let finalLinkToAudio: string | null = null;
    
    // --- Notion Sync ---
    const notionPromise = syncToNotion(data, profileId, notionKey, notionDbId, archiveBuffer, finalNoteText, audioBuffer);
    let notionResult;
    if (uploadDest === 'both' || uploadDest === 'notion') {
      try {
        notionResult = await notionPromise;
      } catch (err) {
        console.error('Notion sync failed:', err);
        notionResult = { success: false, dummy: false, url: null };
      }
    } else {
      notionResult = { success: false, dummy: false, url: null };
    }

    // --- Google Drive / Local Storage Upload ---
    if (accessToken) {
      // Normal flow: User logged in, upload to their Google Drive
      if (archiveBuffer && (!notionResult.success || 'dummy' in notionResult)) {
        const fileName = `${profileId}_${Date.now()}.webp`;
        gdriveUrl = await uploadToGDrive(accessToken, archiveBuffer, fileName);
      }
      if (audioBuffer && uploadDest !== 'notion') {
        const fileName = `voice_${profileId}_${Date.now()}.webm`;
        finalLinkToAudio = await uploadToGDrive(accessToken, audioBuffer, fileName, 'audio/webm');
      }
    } else {
      // Demo flow: Modular local storage (can be easily deleted later)
      const saveImage = archiveBuffer && (!notionResult.success || 'dummy' in notionResult) ? archiveBuffer : null;
      const saveAudio = audioBuffer && uploadDest !== 'notion' ? audioBuffer : null;
      
      const demoMedia = await saveMediaLocallyForDemo(saveImage, saveAudio, profileId, req);
      if (demoMedia.imageUrl) gdriveUrl = demoMedia.imageUrl;
      if (demoMedia.audioUrl) finalLinkToAudio = demoMedia.audioUrl;
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
    // The user might have provided an explicit sheet ID, but we want to auto-create and manage one 
    // using drive.file scope if none works or none is provided.
    const explicitSpreadsheetId = clientSheetId || process.env.GOOGLE_SHEET_ID;

    const sheetsPromise = (async () => {
      let spreadsheetId = explicitSpreadsheetId;
      const sheetName = profileId === 'ngo-receipt' ? 'NGO_Receipts' : 'Factory_Slips';

      if ((!accessToken && !process.env.GOOGLE_SHARED_FOLDER_ID && !process.env.GOOGLE_SHEET_ID) || (spreadsheetId && spreadsheetId.startsWith('demo-sheet-'))) {
        console.warn('Skipping Sheets sync: in demo mode, returning mock success.');
        return { 
          success: true, 
          mock: true,
          message: 'Data processed (Demo Mode - Not Saved to Real Sheet)'
        };
      }

      const authClient = getGoogleAuth(accessToken);
      if (!authClient) {
        console.warn('Skipping Sheets sync: no access token and no service account.');
        return { success: true, mock: true };
      }

      const drive = google.drive({ version: 'v3', auth: authClient });
      const sheets = google.sheets({ version: 'v4', auth: authClient });

      // If no explicit ID, find or create "DocSync AI Data"
      if (!spreadsheetId) {
        try {
          const res = await drive.files.list({
            q: "name='DocSync AI Data' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
            spaces: 'drive',
            fields: 'files(id, name)',
          });
          
          if (res.data.files && res.data.files.length > 0) {
            spreadsheetId = res.data.files[0].id as string;
          } else {
            let sheetId = 0;
            // Create it
            if (!accessToken && process.env.GOOGLE_SHARED_FOLDER_ID) {
              const driveRes = await drive.files.create({
                requestBody: {
                  name: 'DocSync AI Demo Data',
                  mimeType: 'application/vnd.google-apps.spreadsheet',
                  parents: [process.env.GOOGLE_SHARED_FOLDER_ID],
                },
                fields: 'id',
              });
              spreadsheetId = driveRes.data.id!;
              
              const sheetData = await sheets.spreadsheets.get({ spreadsheetId });
              sheetId = sheetData.data.sheets?.[0]?.properties?.sheetId || 0;

              await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                requestBody: {
                  requests: [
                    {
                      updateSheetProperties: {
                        properties: {
                          sheetId: sheetId,
                          title: sheetName,
                          gridProperties: { frozenRowCount: 1 },
                        },
                        fields: 'title,gridProperties.frozenRowCount',
                      }
                    }
                  ]
                }
              });
            } else {
              const createRes = await sheets.spreadsheets.create({
                requestBody: {
                  properties: { title: accessToken ? 'DocSync AI Data' : 'DocSync AI Demo Data' },
                  sheets: [{ properties: { title: sheetName, gridProperties: { frozenRowCount: 1 } } }]
                }
              });
              spreadsheetId = createRes.data.spreadsheetId as string;
              sheetId = createRes.data.sheets?.[0].properties?.sheetId ?? 0;
            }

            if (!accessToken && !process.env.GOOGLE_SHARED_FOLDER_ID) {
              await makeFilePublic(drive, spreadsheetId);
            }
            
            // Move spreadsheet to "DocSync AI" folder if not using shared folder
            if (!(!accessToken && process.env.GOOGLE_SHARED_FOLDER_ID)) {
              try {
                const folderName = accessToken ? 'DocSync AI' : 'DocSync AI Demo';
                const rootFolderId = await ensureFolder(drive, folderName);
                // We need to fetch the file's current parents to remove them
                const fileInfo = await drive.files.get({ fileId: spreadsheetId, fields: 'parents' });
                const previousParents = fileInfo.data.parents?.join(',') || '';
                
                await drive.files.update({
                  fileId: spreadsheetId,
                  addParents: rootFolderId,
                  removeParents: previousParents,
                  fields: 'id, parents',
                });
              } catch (err) {
                console.error('Failed to move spreadsheet to folder:', err);
              }
            }
            const headers = profileId === 'ngo-receipt' 
              ? ['Date', 'Donor Name', 'Amount', 'PAN Number', 'Notes (Text/Audio)', 'Voice Note Audio Link', 'Link to Image', 'Synced At', 'Sync Status']
              : ['Date', 'Vehicle Number', 'Gross Weight', 'Tare Weight', 'Notes (Text/Audio)', 'Voice Note Audio Link', 'Link to Image', 'Synced At', 'Sync Status'];
            
            await sheets.spreadsheets.values.update({
              spreadsheetId,
              range: `${sheetName}!A1`,
              valueInputOption: 'USER_ENTERED',
              requestBody: { values: [headers] },
            });

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
                          backgroundColor: { red: 0.85, green: 0.92, blue: 0.98 },
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
          }
        } catch (err) {
          console.error("Error finding/creating DocSync AI Data spreadsheet:", err);
          throw err; // Fail the sync
        }
      }

      const schemaCookieName = `docsync_schema_${profileId.replace(/-/g, '_')}`;
      const schemaRaw = req.cookies.get(schemaCookieName)?.value;
      const schemaKeys: string[] | null = schemaRaw ? JSON.parse(schemaRaw) : null;

      const pkCookieName = `docsync_pk_${profileId.replace(/-/g, '_')}`;
      const pkRaw = req.cookies.get(pkCookieName)?.value;

      let rowValues: unknown[];
      let pkIndex = -1;
      let pkValue: string | undefined;

      if (schemaKeys) {
        rowValues = schemaKeys.map((key, idx) => {
          let val: unknown = '';
          if (key === 'synced_at') val = new Date().toISOString();
          else if (key === 'sync_status') val = 'Success';
          else if (key === 'link_to_image') val = finalLinkToImage;
          else if (key === 'notes') val = finalNoteText;
          else if (key === 'voice_note_link') val = finalLinkToAudio || '';
          else if (key === 'net_weight') {
            const fw = data as Record<string, unknown>;
            val = (Number(fw.grossWeight) ?? 0) - (Number(fw.tareWeight) ?? 0);
          } else {
            const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
            const dataRec = data as Record<string, unknown>;
            val = dataRec[camelKey] ?? dataRec[key] ?? '';
          }

          if (key === pkRaw) {
            pkIndex = idx;
            pkValue = String(val);
          }
          return val;
        });
      } else {
        const baseRow = profileId === 'ngo-receipt'
          ? [data.date, data.donorName, data.amount, data.panNumber || '']
          : [data.date, data.vehicleNumber, data.grossWeight, data.tareWeight];
        rowValues = [...baseRow, finalNoteText, finalLinkToAudio || '', finalLinkToImage, new Date().toISOString(), 'Success'];
      }

      // ----------------------------------------------------
      // Duplicate Detection Logic
      // ----------------------------------------------------
      let matchingRowIndices: number[] = [];
      if (pkRaw && pkIndex >= 0 && pkValue) {
        try {
          const sheetData = await sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId as string,
            range: `${sheetName}!A:Z`
          });
          const rows = sheetData.data.values || [];
          matchingRowIndices = rows
            .map((row, i) => (row[pkIndex] === pkValue ? i : -1))
            .filter(i => i > 0); // skip header (row 0)

          if (matchingRowIndices.length > 0 && !duplicateAction) {
            // Abort and trigger 409 Conflict for UI
            throw {
              isDuplicateConflict: true,
              duplicateCount: matchingRowIndices.length,
              primaryKeyLabel: pkRaw,
              primaryKeyValue: pkValue
            };
          }
        } catch (err: unknown) {
          if ((err as { isDuplicateConflict?: boolean })?.isDuplicateConflict) throw err;
          // Ignore other errors (e.g. "Unable to parse range" meaning tab doesn't exist yet)
        }
      }

      try {
        if (duplicateAction === 'replace' && matchingRowIndices.length > 0) {
          // Replace all matched records inline
          for (const rowIndex of matchingRowIndices) {
            await sheets.spreadsheets.values.update({
              spreadsheetId: spreadsheetId as string,
              range: `${sheetName}!A${rowIndex + 1}:Z${rowIndex + 1}`,
              valueInputOption: 'USER_ENTERED',
              requestBody: { values: [rowValues] },
            });
          }
        } else {
          // Normal Append (or 'keep_both')
          await sheets.spreadsheets.values.append({
            spreadsheetId: spreadsheetId as string,
            range: `${sheetName}!A:Z`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [rowValues] },
          });
        }
      } catch (err: unknown) {
        const error = err as Error;
        if (error?.message && error.message.includes('Unable to parse range')) {
          // Create the missing tab
          const tabRes = await sheets.spreadsheets.batchUpdate({
            spreadsheetId: spreadsheetId as string,
            requestBody: {
              requests: [{ addSheet: { properties: { title: sheetName, gridProperties: { frozenRowCount: 1 } } } }]
            }
          });
          
          const newSheetId = tabRes.data.replies?.[0].addSheet?.properties?.sheetId ?? 0;
          const headers = profileId === 'ngo-receipt' 
            ? ['Date', 'Donor Name', 'Amount', 'PAN Number', 'Link to Image', 'Notes', 'Voice Note Link', 'Synced At', 'Sync Status']
            : ['Date', 'Vehicle Number', 'Gross Weight', 'Tare Weight', 'Link to Image', 'Notes', 'Voice Note Link', 'Synced At', 'Sync Status'];

          // Add headers
          await sheets.spreadsheets.values.update({
            spreadsheetId: spreadsheetId as string,
            range: `${sheetName}!A1`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [headers] },
          });

          // Style headers
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId: spreadsheetId as string,
            requestBody: {
              requests: [
                {
                  repeatCell: {
                    range: { sheetId: newSheetId, startRowIndex: 0, endRowIndex: 1 },
                    cell: {
                      userEnteredFormat: {
                        textFormat: { bold: true },
                        backgroundColor: { red: 0.85, green: 0.92, blue: 0.98 },
                        horizontalAlignment: 'CENTER',
                      },
                    },
                    fields: 'userEnteredFormat(textFormat,backgroundColor,horizontalAlignment)',
                  },
                },
                {
                  autoResizeDimensions: {
                    dimensions: { sheetId: newSheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: headers.length },
                  },
                },
              ],
            },
          });

          // Retry append
          await sheets.spreadsheets.values.append({
            spreadsheetId: spreadsheetId as string,
            range: `${sheetName}!A:Z`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [rowValues] },
          });
        } else {
          throw err;
        }
      }

      return { success: true, spreadsheetId: spreadsheetId as string };
    })();

    let sheetsResult: { success: boolean; spreadsheetId?: string; mock?: boolean };
    try {
      sheetsResult = await sheetsPromise;
    } catch (e: unknown) {
      if ((e as { isDuplicateConflict?: boolean })?.isDuplicateConflict) {
        return NextResponse.json(e, { status: 409 });
      }
      console.error('Google Sheets append error:', e);
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
      syncDetails.sheets = sheetsResult.spreadsheetId ? 'success' : 'skipped';
    }

    if (errors.length > 0) {
      return NextResponse.json({ success: false, errors, syncDetails }, { status: 500 });
    }

    let finalMessage = 'Successfully synced to all destinations';
    if (!accessToken && process.env.GOOGLE_SHEET_ID) {
      finalMessage = 'Successfully synced! Since this is demo we are editing a preexisting sheet, but if used with real mail id it will create a new sheet.';
    }

    return NextResponse.json({
      success: true,
      message: finalMessage,
      syncDetails,
      imageUrl: finalLinkToImage || null,
      spreadsheetUrl: sheetsResult.spreadsheetId ? `https://docs.google.com/spreadsheets/d/${sheetsResult.spreadsheetId}/edit` : undefined,
    });

  } catch (error: unknown) {
    console.error('API Sync Error:', error);
    return NextResponse.json({ error: 'An internal error occurred during data sync' }, { status: 500 });
  }
}
