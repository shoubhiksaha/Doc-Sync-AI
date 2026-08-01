import { saveMediaLocallyForDemo } from '../../lib/demo-storage';

// Store original fetch
const originalFetch = global.fetch;

describe('demo-storage', () => {
  beforeEach(() => {
    // Reset mocks before each test
    global.fetch = jest.fn();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore original fetch
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('returns nulls if buffers are null', async () => {
    const result = await saveMediaLocallyForDemo(null, null, 'profile-123');
    expect(result).toEqual({ imageUrl: null, audioUrl: null });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('uploads archiveBuffer and returns imageUrl', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      text: async () => 'https://catbox.moe/mock-image.webp',
    });

    const archiveBuffer = Buffer.from('fake-image-data');
    const result = await saveMediaLocallyForDemo(archiveBuffer, null, 'profile-123');
    
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result.imageUrl).toBe('https://catbox.moe/mock-image.webp');
    expect(result.audioUrl).toBeNull();
  });

  it('uploads audioBuffer and returns audioUrl', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      text: async () => 'https://catbox.moe/mock-audio.webm',
    });

    const audioBuffer = Buffer.from('fake-audio-data');
    const result = await saveMediaLocallyForDemo(null, audioBuffer, 'profile-123');
    
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result.imageUrl).toBeNull();
    expect(result.audioUrl).toBe('https://catbox.moe/mock-audio.webm');
  });

  it('uploads both buffers and returns both urls', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        text: async () => 'https://catbox.moe/mock-image.webp',
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => 'https://catbox.moe/mock-audio.webm',
      });

    const archiveBuffer = Buffer.from('fake-image');
    const audioBuffer = Buffer.from('fake-audio');
    
    const result = await saveMediaLocallyForDemo(archiveBuffer, audioBuffer, 'profile-123');
    
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result.imageUrl).toBe('https://catbox.moe/mock-image.webp');
    expect(result.audioUrl).toBe('https://catbox.moe/mock-audio.webm');
  });

  it('returns null if fetch fails (not ok)', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      statusText: 'Forbidden',
    });

    const archiveBuffer = Buffer.from('fake-image');
    const result = await saveMediaLocallyForDemo(archiveBuffer, null, 'profile-123');
    
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result.imageUrl).toBeNull();
    expect(console.error).toHaveBeenCalledWith('Catbox upload failed:', 'Forbidden');
  });

  it('returns null if fetch throws', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

    const archiveBuffer = Buffer.from('fake-image');
    const result = await saveMediaLocallyForDemo(archiveBuffer, null, 'profile-123');
    
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result.imageUrl).toBeNull();
    expect(console.error).toHaveBeenCalledWith('Error uploading to Catbox:', expect.any(Error));
  });
});
