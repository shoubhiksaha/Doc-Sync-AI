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
import { encrypt } from '@/core/crypto';
import { createGuestToken } from '@/core/guest';

const SECRET = 'route-secret';

async function syncRequest(fields: Record<string, string>, opts: { guest?: boolean; cookie?: string } = {}) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const headers: Record<string, string> = {};
  if (opts.guest) headers.cookie = `docsync_guest=${await createGuestToken(SECRET)}`;
  if (opts.cookie) headers.cookie = opts.cookie;
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

  it('sync reports media as "not stored" when it succeeded without uploading anything (demo)', async () => {
    syncDocument.mockResolvedValue({
      destinations: {
        sheets: okOutcome({ spreadsheetId: 'D' }),
        notion: okOutcome({}),
        media: okOutcome({ imageUrl: null, audioUrl: null, notes: ['Demo mode: not stored'] }),
      },
      imageLink: null,
      warnings: [],
    });
    const body = await (await sync(await syncRequest({ profileId: 'ngo-receipt', fields: fieldsJson }, { guest: true }))).json();
    expect(body.destinations.media).toEqual({ status: 'skipped', code: 'not_stored' });
    expect(body.destinations.sheets).toEqual({ status: 'success', code: 'saved' });

    syncDocument.mockResolvedValue({
      destinations: { sheets: okOutcome({ spreadsheetId: 'D' }), notion: okOutcome({}), media: okOutcome({ imageUrl: 'https://drive/x', audioUrl: null, notes: [] }) },
      imageLink: 'https://drive/x',
      warnings: [],
    });
    const stored = await (await sync(await syncRequest({ profileId: 'ngo-receipt', fields: fieldsJson }, { guest: true }))).json();
    expect(stored.destinations.media).toEqual({ status: 'success', code: 'saved' });
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
    expect(body.destinations.notion).toEqual({ status: 'failed', code: 'failed', detail: 'Notion 502' });
    expect(body.destinations.media).toEqual({ status: 'skipped', code: 'skipped', detail: 'nothing to store' });
    expect(body.destinations.sheets).toEqual({ status: 'success', code: 'saved' });
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

  it('sync: uses the remembered sheet, remembers a new one, and defaults the duplicate check to the profile', async () => {
    getToken.mockResolvedValue({ email: 'u@x', accessToken: 't' });
    syncDocument.mockResolvedValue({
      destinations: {
        sheets: okOutcome({ spreadsheetId: 'NEW', spreadsheetUrl: 'https://sheet/NEW' }),
        notion: { status: 'skipped', reason: 'Notion not connected', code: 'not_connected' },
        media: okOutcome({}),
      },
      imageLink: null,
      warnings: [],
    });
    const res = await sync(await syncRequest({ profileId: 'ngo-receipt', fields: fieldsJson }, { cookie: 'docsync_sheet_ngo_receipt=OLD' }));
    const input = syncDocument.mock.calls[0][0];
    expect(input.spreadsheetId).toBe('OLD');
    expect(input.primaryKey).toBe('receiptNumber');
    expect(input.only).toBeUndefined();
    const body = await res.json();
    expect(body).toMatchObject({ success: true, spreadsheetId: 'NEW', mock: false });
    expect(body.destinations.notion).toEqual({ status: 'skipped', code: 'not_connected', detail: 'Notion not connected' });
    expect(res.cookies.get('docsync_sheet_ngo_receipt')?.value).toBe('NEW');

    // an explicit spreadsheetId wins over the cookie; demo/mock results set no cookie
    syncDocument.mockResolvedValue({ destinations: { sheets: okOutcome({ spreadsheetId: null, mock: true }), notion: okOutcome({}), media: okOutcome({}) }, imageLink: null, warnings: [] });
    const mockRes = await sync(await syncRequest({ profileId: 'ngo-receipt', fields: fieldsJson, spreadsheetId: 'FORM' }, { cookie: 'docsync_sheet_ngo_receipt=OLD' }));
    expect(syncDocument.mock.calls[1][0].spreadsheetId).toBe('FORM');
    expect(await mockRes.json()).toMatchObject({ mock: true, spreadsheetId: null });
    expect(mockRes.cookies.get('docsync_sheet_ngo_receipt')).toBeUndefined();
  });

  it('sync: `only` retries the listed destinations and ignores unknown names', async () => {
    getToken.mockResolvedValue({ email: 'u@x', accessToken: 't' });
    syncDocument.mockResolvedValue({ destinations: { sheets: okOutcome({}), notion: okOutcome({}), media: okOutcome({}) }, imageLink: null, warnings: [] });
    await sync(await syncRequest({ profileId: 'ngo-receipt', fields: fieldsJson, only: 'notion, bogus,media,notion' }));
    expect(syncDocument.mock.calls[0][0].only).toEqual(['notion', 'media']);
    await sync(await syncRequest({ profileId: 'ngo-receipt', fields: fieldsJson, only: 'bogus' }));
    expect(syncDocument.mock.calls[1][0].only).toBeUndefined();
  });

  it('sync: guests never get a sheet from the cookie', async () => {
    syncDocument.mockResolvedValue({ destinations: { sheets: okOutcome({ spreadsheetId: 'D' }), notion: okOutcome({}), media: okOutcome({}) }, imageLink: null, warnings: [] });
    const cookie = `docsync_guest=${await createGuestToken(SECRET)}; docsync_sheet_ngo_receipt=victim`;
    const res = await sync(await syncRequest({ profileId: 'ngo-receipt', fields: fieldsJson }, { cookie }));
    expect(syncDocument.mock.calls[0][0].spreadsheetId).toBeNull();
    expect(res.cookies.get('docsync_sheet_ngo_receipt')).toBeUndefined();
  });

  it("sync: a saved primaryKey '' turns the duplicate check off; a chosen field overrides the default", async () => {
    process.env.ENCRYPTION_KEY = 'e'.repeat(64);
    getToken.mockResolvedValue({ email: 'u@x', accessToken: 't' });
    syncDocument.mockResolvedValue({ destinations: { sheets: okOutcome({}), notion: okOutcome({}), media: okOutcome({}) }, imageLink: null, warnings: [] });
    const prefs = (primaryKey: string) => `docsync_prefs=${encrypt(JSON.stringify({ 'ngo-receipt': { fields: null, primaryKey } }))}`;

    await sync(await syncRequest({ profileId: 'ngo-receipt', fields: fieldsJson }, { cookie: prefs('') }));
    expect(syncDocument.mock.calls[0][0].primaryKey).toBe('');
    await sync(await syncRequest({ profileId: 'ngo-receipt', fields: fieldsJson }, { cookie: prefs('donorName') }));
    expect(syncDocument.mock.calls[1][0].primaryKey).toBe('donorName');
  });
});
