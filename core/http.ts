import { NextResponse, type NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { isDemoEnabled } from './env';
import { GUEST_COOKIE, guestSecret, verifyGuestToken } from './guest';

export interface Caller {
  accessToken?: string;
  email?: string;
  isGuest: boolean;
}

/**
 * Who is calling: a signed-in Google user, a verified demo guest, or nobody (null).
 * Middleware already enforces this; routes check again so they're safe on their own.
 */
export async function resolveCaller(req: NextRequest): Promise<Caller | null> {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET }).catch(() => null);
  if (token) {
    return {
      accessToken: typeof token.accessToken === 'string' && !token.error ? token.accessToken : undefined,
      email: typeof token.email === 'string' ? token.email : undefined,
      isGuest: false,
    };
  }
  if (isDemoEnabled() && (await verifyGuestToken(req.cookies.get(GUEST_COOKIE)?.value, guestSecret()))) {
    return { isGuest: true };
  }
  return null;
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized. Please login or use demo mode.' }, { status: 401 });
}

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function parseJson<T>(raw: FormDataEntryValue | null, fallback: T): T {
  if (typeof raw !== 'string' || !raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
