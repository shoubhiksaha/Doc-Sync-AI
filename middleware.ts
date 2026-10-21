import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { isDemoEnabled } from '@/core/env';
import { GUEST_COOKIE, guestSecret, verifyGuestToken } from '@/core/guest';
import { checkRateLimit, type Caller } from '@/core/rate-limit';

/** API routes reachable without a session. */
const PUBLIC_API = ['/api/health', '/api/auth/'];

function isPublicApi(pathname: string): boolean {
  return PUBLIC_API.some(p => (p.endsWith('/') ? pathname.startsWith(p) : pathname === p));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith('/api/');

  // NextAuth's own endpoints (session polling etc.) and the health check skip everything below,
  // except that issuing guest sessions is rate-limited.
  if (isApi && isPublicApi(pathname)) {
    if (pathname === '/api/auth/guest' && !(await checkRateLimit(request.headers, pathname, 'anonymous'))) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }
    return NextResponse.next();
  }

  const session = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET }).catch(() => null);
  const isGuest = !session
    && isDemoEnabled()
    && (await verifyGuestToken(request.cookies.get(GUEST_COOKIE)?.value, guestSecret()));
  const caller: Caller = session ? 'user' : isGuest ? 'guest' : 'anonymous';

  if (pathname.startsWith('/login')) {
    return session ? NextResponse.redirect(new URL('/', request.url)) : NextResponse.next();
  }

  if (caller === 'anonymous') {
    if (isApi) return NextResponse.json({ error: 'Unauthorized. Please login or use demo mode.' }, { status: 401 });
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (isApi && !(await checkRateLimit(request.headers, pathname, caller))) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
  }

  return NextResponse.next();
}

export const config = {
  // Skip Next internals and static files (anything with a file extension, e.g. /icon.svg, /sw.js).
  matcher: ['/((?!_next/static|_next/image|.*\\.[a-zA-Z0-9]+$).*)'],
};
