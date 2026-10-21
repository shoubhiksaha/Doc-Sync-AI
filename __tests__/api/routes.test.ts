const getToken = jest.fn();
jest.mock('next-auth/jwt', () => ({ getToken: (...a: unknown[]) => getToken(...a) }));
const syncDocument = jest.fn();
jest.mock('@/modules/sync', () => ({
  ...jest.requireActual('@/modules/sync'),
  syncDocument: (...a: unknown[]) => syncDocument(...a),
}));
jest.mock('@/modules/settings', () => ({
  ...jest.requireActual('@/modules/settings'),
  loadSettings: jest.fn(async () => ({ uploadDest: 'both' })),
}));

import { NextRequest } from 'next/server';
import { GET as health } from '@/app/api/health/route';
import { DELETE as endGuest, POST as startGuest } from '@/app/api/auth/guest/route';
import { POST as sync } from '@/app/api/sync/route';
import { createGuestToken } from '@/core/guest';

const SECRET = 'route-secret';

async function syncRequest(fields: Record<string, string>, opts: { guest?: boolean } = {}) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const headers: Record<string, string> = {};
  if (opts.guest) headers.cookie = `docsync_guest=${await createGuestToken(SECRET)}`;
  return new NextRequest('http://localhost/api/sync', { method: 'POST', body: form, headers });
}

const okOutcome = (value: unknown) => ({ status: 'ok', value, ms: 1 });
const fieldsJson = JSON.stringify([{ key: 'donorName', label: 'Donor Name', value: 'Asha' }]);

describe('API routes', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env = { ...saved, NEXTAUTH_SECRET: SECRET };
    delete process.env.MODULE_DEMO;
    getToken.mockReset().mockResolvedValue(null);
    syncDocument.mockReset();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterAll(() => { process.env = saved; });

  it('GET /api/health reports every module and never caches', async () => {
    process.env.APP_ENV = 'staging';
    process.env.APP_BUILD_SHA = 'sha123';
    const res = await health();
    const body = await res.json();
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(body).toMatchObject({ environment: 'staging', version: 'sha123' });
    expect(Object.keys(body.modules).sort()).toEqual(['ai', 'demo', 'extraction', 'media', 'notion', 'settings', 'sheets', 'transcription']);
    expect(['ok', 'degraded']).toContain(body.status);
  });

  it('guest session: issued as an httpOnly cookie, refused when demo is off, cleared on DELETE', async () => {
    const res = await startGuest();
    const cookie = res.cookies.get('docsync_guest');
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.value).toMatch(/^v1\./);

    process.env.MODULE_DEMO = 'off';
    expect((await startGuest()).status).toBe(403);

    expect((await endGuest()).cookies.get('docsync_guest')?.value).toBe('');
  });

  it('sync rejects anonymous callers and unknown profiles', async () => {
    expect((await sync(await syncRequest({ profileId: 'ngo-receipt', fields: fieldsJson }))).status).toBe(401);
    expect((await sync(await syncRequest({ profileId: 'nope', fields: fieldsJson }, { guest: true }))).status).toBe(400);
  });

  it('sync: demo users cannot replace rows and cannot choose a spreadsheet', async () => {
    expect((await sync(await syncRequest({ profileId: 'ngo-receipt', fields: fieldsJson, duplicateAction: 'replace' }, { guest: true }))).status).toBe(403);

    syncDocument.mockResolvedValue({ destinations: { sheets: okOutcome({ spreadsheetId: 'D' }), notion: okOutcome({}), media: okOutcome({}) }, imageLink: null, warnings: [] });
    await sync(await syncRequest({ profileId: 'ngo-receipt', fields: fieldsJson, spreadsheetId: 'victimSheet_123' }, { guest: true }));
    expect(syncDocument.mock.calls[0][0].spreadsheetId).toBeNull();
    expect(syncDocument.mock.calls[0][0].caller).toEqual({ isGuest: true });
  });

  it('sync maps a duplicate to 409', async () => {
    getToken.mockResolvedValue({ email: 'u@x', accessToken: 't' });
    syncDocument.mockResolvedValue({ duplicate: { count: 2, label: 'Receipt', value: 'R1' }, destinations: {}, imageLink: null, warnings: [] });
    const res = await sync(await syncRequest({ profileId: 'ngo-receipt', fields: fieldsJson }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ isDuplicateConflict: true, duplicateCount: 2, primaryKeyLabel: 'Receipt', primaryKeyValue: 'R1' });
  });

  it('sync reports a partial success as 200 with per-destination detail', async () => {
    getToken.mockResolvedValue({ email: 'u@x', accessToken: 't' });
    syncDocument.mockResolvedValue({
      destinations: {
        sheets: okOutcome({ spreadsheetId: 'S', spreadsheetUrl: 'https://sheet' }),
        notion: { status: 'failed', error: 'Notion 502', ms: 1 },
        media: { status: 'skipped', reason: 'nothing to store' },
      },
      imageLink: null,
      warnings: ['w'],
    });
    const res = await sync(await syncRequest({ profileId: 'ngo-receipt', data: JSON.stringify({ donorName: 'Asha' }) }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ success: false, partial: true, spreadsheetUrl: 'https://sheet', warnings: ['w'] });
    expect(body.destinations.notion).toEqual({ status: 'failed', detail: 'Notion 502' });
    expect(body.errors[0]).toMatch(/Notion sync failed/);
    // legacy `data` payload still accepted
    expect(syncDocument.mock.calls[0][0].fields).toEqual([{ key: 'donorName', label: 'donorName', value: 'Asha' }]);
  });

  it('sync returns 502 only when every attempted destination failed', async () => {
    getToken.mockResolvedValue({ email: 'u@x', accessToken: 't' });
    syncDocument.mockResolvedValue({
      destinations: {
        sheets: { status: 'failed', error: 'x', ms: 1 },
        notion: { status: 'skipped', reason: 'not connected' },
        media: { status: 'failed', error: 'y', ms: 1 },
      },
      imageLink: null,
      warnings: [],
    });
    expect((await sync(await syncRequest({ profileId: 'ngo-receipt', fields: fieldsJson }))).status).toBe(502);
  });
});
