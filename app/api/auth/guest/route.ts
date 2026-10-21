import { NextResponse } from 'next/server';
import { isDemoEnabled } from '@/core/env';
import { createGuestToken, GUEST_COOKIE, GUEST_TTL_SECONDS, guestSecret } from '@/core/guest';

const cookieBase = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/' };

/** Starts a signed demo session. */
export async function POST() {
  const secret = guestSecret();
  if (!isDemoEnabled() || !secret) {
    return NextResponse.json({ error: 'Demo mode is currently unavailable. Please sign in with Google.' }, { status: 403 });
  }
  const response = NextResponse.json({ success: true });
  response.cookies.set(GUEST_COOKIE, await createGuestToken(secret), { ...cookieBase, maxAge: GUEST_TTL_SECONDS });
  return response;
}

/** Ends the demo session. */
export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(GUEST_COOKIE, '', { ...cookieBase, maxAge: 0 });
  return response;
}
