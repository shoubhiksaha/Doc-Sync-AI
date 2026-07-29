import { uploadToGDrive } from '../../lib/gdrive';
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
    // 1. list folder (returns empty)
    (mDrive.files.list as jest.Mock).mockResolvedValueOnce({
      data: { files: [] },
    });
    // 2. create folder
    (mDrive.files.create as jest.Mock).mockResolvedValueOnce({
      data: { id: 'new-folder-id' },
    });
    // 3. create file
    (mDrive.files.create as jest.Mock).mockResolvedValueOnce({
      data: { id: 'file-id', webViewLink: 'https://example.com/view' },
    });

    const result = await uploadToGDrive('token', mockBuffer, 'test.webp');
    expect(result).toBe('https://example.com/view');
    expect(mDrive.files.list).toHaveBeenCalledTimes(1);
    expect(mDrive.files.create).toHaveBeenCalledTimes(2);
  });

  it('should use existing folder if exists and upload file', async () => {
    // 1. list folder (returns existing)
    (mDrive.files.list as jest.Mock).mockResolvedValueOnce({
      data: { files: [{ id: 'existing-folder-id', name: 'DocSync Media' }] },
    });
    // 2. create file
    (mDrive.files.create as jest.Mock).mockResolvedValueOnce({
      data: { id: 'file-id', webViewLink: 'https://example.com/existing-view' },
    });

    const result = await uploadToGDrive('token', mockBuffer, 'test.webp');
    expect(result).toBe('https://example.com/existing-view');
    expect(mDrive.files.list).toHaveBeenCalledTimes(1);
    expect(mDrive.files.create).toHaveBeenCalledTimes(1);
  });

  it('should handle missing webViewLink', async () => {
    (mDrive.files.list as jest.Mock).mockResolvedValueOnce({
      data: { files: [{ id: 'folder-id' }] },
    });
    (mDrive.files.create as jest.Mock).mockResolvedValueOnce({
      data: { id: 'file-id' },
    });

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
});
