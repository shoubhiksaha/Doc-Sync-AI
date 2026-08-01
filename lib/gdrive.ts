/* eslint-disable @typescript-eslint/no-explicit-any */
import { google, drive_v3 } from 'googleapis';
import { Readable } from 'stream';

export function getGoogleAuth(accessToken?: string): any {
  if (accessToken) {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    return auth;
  }
  
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;
  if (email && key) {
    return new google.auth.JWT({
      email: email,
      key: key.replace(/^"|"$/g, '').replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.file'],
    });
  }
  return null;
}

export async function makeFilePublic(drive: drive_v3.Drive, fileId: string) {
  try {
    await drive.permissions.create({
      fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });
  } catch (err) {
    console.error(`Failed to make file ${fileId} public`, err);
  }
}

export async function ensureFolder(drive: drive_v3.Drive, folderName: string, parentId?: string): Promise<string> {
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

export async function uploadToGDrive(
  accessToken: string | null,
  buffer: Buffer,
  fileName: string,
  mimeType: string = 'image/webp'
): Promise<string | null> {
  try {
    const auth = getGoogleAuth(accessToken || undefined);
    if (!auth) return null;

    const drive = google.drive({ version: 'v3', auth: auth as never });

    const rootId = await ensureFolder(drive, accessToken ? 'DocSync AI' : 'DocSync AI Demo');
    const mediaId = await ensureFolder(drive, accessToken ? 'DocSync AI Media' : 'DocSync AI Demo Media', rootId);

    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);

    const fileRes = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [mediaId],
      },
      media: {
        mimeType: mimeType,
        body: stream,
      },
      fields: 'id, webViewLink',
    });

    const fileId = fileRes.data.id;
    if (fileId && !accessToken) {
      // If uploaded via service account, we must make it public to be viewable
      await makeFilePublic(drive, fileId);
    }

    return fileRes.data.webViewLink || null;
  } catch (error) {
    console.error('GDrive upload error:', error);
    return null;
  }
}
