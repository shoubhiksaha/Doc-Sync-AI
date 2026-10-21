import { google, type drive_v3 } from 'googleapis';
import { env } from './env';

export type GoogleAuth = InstanceType<typeof google.auth.OAuth2> | InstanceType<typeof google.auth.JWT>;

/** The signed-in user's OAuth token, or the demo service account when there is none. */
export function getGoogleAuth(accessToken?: string): GoogleAuth | null {
  if (accessToken) {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    return auth;
  }
  return serviceAccountAuth();
}

export function serviceAccountAuth(): GoogleAuth | null {
  const email = env('GOOGLE_SERVICE_ACCOUNT_EMAIL');
  const key = env('GOOGLE_PRIVATE_KEY');
  if (!email || !key) return null;
  return new google.auth.JWT({
    email,
    key: key.replace(/^"|"$/g, '').replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.file'],
  });
}

export function hasServiceAccount(): boolean {
  return Boolean(env('GOOGLE_SERVICE_ACCOUNT_EMAIL') && env('GOOGLE_PRIVATE_KEY'));
}

/** Escapes a value for a Drive `q` string literal. */
export function driveQueryLiteral(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/** Finds a folder by name (optionally under a parent), creating it if missing. */
export async function ensureFolder(drive: drive_v3.Drive, folderName: string, parentId?: string): Promise<string> {
  const q = [
    `name=${driveQueryLiteral(folderName)}`,
    "mimeType='application/vnd.google-apps.folder'",
    'trashed=false',
    ...(parentId ? [`${driveQueryLiteral(parentId)} in parents`] : []),
  ].join(' and ');
  const res = await drive.files.list({ q, spaces: 'drive', fields: 'files(id)', pageSize: 1 });
  const existing = res.data.files?.[0]?.id;
  if (existing) return existing;
  const created = await drive.files.create({
    requestBody: { name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: parentId ? [parentId] : undefined },
    fields: 'id',
  });
  return created.data.id as string;
}
