import { NextRequest, NextResponse } from 'next/server';
import { encrypt } from '@/lib/crypto';

export async function POST(req: NextRequest) {
  try {
    const { openaiKey, notionKey, notionDbId, uploadDest } = await req.json();
    
    const response = NextResponse.json({ success: true });
    
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict' as const,
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    };

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
      // Not sensitive, no encryption needed
      response.cookies.set('docsync_upload_dest', uploadDest, cookieOptions);
    }

    return response;
  } catch {
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return NextResponse.json({
    hasOpenAiKey: !!req.cookies.get('docsync_openai'),
    hasNotionKey: !!req.cookies.get('docsync_notion'),
    hasNotionDbId: !!req.cookies.get('docsync_notion_db'),
    uploadDest: req.cookies.get('docsync_upload_dest')?.value || 'both'
  });
}
