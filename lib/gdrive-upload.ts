import { google, drive_v3 } from 'googleapis';
import { Readable } from 'stream';

async function ensureFolder(drive: drive_v3.Drive, folderName: string, parentId?: string): Promise<string> {
  const query = parentId 
    ? `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false and '${parentId}' in parents`
    : `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    
  const res = await drive.files.list({
    q: query,
    spaces: 'drive',
    fields: 'files(id, name)',
  });
  
  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id as string;
  }
  
  const createRes = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : undefined,
    },
    fields: 'id',
  });
  
  return createRes.data.id as string;
}

/**
 * Uploads a file (WebP or Audio) to Google Drive in the DocSync AI Media folder.
 * Returns a link to view the file. Returns null if upload fails.
 */
export async function uploadArchiveToGDrive(
  buffer: Buffer,
  filename: string,
  accessToken: string,
  mimeType: string = 'image/webp'
): Promise<string | null> {
  try {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: 'v3', auth });

    const rootId = await ensureFolder(drive, 'DocSync AI');
    const mediaId = await ensureFolder(drive, 'DocSync AI Media', rootId);

    // Upload the file as a stream
    const stream = Readable.from(buffer);
    const uploadResponse = await drive.files.create({
      requestBody: {
        name: filename,
        mimeType: mimeType,
        parents: [mediaId],
      },
      media: {
        mimeType: mimeType,
        body: stream,
      },
      fields: 'id,webViewLink',
    });

    const fileId = uploadResponse.data.id;
    if (!fileId) {
      console.warn('GDrive upload: no file ID returned');
      return null;
    }

    return `https://drive.google.com/file/d/${fileId}/view`;
  } catch (err) {
    console.error('GDrive archive upload failed (non-fatal):', err);
    return null;
  }
}
