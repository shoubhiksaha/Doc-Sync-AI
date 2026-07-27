import { NextRequest } from 'next/server';
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY 
  ? Buffer.from(process.env.ENCRYPTION_KEY, 'hex') 
  : crypto.createHash('sha256').update('docsync-ai-hackathon-fallback').digest();

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const salt = crypto.randomBytes(SALT_LENGTH);
  
  const key = crypto.pbkdf2Sync(ENCRYPTION_KEY, salt, 100000, 32, 'sha512');
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  
  return Buffer.concat([salt, iv, tag, encrypted]).toString('base64');
}

export function decrypt(encText: string): string | null {
  try {
    const rawData = Buffer.from(encText, 'base64');
    
    const salt = rawData.subarray(0, SALT_LENGTH);
    const iv = rawData.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = rawData.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const encrypted = rawData.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    
    const key = crypto.pbkdf2Sync(ENCRYPTION_KEY, salt, 100000, 32, 'sha512');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    
    return decipher.update(encrypted) + decipher.final('utf8');
  } catch {
    console.error("Decryption failed");
    return null;
  }
}

// Utility export for API routes to read encrypted cookies
export function getDecryptedCookie(req: NextRequest, cookieName: string): string | undefined {
  const encValue = req.cookies.get(cookieName)?.value;
  if (!encValue) return undefined;
  return decrypt(encValue) || undefined;
}
