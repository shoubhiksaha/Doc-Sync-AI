const getToken = jest.fn();
jest.mock('next-auth/jwt', () => ({ getToken: (...a: unknown[]) => getToken(...a) }));

import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';
import { createGuestToken } from '@/core/guest';
import { resetRateLimits, limitFor } from '@/core/rate-limit';

const SECRET = 'mw-secret';

function request(path: string, cookie?: string, ip = '5.5.5.5') {
  const headers: Record<string, string> = { 'x-real-ip': ip };
  if (cookie) headers.cookie = cookie;
  return new NextRequest(`http://localhost${path}`, { headers });
}

describe('middleware', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env = { ...saved, NEXTAUTH_SECRET: SECRET };
    delete process.env.MODULE_DEMO;
    getToken.mockReset().mockResolvedValue(null);
    resetRateLimits();
  });
  afterAll(() => { process.env = saved; });

  it('lets health and auth endpoints through without a session', async () => {
    expect((await middleware(request('/api/health'))).status).toBe(200);
    expect((await middleware(request('/api/auth/session'))).status).toBe(200);
  });

  it('rejects anonymous API calls and redirects anonymous pages to /login', async () => {
    expect((await middleware(request('/api/settings'))).status).toBe(401);
    const page = await middleware(request('/'));
    expect(page.status).toBe(307);
    expect(page.headers.get('location')).toBe('http://localhost/login');
  });

  it('no longer accepts the forgeable docsync_guest=true cookie', async () => {
    expect((await middleware(request('/api/settings', 'docsync_guest=true'))).status).toBe(401);
  });

  it('accepts a signed guest session', async () => {
    const token = await createGuestToken(SECRET);
    expect((await middleware(request('/api/settings', `docsync_guest=${token}`))).status).toBe(200);
  });

  it('rejects guest sessions while demo mode is switched off', async () => {
    process.env.MODULE_DEMO = 'off';
    const token = await createGuestToken(SECRET);
    expect((await middleware(request('/api/settings', `docsync_guest=${token}`))).status).toBe(401);
  });

  it('accepts a verified NextAuth session and sends signed-in users away from /login', async () => {
    getToken.mockResolvedValue({ email: 'u@x.com' });
    expect((await middleware(request('/api/settings'))).status).toBe(200);
    const login = await middleware(request('/login'));
    expect(login.headers.get('location')).toBe('http://localhost/');
  });

  it('rate-limits guest AI calls', async () => {
    const cookie = `docsync_guest=${await createGuestToken(SECRET)}`;
    for (let i = 0; i < limitFor('ai', 'guest'); i++) {
      expect((await middleware(request('/api/extract-freeform', cookie))).status).toBe(200);
    }
    expect((await middleware(request('/api/extract-freeform', cookie))).status).toBe(429);
  });

  it('rate-limits issuing guest sessions', async () => {
    for (let i = 0; i < limitFor('guest-issue', 'anonymous'); i++) {
      expect((await middleware(request('/api/auth/guest', undefined, '7.7.7.7'))).status).toBe(200);
    }
    expect((await middleware(request('/api/auth/guest', undefined, '7.7.7.7'))).status).toBe(429);
  });
});
