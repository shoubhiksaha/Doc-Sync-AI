const getToken = jest.fn();
jest.mock('next-auth/jwt', () => ({ getToken: (...a: unknown[]) => getToken(...a) }));

const docRef = { get: jest.fn(), set: jest.fn(), delete: jest.fn() };
const db = { collection: jest.fn(() => ({ doc: jest.fn(() => docRef) })) };
let dbAvailable = true;
jest.mock('@/modules/settings/firestore', () => ({
  getDb: () => (dbAvailable ? db : null),
  firestoreConfigured: () => dbAvailable,
}));

import { NextRequest, NextResponse } from 'next/server';
import { encrypt } from '@/core/crypto';
import { generateAndWrapDEK } from '@/core/envelope';
import { loadSettings, parseUploadDest, saveSettings, settingsHealth, settingsStatus } from '@/modules/settings';

function req(cookies: Record<string, string> = {}) {
  const cookie = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  return new NextRequest('http://localhost/api/settings', { headers: cookie ? { cookie } : {} });
}

describe('modules/settings', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...saved, ENCRYPTION_KEY: 'c'.repeat(64) };
    dbAvailable = true;
    getToken.mockResolvedValue({ email: 'u@example.com' });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterAll(() => { process.env = saved; });

  it('reads everything from cookies without touching Firestore', async () => {
    const r = req({ docsync_openai: encrypt('sk-a'), docsync_notion: encrypt('n'), docsync_notion_db: encrypt('d'), docsync_upload_dest: 'gdrive' });
    await expect(loadSettings(r)).resolves.toEqual({ openaiKey: 'sk-a', notionKey: 'n', notionDbId: 'd', uploadDest: 'gdrive' });
    expect(db.collection).not.toHaveBeenCalled();
  });

  it('fills missing values from Firestore (envelope-encrypted)', async () => {
    docRef.get.mockResolvedValue({ exists: true, data: () => ({ notionKey: generateAndWrapDEK('n-fs'), uploadDest: 'notion' }) });
    const s = await loadSettings(req({ docsync_openai: encrypt('sk-a') }));
    expect(s).toEqual({ openaiKey: 'sk-a', notionKey: 'n-fs', notionDbId: undefined, uploadDest: 'notion' });
  });

  it('degrades to cookie-only settings when Firestore fails or holds bad data', async () => {
    docRef.get.mockRejectedValue(new Error('firestore down'));
    await expect(loadSettings(req())).resolves.toMatchObject({ uploadDest: 'both' });
    docRef.get.mockResolvedValue({ exists: true, data: () => ({ openaiKey: { junk: true } }) });
    await expect(loadSettings(req())).resolves.toMatchObject({ openaiKey: undefined });
    dbAvailable = false;
    await expect(loadSettings(req())).resolves.toMatchObject({ uploadDest: 'both' });
  });

  it('saves encrypted cookies and mirrors to Firestore in persistent mode', async () => {
    const res = NextResponse.json({});
    const out = await saveSettings(req(), res, { openaiKey: ' sk-new ', notionKey: '', uploadDest: 'weird', persistent: true });
    expect(out.persisted).toBe(true);
    expect(res.cookies.get('docsync_openai')?.value).toMatch(/^v2\./);
    expect(res.cookies.get('docsync_openai')?.httpOnly).toBe(true);
    expect(res.cookies.get('docsync_upload_dest')?.value).toBe('both');
    const written = docRef.set.mock.calls[0][0];
    expect(written.openaiKey.encryptedKey).toBeDefined();
    expect(written.notionKey).toBeNull();
  });

  it('turning persistence off deletes the Firestore copy', async () => {
    await saveSettings(req(), NextResponse.json({}), { persistent: false });
    expect(docRef.delete).toHaveBeenCalled();
  });

  it('reports a failed cloud write without failing the save', async () => {
    docRef.set.mockRejectedValue(new Error('denied'));
    const res = NextResponse.json({});
    await expect(saveSettings(req(), res, { openaiKey: 'k', persistent: true })).resolves.toEqual({ persisted: 'failed' });
    expect(res.cookies.get('docsync_openai')).toBeDefined();
  });

  it('settingsStatus merges cookie flags with Firestore', async () => {
    docRef.get.mockResolvedValue({ exists: true, data: () => ({ notionKey: {}, uploadDest: 'gdrive' }) });
    await expect(settingsStatus(req({ docsync_openai: 'x' }))).resolves.toEqual({
      hasOpenAiKey: true, hasNotionKey: true, hasNotionDbId: false, uploadDest: 'gdrive', isPersistent: true,
    });
  });

  it('parseUploadDest and health', () => {
    expect(parseUploadDest('notion')).toBe('notion');
    expect(parseUploadDest(undefined)).toBe('both');
    expect(settingsHealth()).toMatchObject({ enabled: true, configured: true, persistent: true });
  });
});
