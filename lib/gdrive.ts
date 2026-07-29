import { google } from 'googleapis';
import { Readable } from 'stream';

export async function uploadToGDrive(
  accessToken: string,
  buffer: Buffer,
  fileName: string,
  mimeType: string = 'image/webp'
): Promise<string | null> {
  try {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const drive = google.drive({ version: 'v3', auth });

    // 1. Check if "DocSync Media" folder exists
    const folderName = 'DocSync Media';
    let folderId: string | null = null;

    const folderRes = await drive.files.list({
      q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`,
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    if (folderRes.data.files && folderRes.data.files.length > 0) {
      folderId = folderRes.data.files[0].id!;
    } else {
      // Create the folder
      const createFolderRes = await drive.files.create({
        requestBody: {
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
        },
        fields: 'id',
      });
      folderId = createFolderRes.data.id!;
    }

    // 2. Upload the file to the folder
    // Convert Buffer to Stream
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);

    const fileRes = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
      },
      media: {
        mimeType: mimeType,
        body: stream,
      },
      fields: 'id, webViewLink',
    });

    // We can't automatically make it public with drive.file scope on consumer accounts sometimes,
    // but the user owns the file so they can click the link and view it.
    return fileRes.data.webViewLink || null;
  } catch (error) {
    console.error('GDrive upload error:', error);
    return null;
  }
}
