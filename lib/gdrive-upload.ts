import { google } from 'googleapis';
import { Readable } from 'stream';

/**
 * Uploads a WebP archive buffer to Google Drive (using drive.file scope).
 * Makes the file private (accessible only to the user when logged into Google).
 * Returns a link to view the file. Returns null if upload fails (non-fatal).
 */
export async function uploadArchiveToGDrive(
  buffer: Buffer,
  filename: string,
  accessToken: string
): Promise<string | null> {
  try {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: 'v3', auth });

    // Upload the WebP file as a stream (stays in-memory, no disk write)
    const stream = Readable.from(buffer);
    const uploadResponse = await drive.files.create({
      requestBody: {
        name: filename,
        mimeType: 'image/webp',
      },
      media: {
        mimeType: 'image/webp',
        body: stream,
      },
      fields: 'id,webViewLink',
    });

    const fileId = uploadResponse.data.id;
    if (!fileId) {
      console.warn('GDrive upload: no file ID returned');
      return null;
    }

    // Link is private by default since we no longer create the "anyone" permission

    return `https://drive.google.com/file/d/${fileId}/view`;
  } catch (err) {
    console.error('GDrive archive upload failed (non-fatal):', err);
    return null;
  }
}
