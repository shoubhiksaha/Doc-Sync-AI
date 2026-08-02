import { NextRequest, NextResponse } from 'next/server';
import { encrypt } from '@/lib/crypto';
import { getToken } from 'next-auth/jwt';
import { generateAndWrapDEK } from '@/lib/security';

export async function POST(req: NextRequest) {
  try {
    const { openaiKey, notionKey, notionDbId, uploadDest, persistent } = await req.json();
    
    const response = NextResponse.json({ success: true });
    
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      path: '/',
      maxAge: 60 * 60 * 24 * 365 * 10, // 10 years
    };

    // 1. ALWAYS set the cookies (Stateless Mode basis)
    if (openaiKey) {
      response.cookies.set('docsync_openai', encrypt(openaiKey), cookieOptions);
    } else if (openaiKey === '') {
      response.cookies.delete('docsync_openai');
    }

    if (notionKey) {
      response.cookies.set('docsync_notion', encrypt(notionKey), cookieOptions);
    } else if (notionKey === '') {
      response.cookies.delete('docsync_notion');
    }

    if (notionDbId) {
      response.cookies.set('docsync_notion_db', encrypt(notionDbId), cookieOptions);
    } else if (notionDbId === '') {
      response.cookies.delete('docsync_notion_db');
    }
    if (uploadDest) {
      response.cookies.set('docsync_upload_dest', uploadDest, cookieOptions);
    }
    
    // Save persistent flag so UI knows
    response.cookies.set('docsync_persistent', persistent ? 'true' : 'false', { ...cookieOptions, httpOnly: false });

    // 2. Persistent Mode (Firestore KMS Envelope Encryption)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let db: any = null;
    try {
      const admin = await import('@/lib/firebase-admin');
      db = admin.db;
    } catch (err) {
      console.error("Firebase admin dynamic import failed:", err);
    }

    if (persistent && db) {
      const token = await getToken({ req });
      if (token?.email) {
        const updateData: Record<string, unknown> = {};
        
        if (openaiKey) updateData.openaiKey = generateAndWrapDEK(openaiKey);
        else if (openaiKey === '') updateData.openaiKey = null;

        if (notionKey) updateData.notionKey = generateAndWrapDEK(notionKey);
        else if (notionKey === '') updateData.notionKey = null;

        if (notionDbId) updateData.notionDbId = generateAndWrapDEK(notionDbId);
        else if (notionDbId === '') updateData.notionDbId = null;

        if (uploadDest) updateData.uploadDest = uploadDest;

        if (Object.keys(updateData).length > 0) {
          await db.collection('users').doc(token.email).set(updateData, { merge: true });
        }
      }
    } else if (persistent === false && db) {
      // If user toggles OFF persistent mode, wipe DB keys
      const token = await getToken({ req });
      if (token?.email) {
        await db.collection('users').doc(token.email).delete().catch(() => {});
      }
    }

    return response;
  } catch (error) {
    console.error('Settings save error:', error);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  let hasOpenAiKey = !!req.cookies.get('docsync_openai');
  let hasNotionKey = !!req.cookies.get('docsync_notion');
  let hasNotionDbId = !!req.cookies.get('docsync_notion_db');
  let uploadDest = req.cookies.get('docsync_upload_dest')?.value || 'both';
  let isPersistent = req.cookies.get('docsync_persistent')?.value === 'true';

  // If they are missing keys (e.g. new device) but are logged in, check Firestore
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any = null;
  try {
    const admin = await import('@/lib/firebase-admin');
    db = admin.db;
  } catch (err) {}

  if (db && (!hasOpenAiKey || !hasNotionKey || !hasNotionDbId)) {
    const token = await getToken({ req });
    if (token?.email) {
      const doc = await db.collection('users').doc(token.email).get();
      if (doc.exists) {
        const data = doc.data();
        if (data) {
          isPersistent = true;
          if (data.openaiKey) hasOpenAiKey = true;
          if (data.notionKey) hasNotionKey = true;
          if (data.notionDbId) hasNotionDbId = true;
          if (data.uploadDest) uploadDest = data.uploadDest;
        }
      }
    }
  }

  return NextResponse.json({
    hasOpenAiKey,
    hasNotionKey,
    hasNotionDbId,
    uploadDest,
    isPersistent
  });
}
