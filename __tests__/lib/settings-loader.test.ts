import { NextRequest } from 'next/server';
import { loadSettings } from '../../lib/settings-loader';
import * as cryptoHelper from '../../lib/crypto';
import * as securityHelper from '../../lib/security';
import { getToken } from 'next-auth/jwt';

// Mock dependencies
jest.mock('next-auth/jwt', () => ({
  getToken: jest.fn(),
}));

jest.mock('../../lib/crypto', () => ({
  getDecryptedCookie: jest.fn(),
}));

jest.mock('../../lib/security', () => ({
  unwrapAndDecryptDEK: jest.fn(),
}));

// We need to mock the db from firebase-admin but since it's tricky, we'll mock the whole module
const mockGet = jest.fn();
jest.mock('../../lib/firebase-admin', () => ({
  db: {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: mockGet,
      })),
    })),
  },
}));

describe('loadSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should load settings from cookies (Stateless Mode) if they exist', async () => {
    (cryptoHelper.getDecryptedCookie as jest.Mock).mockImplementation((req, name) => {
      if (name === 'docsync_openai') return 'openai-cookie';
      if (name === 'docsync_notion') return 'notion-cookie';
      if (name === 'docsync_notion_db') return 'db-cookie';
    });

    const mockReq = {
      cookies: {
        get: jest.fn().mockReturnValue({ value: 'gdrive' }),
      },
    } as unknown as NextRequest;

    const settings = await loadSettings(mockReq);

    expect(settings.openaiKey).toBe('openai-cookie');
    expect(settings.notionKey).toBe('notion-cookie');
    expect(settings.notionDbId).toBe('db-cookie');
    expect(settings.uploadDest).toBe('gdrive');
    
    // Should NOT call getToken or db if all keys are present
    expect(getToken).not.toHaveBeenCalled();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('should fallback to Firestore if keys are missing from cookies', async () => {
    (cryptoHelper.getDecryptedCookie as jest.Mock).mockReturnValue(undefined);
    
    const mockReq = {
      cookies: {
        get: jest.fn().mockReturnValue({ value: 'both' }),
      },
    } as unknown as NextRequest;

    (getToken as jest.Mock).mockResolvedValue({ email: 'test@example.com' });

    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({
        openaiKey: { wrappedDEK: '...', ciphertext: '...', iv: '...', authTag: '...' },
        notionKey: { wrappedDEK: '...', ciphertext: '...', iv: '...', authTag: '...' },
        notionDbId: { wrappedDEK: '...', ciphertext: '...', iv: '...', authTag: '...' },
        uploadDest: 'notion'
      }),
    });

    (securityHelper.unwrapAndDecryptDEK as jest.Mock).mockImplementation((payload) => {
      return 'unwrapped-key';
    });

    const settings = await loadSettings(mockReq);

    expect(getToken).toHaveBeenCalled();
    expect(mockGet).toHaveBeenCalled();
    expect(settings.openaiKey).toBe('unwrapped-key');
    expect(settings.notionKey).toBe('unwrapped-key');
    expect(settings.notionDbId).toBe('unwrapped-key');
    expect(settings.uploadDest).toBe('notion');
  });

  it('should return defaults if neither cookies nor firestore has keys', async () => {
    (cryptoHelper.getDecryptedCookie as jest.Mock).mockReturnValue(undefined);
    
    const mockReq = {
      cookies: {
        get: jest.fn().mockReturnValue(undefined), // No uploadDest cookie either
      },
    } as unknown as NextRequest;

    (getToken as jest.Mock).mockResolvedValue({ email: 'test@example.com' });

    mockGet.mockResolvedValue({
      exists: false,
    });

    const settings = await loadSettings(mockReq);

    expect(settings.openaiKey).toBeUndefined();
    expect(settings.notionKey).toBeUndefined();
    expect(settings.notionDbId).toBeUndefined();
    expect(settings.uploadDest).toBe('both');
  });

  it('should catch and log errors if Firestore fails', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (cryptoHelper.getDecryptedCookie as jest.Mock).mockReturnValue(undefined);
    
    const mockReq = {
      cookies: {
        get: jest.fn().mockReturnValue(undefined),
      },
    } as unknown as NextRequest;

    (getToken as jest.Mock).mockResolvedValue({ email: 'test@example.com' });

    mockGet.mockRejectedValue(new Error('Firestore down'));

    const settings = await loadSettings(mockReq);

    expect(consoleSpy).toHaveBeenCalledWith('Failed to load persistent settings from Firestore', expect.any(Error));
    expect(settings.openaiKey).toBeUndefined();
    
    consoleSpy.mockRestore();
  });

  it('should skip firestore lookup if token has no email', async () => {
    (cryptoHelper.getDecryptedCookie as jest.Mock).mockReturnValue(undefined);
    
    const mockReq = {
      cookies: {
        get: jest.fn().mockReturnValue(undefined),
      },
    } as unknown as NextRequest;

    (getToken as jest.Mock).mockResolvedValue({}); // No email

    const settings = await loadSettings(mockReq);

    expect(mockGet).not.toHaveBeenCalled();
    expect(settings.openaiKey).toBeUndefined();
  });

  it('should only update keys that exist in firestore', async () => {
    (cryptoHelper.getDecryptedCookie as jest.Mock).mockReturnValue(undefined);
    
    const mockReq = {
      cookies: {
        get: jest.fn().mockReturnValue(undefined),
      },
    } as unknown as NextRequest;

    (getToken as jest.Mock).mockResolvedValue({ email: 'test@example.com' });

    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({
        openaiKey: { wrappedDEK: '...', ciphertext: '...', iv: '...', authTag: '...' },
        // notionKey and notionDbId and uploadDest missing
      }),
    });

    (securityHelper.unwrapAndDecryptDEK as jest.Mock).mockImplementation((payload) => 'unwrapped-openai');

    const settings = await loadSettings(mockReq);

    expect(settings.openaiKey).toBe('unwrapped-openai');
    expect(settings.notionKey).toBeUndefined();
    expect(settings.notionDbId).toBeUndefined();
    expect(settings.uploadDest).toBe('both');
  });

  it('should handle doc existing but data being undefined', async () => {
    (cryptoHelper.getDecryptedCookie as jest.Mock).mockReturnValue(undefined);
    
    const mockReq = { cookies: { get: jest.fn().mockReturnValue(undefined) } } as unknown as NextRequest;
    (getToken as jest.Mock).mockResolvedValue({ email: 'test@example.com' });

    mockGet.mockResolvedValue({
      exists: true,
      data: () => undefined,
    });

    const settings = await loadSettings(mockReq);
    expect(settings.openaiKey).toBeUndefined();
  });

  it('should handle data missing openaiKey', async () => {
    (cryptoHelper.getDecryptedCookie as jest.Mock).mockReturnValue(undefined);
    
    const mockReq = { cookies: { get: jest.fn().mockReturnValue(undefined) } } as unknown as NextRequest;
    (getToken as jest.Mock).mockResolvedValue({ email: 'test@example.com' });

    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({
        notionKey: { wrappedDEK: '...', ciphertext: '...', iv: '...', authTag: '...' }
      }),
    });

    (securityHelper.unwrapAndDecryptDEK as jest.Mock).mockImplementation(() => 'unwrapped-notion');

    const settings = await loadSettings(mockReq);
    expect(settings.openaiKey).toBeUndefined();
    expect(settings.notionKey).toBe('unwrapped-notion');
  });
});
