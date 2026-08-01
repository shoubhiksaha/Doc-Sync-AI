/**
 * Handles media storage for Demo Mode ONLY.
 * Because the Demo Service Account has no Google Drive storage quota, 
 * this helper uploads the media to Catbox.moe (a free, no-auth file host).
 * This ensures the Demo Mode works on Vercel (which has a read-only filesystem)
 * and generates public URLs for the Google Sheet.
 * 
 * NOTE: This entire file can be safely deleted when Demo Mode is removed.
 */
export async function saveMediaLocallyForDemo(
  archiveBuffer: Buffer | null,
  audioBuffer: Buffer | null,
  profileId: string
): Promise<{ imageUrl: string | null; audioUrl: string | null }> {
  let imageUrl: string | null = null;
  let audioUrl: string | null = null;

  async function uploadToCatbox(buffer: Buffer, fileName: string): Promise<string | null> {
    try {
      const formData = new FormData();
      formData.append('reqtype', 'fileupload');
      formData.append('fileToUpload', new Blob([new Uint8Array(buffer)]), fileName);

      const res = await fetch('https://catbox.moe/user/api.php', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        console.error('Catbox upload failed:', res.statusText);
        return null;
      }

      return await res.text(); // Returns the raw public URL
    } catch (e) {
      console.error('Error uploading to Catbox:', e);
      return null;
    }
  }

  if (archiveBuffer) {
    const fileName = `${profileId}_${Date.now()}.webp`;
    imageUrl = await uploadToCatbox(archiveBuffer, fileName);
  }

  if (audioBuffer) {
    const fileName = `voice_${profileId}_${Date.now()}.webm`;
    audioUrl = await uploadToCatbox(audioBuffer, fileName);
  }

  return { imageUrl, audioUrl };
}
