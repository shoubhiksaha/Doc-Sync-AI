import { google } from 'googleapis';
import { Readable } from 'stream';

/**
 * Uploads a WebP archive buffer to Google Drive (using drive.file scope).
 * Makes the file publicly viewable and returns a shareable link.
 * Returns null if the upload fails (non-fatal - sync continues without image link).
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

    // Make the file publicly readable (anyone with the link can view)
    // This is allowed under drive.file scope for files this app created.
    await drive.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' },
    });

    return `https://drive.google.com/file/d/${fileId}/view`;
  } catch (err) {
    console.error('GDrive archive upload failed (non-fatal):', err);
    return null;
  }
}
