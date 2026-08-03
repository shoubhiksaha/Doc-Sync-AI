import { NextResponse } from 'next/server';

export async function GET() {
  const clientId = process.env.NOTION_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'Notion integration not configured' }, { status: 500 });
  }
  
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  const redirectUri = encodeURIComponent(`${baseUrl}/api/auth/notion/callback`);
  const state = crypto.randomUUID();
  
  // Notion OAuth Authorization URL
  const notionAuthUrl = `https://api.notion.com/v1/oauth/authorize?client_id=${clientId}&response_type=code&owner=user&redirect_uri=${redirectUri}&state=${state}`;
  
  // Redirect user to Notion's consent screen
  const response = NextResponse.redirect(notionAuthUrl);
  response.cookies.set('notion_oauth_state', state, { httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 600 });
  return response;
}
