import { NextResponse, NextRequest } from 'next/server';
import { encrypt } from '@/lib/crypto';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const error = req.nextUrl.searchParams.get('error');

  if (error) {
    return NextResponse.redirect(new URL('/?notionError=access_denied', req.url));
  }
  
  if (!code) {
    return NextResponse.redirect(new URL('/?notionError=no_code', req.url));
  }

  const clientId = process.env.NOTION_CLIENT_ID;
  const clientSecret = process.env.NOTION_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/?notionError=missing_env', req.url));
  }

  // Determine original host
  const host = req.headers.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const redirectUri = `${protocol}://${host}/api/auth/notion/callback`;

  // Exchange code for Notion access token
  const encodedCredentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  try {
    const res = await fetch('https://api.notion.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Basic ${encodedCredentials}`
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri
      })
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('Notion OAuth Error:', data);
      return NextResponse.redirect(new URL('/?notionError=exchange_failed', req.url));
    }

    const accessToken = data.access_token;
    // data.duplicated_template_id might hold the database ID if they duplicated a template
    // data.workspace_id holds the workspace ID

    // Create the response object that redirects the user back to settings or home
    const response = NextResponse.redirect(new URL('/settings?notionConnected=true', req.url));

    // Store the encrypted token in the secure cookie
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const, // Must be lax or strict for OAuth flows
      path: '/',
      maxAge: 60 * 60 * 24 * 365 * 10, // 10 years
    };

    response.cookies.set('docsync_notion', encrypt(accessToken), cookieOptions);

    let databaseId = data.duplicated_template_id;

    if (!databaseId) {
      try {
        // Find a page the user shared with the integration
        const searchRes = await fetch('https://api.notion.com/v1/search', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            filter: { value: 'page', property: 'object' },
            page_size: 1
          })
        });
        
        const searchData = await searchRes.json();
        
        if (searchData.results && searchData.results.length > 0) {
          const parentPageId = searchData.results[0].id;
          
          // Create the "DocSync AI Data" database inside this page
          const createDbRes = await fetch('https://api.notion.com/v1/databases', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Notion-Version': '2022-06-28',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              parent: { type: 'page_id', page_id: parentPageId },
              title: [
                { type: 'text', text: { content: 'DocSync AI Data' } }
              ],
              properties: {
                'Name': { title: {} }, // Notion requires at least a title property
                'Tags': { multi_select: {} },
                'Scanned At': { date: {} },
                'Original Image': { url: {} }
              }
            })
          });

          const createDbData = await createDbRes.json();
          if (createDbRes.ok && createDbData.id) {
            databaseId = createDbData.id;
          } else {
            console.error('Auto-DB creation failed:', createDbData);
          }
        }
      } catch (dbErr) {
        console.error('Failed to auto-create Notion database:', dbErr);
      }
    }

    if (databaseId) {
      response.cookies.set('docsync_notion_db', encrypt(databaseId), cookieOptions);
    }

    return response;

  } catch (err) {
    console.error('Notion OAuth exception:', err);
    return NextResponse.redirect(new URL('/?notionError=server_error', req.url));
  }
}
