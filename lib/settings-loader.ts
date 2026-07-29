import { NextRequest } from 'next/server';
import { getDecryptedCookie } from './crypto';
import { getToken } from 'next-auth/jwt';
import { db } from './firebase-admin';
import { unwrapAndDecryptDEK, KmsPayload } from './security';

export interface DocSyncSettings {
  openaiKey?: string;
  notionKey?: string;
  notionDbId?: string;
  uploadDest: 'both' | 'gdrive' | 'notion';
}

export async function loadSettings(req: NextRequest): Promise<DocSyncSettings> {
  // 1. Try to load from Cookies first (Stateless Mode)
  let openaiKey = getDecryptedCookie(req, 'docsync_openai');
  let notionKey = getDecryptedCookie(req, 'docsync_notion');
  let notionDbId = getDecryptedCookie(req, 'docsync_notion_db');
  let uploadDest = (req.cookies.get('docsync_upload_dest')?.value as DocSyncSettings['uploadDest']) || 'both';

  // 2. Fallback to Firestore (Persistent Mode) if cookies are missing
  if (db && (!openaiKey || !notionKey || !notionDbId)) {
    const token = await getToken({ req });
    if (token?.email) {
      try {
        const doc = await db.collection('users').doc(token.email).get();
        if (doc.exists) {
          const data = doc.data();
          if (data) {
            if (!openaiKey && data.openaiKey) {
              openaiKey = unwrapAndDecryptDEK(data.openaiKey as KmsPayload);
            }
            if (!notionKey && data.notionKey) {
              notionKey = unwrapAndDecryptDEK(data.notionKey as KmsPayload);
            }
            if (!notionDbId && data.notionDbId) {
              notionDbId = unwrapAndDecryptDEK(data.notionDbId as KmsPayload);
            }
            if (data.uploadDest) {
              uploadDest = data.uploadDest;
            }
          }
        }
      } catch (err) {
        console.error('Failed to load persistent settings from Firestore', err);
      }
    }
  }

  return { openaiKey, notionKey, notionDbId, uploadDest };
}
