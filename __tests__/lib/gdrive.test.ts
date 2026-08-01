import { uploadToGDrive, getGoogleAuth, makeFilePublic } from '../../lib/gdrive';
import { google } from 'googleapis';

jest.mock('googleapis', () => {
  const mDrive = {
    files: {
      list: jest.fn(),
      create: jest.fn(),
    },
  };
  return {
    google: {
      auth: {
        OAuth2: jest.fn().mockImplementation(() => ({
          setCredentials: jest.fn(),
        })),
        JWT: jest.fn().mockImplementation(() => ({
          authorize: jest.fn(),
        })),
      },
      drive: jest.fn(() => mDrive),
    },
  };
});

describe('gdrive', () => {
  let mDrive: any;
  const mockBuffer = Buffer.from('test');

  beforeEach(() => {
    mDrive = google.drive({ version: 'v3', auth: {} as any });
    (mDrive.files.list as jest.Mock).mockReset();
    (mDrive.files.create as jest.Mock).mockReset();
  });

  it('should create folder if not exists and upload file', async () => {
    // 1. list root folder (returns empty)
    (mDrive.files.list as jest.Mock).mockResolvedValueOnce({ data: { files: [] } });
    // 2. create root folder
    (mDrive.files.create as jest.Mock).mockResolvedValueOnce({ data: { id: 'new-root-id' } });
    // 3. list media folder (returns empty)
    (mDrive.files.list as jest.Mock).mockResolvedValueOnce({ data: { files: [] } });
    // 4. create media folder
    (mDrive.files.create as jest.Mock).mockResolvedValueOnce({ data: { id: 'new-media-id' } });
    // 5. create file
    (mDrive.files.create as jest.Mock).mockResolvedValueOnce({ data: { id: 'file-id', webViewLink: 'https://example.com/view' } });

    const result = await uploadToGDrive('token', mockBuffer, 'test.webp');
    expect(result).toBe('https://example.com/view');
    expect(mDrive.files.list).toHaveBeenCalledTimes(2);
    expect(mDrive.files.create).toHaveBeenCalledTimes(3);
  });

  it('should use existing folder if exists and upload file', async () => {
    // 1. list root folder (returns existing)
    (mDrive.files.list as jest.Mock).mockResolvedValueOnce({ data: { files: [{ id: 'existing-root-id', name: 'DocSync AI' }] } });
    // 2. list media folder (returns existing)
    (mDrive.files.list as jest.Mock).mockResolvedValueOnce({ data: { files: [{ id: 'existing-media-id', name: 'DocSync AI Media' }] } });
    // 3. create file
    (mDrive.files.create as jest.Mock).mockResolvedValueOnce({ data: { id: 'file-id', webViewLink: 'https://example.com/existing-view' } });

    const result = await uploadToGDrive('token', mockBuffer, 'test.webp');
    expect(result).toBe('https://example.com/existing-view');
    expect(mDrive.files.list).toHaveBeenCalledTimes(2);
    expect(mDrive.files.create).toHaveBeenCalledTimes(1);
  });

  it('should handle missing webViewLink', async () => {
    (mDrive.files.list as jest.Mock).mockResolvedValueOnce({ data: { files: [{ id: 'fid' }] } });
    (mDrive.files.list as jest.Mock).mockResolvedValueOnce({ data: { files: [{ id: 'fid2' }] } });
    (mDrive.files.create as jest.Mock).mockResolvedValueOnce({ data: { id: 'file-id' } });

    const result = await uploadToGDrive('token', mockBuffer, 'test.webp');
    expect(result).toBeNull();
  });

  it('should handle errors', async () => {
    (mDrive.files.list as jest.Mock).mockRejectedValueOnce(new Error('Network error'));
    
    // Silence console.error for this test
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    const result = await uploadToGDrive('token', mockBuffer, 'test.webp');
    expect(result).toBeNull();
    
    consoleSpy.mockRestore();
  });

  it('uploads to gdrive, creates folders, and makes public if no accessToken', async () => {
    (google.auth.OAuth2 as unknown as jest.Mock).mockImplementation(() => ({
      setCredentials: jest.fn(),
    }));
    const mockDrive = {
      files: {
        list: jest.fn()
          .mockResolvedValueOnce({ data: { files: [] } })
          .mockResolvedValueOnce({ data: { files: [] } }),
        create: jest.fn()
          .mockResolvedValueOnce({ data: { id: 'root-id' } })
          .mockResolvedValueOnce({ data: { id: 'media-id' } })
          .mockResolvedValueOnce({ data: { id: 'file-id', webViewLink: 'link' } }),
      },
      permissions: {
        create: jest.fn().mockResolvedValue({}),
      }
    };
    (google.drive as unknown as jest.Mock).mockReturnValue(mockDrive);

    const originalEnv = process.env;
    process.env = { ...originalEnv, GOOGLE_SERVICE_ACCOUNT_EMAIL: 'test@example.com', GOOGLE_PRIVATE_KEY: '"fake-key"' };

    const buffer = Buffer.from('test');
    // Call without accessToken
    const result = await uploadToGDrive(null, buffer, 'test.png', 'image/png');
    
    process.env = originalEnv;
    expect(result).toBe('link');
    
    // permissions.create should be called because no accessToken
    expect(mockDrive.permissions.create).toHaveBeenCalledWith({
      fileId: 'file-id',
      requestBody: { role: 'reader', type: 'anyone' },
    });
  });

  describe('getGoogleAuth', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('returns null if no token and no service account env vars', () => {
      delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
      delete process.env.GOOGLE_PRIVATE_KEY;
      expect(getGoogleAuth()).toBeNull();
    });

    it('returns JWT auth if service account env vars exist', () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'test@test.com';
      process.env.GOOGLE_PRIVATE_KEY = '"test-key\\nline2"';
      const auth = getGoogleAuth();
      expect(auth).toBeDefined();
      expect(google.auth.JWT).toHaveBeenCalledWith({
        email: 'test@test.com',
        key: 'test-key\nline2',
        scopes: expect.any(Array),
      });
    });
  });

  describe('makeFilePublic error handling', () => {
    it('catches and logs errors', async () => {
      const mockDrive = {
        permissions: {
          create: jest.fn().mockRejectedValue(new Error('Permission error')),
        }
      };
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      await makeFilePublic(mockDrive as any, 'file-123');
      expect(consoleSpy).toHaveBeenCalledWith('Failed to make file file-123 public', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });
});
