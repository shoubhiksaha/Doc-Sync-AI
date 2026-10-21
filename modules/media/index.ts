/**
 * Media module — archives the scanned image and voice note.
 *
 * Signed-in users: private files in their own Google Drive ("DocSync AI/DocSync AI Media").
 * Demo users: nothing is uploaded unless DEMO_PUBLIC_MEDIA_UPLOAD=true, in which case files go to
 * Catbox.moe, a public anonymous host. Off by default because receipts carry personal data
 * (names, PAN numbers) and Catbox links are public and permanent.
 *
 * Image and audio uploads are independent: one failing doesn't stop the other.
 */
import { Readable } from 'stream';
import sharp from 'sharp';
import { google } from 'googleapis';
import { env, isModuleEnabled } from '@/core/env';
import { circuitState } from '@/core/isolation';
import { ensureFolder, getGoogleAuth } from '@/core/google-auth';

export interface MediaInput {
  accessToken?: string;
  isGuest: boolean;
  profileId: string;
  image?: Buffer | null;
  audio?: Buffer | null;
  audioMimeType?: string;
}

export interface MediaResult {
  imageUrl: string | null;
  audioUrl: string | null;
  notes: string[];
}

/** Smaller archive copy of the scan (WebP, ≤1500px wide; tall enough for a few stacked pages). */
export async function prepareArchiveImage(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate()
    .resize({ width: 1500, height: 6000, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 68 })
    .toBuffer();
}

export function demoPublicUploadsEnabled(): boolean {
  return env('DEMO_PUBLIC_MEDIA_UPLOAD') === 'true';
}

async function uploadToDrive(accessToken: string, buffer: Buffer, fileName: string, mimeType: string): Promise<string> {
  const auth = getGoogleAuth(accessToken);
  const drive = google.drive({ version: 'v3', auth: auth as never });
  const rootId = await ensureFolder(drive, 'DocSync AI');
  const mediaId = await ensureFolder(drive, 'DocSync AI Media', rootId);
  const res = await drive.files.create({
    requestBody: { name: fileName, parents: [mediaId] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: 'id, webViewLink',
  });
  if (!res.data.id) throw new Error('Drive returned no file id');
  return res.data.webViewLink || `https://drive.google.com/file/d/${res.data.id}/view`;
}

async function uploadToCatbox(buffer: Buffer, fileName: string): Promise<string> {
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('fileToUpload', new Blob([new Uint8Array(buffer)]), fileName);
  const res = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: form, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Catbox upload failed: ${res.status}`);
  const url = (await res.text()).trim();
  if (!url.startsWith('https://')) throw new Error('Catbox returned an unexpected response');
  return url;
}

export async function storeMedia(input: MediaInput): Promise<MediaResult> {
  const result: MediaResult = { imageUrl: null, audioUrl: null, notes: [] };
  if (!input.image && !input.audio) return result;

  let upload: ((buffer: Buffer, fileName: string, mimeType: string) => Promise<string>) | null = null;
  if (!input.isGuest && input.accessToken) {
    const token = input.accessToken;
    upload = (b, n, m) => uploadToDrive(token, b, n, m);
  } else if (input.isGuest && demoPublicUploadsEnabled()) {
    upload = (b, n) => uploadToCatbox(b, n);
  } else {
    result.notes.push(input.isGuest
      ? 'Demo mode: the image and voice note are not stored. Sign in with Google to keep them in your Drive.'
      : 'Your Google session has expired, so the image and voice note were not stored. Please sign in again.');
    return result;
  }

  const stamp = Date.now();
  const [image, audio] = await Promise.allSettled([
    input.image ? upload(input.image, `${input.profileId}_${stamp}.webp`, 'image/webp') : Promise.resolve(null),
    input.audio ? upload(input.audio, `voice_${input.profileId}_${stamp}.webm`, input.audioMimeType || 'audio/webm') : Promise.resolve(null),
  ]);

  if (image.status === 'fulfilled') result.imageUrl = image.value;
  else result.notes.push(`Image upload failed: ${image.reason instanceof Error ? image.reason.message : image.reason}`);
  if (audio.status === 'fulfilled') result.audioUrl = audio.value;
  else result.notes.push(`Voice note upload failed: ${audio.reason instanceof Error ? audio.reason.message : audio.reason}`);

  const attempted = [input.image ? image : null, input.audio ? audio : null].filter(Boolean);
  if (attempted.every(r => r?.status === 'rejected')) {
    throw new Error(result.notes.join(' '));
  }
  return result;
}

export function mediaHealth() {
  return { enabled: isModuleEnabled('media'), configured: true, demoPublicUploads: demoPublicUploadsEnabled(), circuit: circuitState('media') };
}
