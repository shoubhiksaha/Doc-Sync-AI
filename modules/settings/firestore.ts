import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { env } from '@/core/env';

/**
 * Lazily initialised Firestore. Nothing runs at import time, so a broken Firebase config only
 * disables persistent settings — it can't take down routes that merely import this module.
 * FIRESTORE_DATABASE_ID selects the database ("staging" on staging, "(default)" in production).
 */

let cached: Firestore | null | undefined;

export function firestoreConfigured(): boolean {
  return Boolean((env('FIREBASE_CLIENT_EMAIL') || env('GOOGLE_SERVICE_ACCOUNT_EMAIL')) && (env('FIREBASE_PRIVATE_KEY') || env('GOOGLE_PRIVATE_KEY')));
}

export function getDb(): Firestore | null {
  if (cached !== undefined) return cached;
  if (!firestoreConfigured()) {
    cached = null;
    return cached;
  }
  try {
    const app = getApps()[0] ?? initializeApp({
      credential: cert({
        projectId: env('FIREBASE_PROJECT_ID') || 'docsyncai1',
        clientEmail: env('FIREBASE_CLIENT_EMAIL') || env('GOOGLE_SERVICE_ACCOUNT_EMAIL'),
        privateKey: (env('FIREBASE_PRIVATE_KEY') || env('GOOGLE_PRIVATE_KEY'))?.replace(/^"|"$/g, '').replace(/\\n/g, '\n'),
      }),
    });
    const databaseId = env('FIRESTORE_DATABASE_ID');
    cached = databaseId && databaseId !== '(default)' ? getFirestore(app, databaseId) : getFirestore(app);
  } catch (error) {
    console.error('[settings] Firestore initialisation failed:', error instanceof Error ? error.message : error);
    cached = null;
  }
  return cached;
}

/** Test helper. */
export function resetFirestore(): void {
  cached = undefined;
}
