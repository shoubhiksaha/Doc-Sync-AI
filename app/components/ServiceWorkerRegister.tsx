'use client';

import { useEffect } from 'react';

/** Registers the minimal service worker that keeps the app installable as a PWA. */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(err => console.warn('Service worker registration failed:', err));
  }, []);
  return null;
}
