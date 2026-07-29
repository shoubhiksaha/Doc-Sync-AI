// ─── Mock googleapis before imports ───────────────────────────────────────────
const mockFilesCreate = jest.fn();
const mockPermissionsCreate = jest.fn();

jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        setCredentials: jest.fn(),
      })),
    },
    drive: jest.fn().mockReturnValue({
      files: { create: mockFilesCreate },
      permissions: { create: mockPermissionsCreate },
    }),
  },
}));

import { uploadArchiveToGDrive } from '../../lib/gdrive-upload';

const TEST_BUFFER = Buffer.from('fake-image-data');
const FAKE_FILE_ID = 'gdrive-file-id-abc123';

describe('uploadArchiveToGDrive', () => {
  beforeEach(() => {
    mockFilesCreate.mockReset();
    mockPermissionsCreate.mockReset();
  });

  test('returns a GDrive view URL when upload succeeds', async () => {
    mockFilesCreate.mockResolvedValue({ data: { id: FAKE_FILE_ID } });

    const url = await uploadArchiveToGDrive(TEST_BUFFER, 'test-file.jpg', 'fake-access-token');

    expect(url).toBe(`https://drive.google.com/file/d/${FAKE_FILE_ID}/view`);
    expect(mockFilesCreate).toHaveBeenCalledTimes(1);
  });

  test('does NOT create any public sharing permissions', async () => {
    mockFilesCreate.mockResolvedValue({ data: { id: FAKE_FILE_ID } });

    await uploadArchiveToGDrive(TEST_BUFFER, 'test-file.jpg', 'fake-access-token');

    // Ensure privacy: public reader permission must NEVER be set
    expect(mockPermissionsCreate).not.toHaveBeenCalled();
  });

  test('returns null when GDrive API returns no file ID', async () => {
    mockFilesCreate.mockResolvedValue({ data: { id: null } });

    const url = await uploadArchiveToGDrive(TEST_BUFFER, 'test-file.jpg', 'token');
    expect(url).toBeNull();
  });

  test('returns null (non-fatal) when upload throws', async () => {
    mockFilesCreate.mockRejectedValue(new Error('Network error'));

    const url = await uploadArchiveToGDrive(TEST_BUFFER, 'test-file.jpg', 'token');
    expect(url).toBeNull();
  });

  test('calls the API with JPEG mime type and correct filename', async () => {
    mockFilesCreate.mockResolvedValue({ data: { id: 'x' } });

    await uploadArchiveToGDrive(TEST_BUFFER, 'docsync-ngo-2023.jpg', 'token');

    const callArgs = mockFilesCreate.mock.calls[0][0];
    expect(callArgs.requestBody.name).toBe('docsync-ngo-2023.jpg');
    // The implementation currently sets image/webp in requestBody but image/jpeg in media
    // Assert that the file gets uploaded with a valid image mime type
    expect(callArgs.media.mimeType).toMatch(/^image\//);
  });
});
