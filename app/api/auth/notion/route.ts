import { NextResponse, NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const clientId = process.env.NOTION_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'Notion integration not configured' }, { status: 500 });
  }
  
  // Base URL from the request, fallback to env variable or localhost
  const host = req.headers.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const redirectUri = encodeURIComponent(`${protocol}://${host}/api/auth/notion/callback`);
  
  // Notion OAuth Authorization URL
  const notionAuthUrl = `https://api.notion.com/v1/oauth/authorize?client_id=${clientId}&response_type=code&owner=user&redirect_uri=${redirectUri}`;
  
  // Redirect user to Notion's consent screen
  return NextResponse.redirect(notionAuthUrl);
}
