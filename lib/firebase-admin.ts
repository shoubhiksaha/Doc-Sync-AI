import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (!getApps().length) {
  try {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID || 'docsyncai1',
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        // Handle escaped newlines and surrounding quotes in the private key
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY)?.replace(/^"|"$/g, '').replace(/\\n/g, '\n'),
      }),
    });
    console.log('Firebase Admin initialized successfully.');
  } catch (error) {
    console.error('Firebase Admin initialization error', error);
  }
}

export const db = getApps().length ? getFirestore() : null;
export const auth = getApps().length ? getAuth() : null;
