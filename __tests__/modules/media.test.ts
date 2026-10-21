const driveApi = { files: { list: jest.fn(), create: jest.fn() } };
jest.mock('googleapis', () => {
  class OAuth2 { setCredentials = jest.fn(); }
  class JWT {}
  return { google: { auth: { OAuth2, JWT }, drive: jest.fn(() => driveApi) } };
});

import sharp from 'sharp';
import { mediaHealth, prepareArchiveImage, storeMedia } from '@/modules/media';

describe('modules/media', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...saved };
    delete process.env.DEMO_PUBLIC_MEDIA_UPLOAD;
    global.fetch = jest.fn();
    driveApi.files.list.mockResolvedValue({ data: { files: [{ id: 'folder' }] } });
  });
  afterAll(() => { process.env = saved; });

  it('demo uploads are off by default: nothing leaves the server', async () => {
    const res = await storeMedia({ isGuest: true, profileId: 'ngo-receipt', image: Buffer.from('i'), audio: Buffer.from('a') });
    expect(res).toMatchObject({ imageUrl: null, audioUrl: null });
    expect(res.notes[0]).toMatch(/not stored/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('demo uploads go to Catbox only when explicitly enabled', async () => {
    process.env.DEMO_PUBLIC_MEDIA_UPLOAD = 'true';
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, text: async () => 'https://files.catbox.moe/abc.webp\n' });
    const res = await storeMedia({ isGuest: true, profileId: 'ngo-receipt', image: Buffer.from('i') });
    expect(res.imageUrl).toBe('https://files.catbox.moe/abc.webp');
    expect(mediaHealth().demoPublicUploads).toBe(true);
  });

  it('signed-in users upload privately to their Drive; one failed file does not block the other', async () => {
    driveApi.files.create
      .mockResolvedValueOnce({ data: { id: 'img', webViewLink: 'https://drive/img' } })
      .mockRejectedValueOnce(new Error('quota'));
    const res = await storeMedia({ accessToken: 't', isGuest: false, profileId: 'p', image: Buffer.from('i'), audio: Buffer.from('a') });
    expect(res.imageUrl).toBe('https://drive/img');
    expect(res.audioUrl).toBeNull();
    expect(res.notes[0]).toMatch(/Voice note upload failed/);
  });

  it('throws when every attempted upload failed (so the orchestrator reports it)', async () => {
    driveApi.files.create.mockRejectedValue(new Error('drive down'));
    await expect(storeMedia({ accessToken: 't', isGuest: false, profileId: 'p', image: Buffer.from('i') })).rejects.toThrow('drive down');
  });

  it('expired Google session: explains instead of uploading anywhere', async () => {
    const res = await storeMedia({ isGuest: false, profileId: 'p', image: Buffer.from('i') });
    expect(res.notes[0]).toMatch(/session has expired/);
    expect(driveApi.files.create).not.toHaveBeenCalled();
  });

  it('no media → nothing to do', async () => {
    await expect(storeMedia({ isGuest: false, profileId: 'p' })).resolves.toEqual({ imageUrl: null, audioUrl: null, notes: [] });
  });

  it('prepareArchiveImage produces a WebP', async () => {
    const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#000' } }).png().toBuffer();
    const out = await prepareArchiveImage(png);
    expect((await sharp(out).metadata()).format).toBe('webp');
  });
});
