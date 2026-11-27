/* Helpnear service worker. It does two jobs and nothing else:
   1. Background push notifications (Firebase). The web config is public; it arrives in the registration URL query string (see src/lib/push.ts).
      Without that query string (a visitor who never turned push on) Firebase is simply not started.
   2. Makes the site installable as an app and shows a friendly page when the phone has no connection.
   It NEVER caches pages, scripts, data or API calls: every request goes to the network exactly as without a service worker,
   so visitors always get the newest version of the site. Only /offline.html and its two small files are stored, and only to be shown when the network fails. */

// If Google's script host is unreachable, the worker must still install (installability and the offline page do not depend on it).
try {
  importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js')
  importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js')
} catch (e) { /* push stays off until the worker is registered again */ }

const q = new URL(self.location.href).searchParams
try {
  if (self.firebase && q.get('projectId')) {
    firebase.initializeApp({
      apiKey: q.get('apiKey'), authDomain: q.get('authDomain'), projectId: q.get('projectId'),
      appId: q.get('appId'), messagingSenderId: q.get('messagingSenderId'),
    })
    firebase.messaging() // notification-type messages are displayed by the browser automatically
  }
} catch (e) { /* a bad config must never stop the offline page from working */ }

const CACHE = 'hn-offline-v1'
const OFFLINE_FILES = ['/offline.html', '/offline.css', '/offline.js', '/icon-192.png']

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all(OFFLINE_FILES.map((f) => cache.add(new Request(f, { cache: 'reload' })).catch(() => undefined))))
      .catch(() => undefined),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      for (const name of await caches.keys()) if (name.startsWith('hn-offline-') && name !== CACHE) await caches.delete(name)
    } catch (e) { /* old files are harmless */ }
    try { if (self.registration.navigationPreload) await self.registration.navigationPreload.enable() } catch (e) { /* optional speed-up */ }
    await self.clients.claim()
  })())
})

// Only page loads (navigations) are handled, and only to catch a network failure. Everything else is left alone: the browser handles it as usual.
self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.mode !== 'navigate' || req.method !== 'GET') return
  event.respondWith((async () => {
    try {
      const preloaded = await event.preloadResponse
      return preloaded || await fetch(req)
    } catch (e) {
      const offline = await caches.match('/offline.html')
      return offline || Response.error()
    }
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const link = (event.notification.data && event.notification.data.FCM_MSG && event.notification.data.FCM_MSG.notification && event.notification.data.FCM_MSG.notification.click_action) || '/my-requests'
  event.waitUntil(self.clients.openWindow(link))
})
