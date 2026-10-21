/**
 * Signed demo ("guest") sessions.
 *
 * The guest cookie used to be a plain `docsync_guest=true` that any client could set. It is now
 * issued by POST /api/auth/guest as `v1.<expiresAt>.<nonce>.<hmac>`, signed with NEXTAUTH_SECRET.
 * Uses Web Crypto only, so it runs in Edge middleware and in Node route handlers alike.
 */

export const GUEST_COOKIE = 'docsync_guest';
export const GUEST_TTL_SECONDS = 60 * 60 * 24; // 1 day

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return toBase64Url(new Uint8Array(signature));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function guestSecret(): string | undefined {
  return process.env.NEXTAUTH_SECRET?.trim() || undefined;
}

export async function createGuestToken(secret: string, now = Date.now()): Promise<string> {
  const expiresAt = Math.floor(now / 1000) + GUEST_TTL_SECONDS;
  const nonce = toBase64Url(crypto.getRandomValues(new Uint8Array(12)));
  const payload = `v1.${expiresAt}.${nonce}`;
  return `${payload}.${await sign(payload, secret)}`;
}

export async function verifyGuestToken(token: string | undefined, secret: string | undefined, now = Date.now()): Promise<boolean> {
  if (!token || !secret) return false;
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return false;
  const expiresAt = Number(parts[1]);
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 <= now) return false;
  const expected = await sign(parts.slice(0, 3).join('.'), secret);
  return constantTimeEqual(parts[3], expected);
}
