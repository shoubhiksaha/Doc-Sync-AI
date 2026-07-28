// eslint-disable-next-line @typescript-eslint/no-require-imports
const { uploadToNotion } = require('notion-multipart-uploader');

/**
 * Uploads a WebP buffer to Notion File Uploads using notion-multipart-uploader.
 * Returns the Notion file_upload ID (used to attach image to a Notion page).
 * Returns null if upload fails (non-fatal).
 */
export async function uploadArchiveToNotion(
  buffer: Buffer,
  filename: string,
  notionToken: string
): Promise<string | null> {
  try {
    const fileId: string = await uploadToNotion(
      notionToken,
      buffer,
      'image/webp',
      filename,
      { retries: 2, timeoutMs: 30000, concurrency: 1 }
    );
    return fileId || null;
  } catch (err) {
    console.error('Notion archive upload failed (non-fatal):', err);
    return null;
  }
}
