/**
 * Settings module — the user's own keys (BYOK) and destinations.
 *
 * Stateless mode: values live in encrypted httpOnly cookies. Persistent mode: values are also
 * stored in Firestore with envelope encryption so they follow the user across devices.
 * Every failure here degrades to "no saved settings"; callers then fall back to server keys.
 */
import type { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { isModuleEnabled } from '@/core/env';
import { encrypt, getDecryptedCookie, isEncryptionConfigured } from '@/core/crypto';
import { generateAndWrapDEK, unwrapAndDecryptDEK, type KmsPayload } from '@/core/envelope';
import { firestoreConfigured, getDb } from './firestore';

export type UploadDest = 'both' | 'gdrive' | 'notion';

export interface DocSyncSettings {
  openaiKey?: string;
  notionKey?: string;
  notionDbId?: string;
  uploadDest: UploadDest;
}

export const SETTINGS_COOKIES = {
  aiKey: 'docsync_openai',
  notionKey: 'docsync_notion',
  notionDbId: 'docsync_notion_db',
  uploadDest: 'docsync_upload_dest',
  persistent: 'docsync_persistent',
} as const;

const TEN_YEARS = 60 * 60 * 24 * 365 * 10;

export function secureCookieOptions(sameSite: 'strict' | 'lax' = 'strict') {
  return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite, path: '/', maxAge: TEN_YEARS };
}

export function parseUploadDest(value: unknown): UploadDest {
  return value === 'gdrive' || value === 'notion' || value === 'both' ? value : 'both';
}

function safeUnwrap(payload: unknown): string | undefined {
  try {
    return payload ? unwrapAndDecryptDEK(payload as KmsPayload) : undefined;
  } catch {
    return undefined;
  }
}

async function userEmail(req: NextRequest): Promise<string | undefined> {
  try {
    const token = await getToken({ req });
    return typeof token?.email === 'string' ? token.email : undefined;
  } catch {
    return undefined;
  }
}

export async function loadSettings(req: NextRequest): Promise<DocSyncSettings> {
  const settings: DocSyncSettings = {
    openaiKey: getDecryptedCookie(req, SETTINGS_COOKIES.aiKey),
    notionKey: getDecryptedCookie(req, SETTINGS_COOKIES.notionKey),
    notionDbId: getDecryptedCookie(req, SETTINGS_COOKIES.notionDbId),
    uploadDest: parseUploadDest(req.cookies.get(SETTINGS_COOKIES.uploadDest)?.value),
  };
  if (!isModuleEnabled('settings') || (settings.openaiKey && settings.notionKey && settings.notionDbId)) return settings;

  const db = getDb();
  const email = db ? await userEmail(req) : undefined;
  if (!db || !email) return settings;

  try {
    const doc = await db.collection('users').doc(email).get();
    const data = doc.exists ? doc.data() : undefined;
    if (data) {
      settings.openaiKey ??= safeUnwrap(data.openaiKey);
      settings.notionKey ??= safeUnwrap(data.notionKey);
      settings.notionDbId ??= safeUnwrap(data.notionDbId);
      if (data.uploadDest) settings.uploadDest = parseUploadDest(data.uploadDest);
    }
  } catch (err) {
    console.error('[settings] Firestore read failed; using cookie settings only:', err instanceof Error ? err.message : err);
  }
  return settings;
}

export interface SettingsUpdate {
  openaiKey?: string;
  notionKey?: string;
  notionDbId?: string;
  uploadDest?: string;
  persistent?: boolean;
}

/** Writes cookies on `response` and, when asked, mirrors the values to Firestore. */
export async function saveSettings(req: NextRequest, response: NextResponse, update: SettingsUpdate): Promise<{ persisted: boolean | 'failed' }> {
  const options = secureCookieOptions();
  const setOrClear = (name: string, value: unknown) => {
    if (typeof value === 'string' && value.trim()) response.cookies.set(name, encrypt(value.trim()), options);
    else if (value === '') response.cookies.delete(name);
  };
  setOrClear(SETTINGS_COOKIES.aiKey, update.openaiKey);
  setOrClear(SETTINGS_COOKIES.notionKey, update.notionKey);
  setOrClear(SETTINGS_COOKIES.notionDbId, update.notionDbId);
  if (update.uploadDest) response.cookies.set(SETTINGS_COOKIES.uploadDest, parseUploadDest(update.uploadDest), options);
  response.cookies.set(SETTINGS_COOKIES.persistent, update.persistent ? 'true' : 'false', { ...options, httpOnly: false });

  const db = getDb();
  const email = db && isModuleEnabled('settings') ? await userEmail(req) : undefined;
  if (!db || !email) return { persisted: false };

  try {
    const ref = db.collection('users').doc(email);
    if (update.persistent === false) {
      await ref.delete();
      return { persisted: false };
    }
    if (!update.persistent) return { persisted: false };

    const data: Record<string, unknown> = {};
    const wrap = (field: string, value: unknown) => {
      if (typeof value === 'string' && value.trim()) data[field] = generateAndWrapDEK(value.trim());
      else if (value === '') data[field] = null;
    };
    wrap('openaiKey', update.openaiKey);
    wrap('notionKey', update.notionKey);
    wrap('notionDbId', update.notionDbId);
    if (update.uploadDest) data.uploadDest = parseUploadDest(update.uploadDest);
    if (Object.keys(data).length) await ref.set(data, { merge: true });
    return { persisted: true };
  } catch (err) {
    console.error('[settings] Firestore write failed; cookies were still saved:', err instanceof Error ? err.message : err);
    return { persisted: 'failed' };
  }
}

export async function settingsStatus(req: NextRequest) {
  const status = {
    hasOpenAiKey: Boolean(req.cookies.get(SETTINGS_COOKIES.aiKey)),
    hasNotionKey: Boolean(req.cookies.get(SETTINGS_COOKIES.notionKey)),
    hasNotionDbId: Boolean(req.cookies.get(SETTINGS_COOKIES.notionDbId)),
    uploadDest: parseUploadDest(req.cookies.get(SETTINGS_COOKIES.uploadDest)?.value),
    isPersistent: req.cookies.get(SETTINGS_COOKIES.persistent)?.value === 'true',
  };
  if (status.hasOpenAiKey && status.hasNotionKey && status.hasNotionDbId) return status;

  const db = getDb();
  const email = db ? await userEmail(req) : undefined;
  if (!db || !email) return status;
  try {
    const doc = await db.collection('users').doc(email).get();
    const data = doc.exists ? doc.data() : undefined;
    if (data) {
      status.isPersistent = true;
      status.hasOpenAiKey ||= Boolean(data.openaiKey);
      status.hasNotionKey ||= Boolean(data.notionKey);
      status.hasNotionDbId ||= Boolean(data.notionDbId);
      if (data.uploadDest) status.uploadDest = parseUploadDest(data.uploadDest);
    }
  } catch (err) {
    console.error('[settings] Firestore status read failed:', err instanceof Error ? err.message : err);
  }
  return status;
}

export function settingsHealth() {
  return {
    enabled: isModuleEnabled('settings'),
    configured: isEncryptionConfigured(),
    persistent: firestoreConfigured(),
    circuit: 'closed' as const,
  };
}
