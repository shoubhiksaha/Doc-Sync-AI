// DocSync AI service worker.
// Keeps the app installable and removes caches left behind by the old next-pwa/Workbox worker.
// It deliberately caches nothing: every request (pages and API) goes to the network, so users
// always get the current deployment and no document data is ever stored on the device.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});
