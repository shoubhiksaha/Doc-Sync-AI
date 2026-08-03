import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Extract session token (handles both secure and non-secure environments)
  const token = request.cookies.get('next-auth.session-token') || request.cookies.get('__Secure-next-auth.session-token');
  const isGuest = request.cookies.get('docsync_guest');

  const isLoginPage = request.nextUrl.pathname.startsWith('/login');
  const isApiRoute = request.nextUrl.pathname.startsWith('/api');
  const isAuthRoute = request.nextUrl.pathname.startsWith('/api/auth');

  // Allow access to auth routes, otherwise check for token/guest for API and UI
  if (!token && !isGuest && !isLoginPage && (!isApiRoute || (isApiRoute && !isAuthRoute))) {
    if (isApiRoute) {
      return NextResponse.json({ error: 'Unauthorized. Please login or use demo mode.' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (token && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|workbox-.*).*)'],
};
