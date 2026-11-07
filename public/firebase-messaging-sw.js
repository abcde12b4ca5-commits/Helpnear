/* Background push handler. Firebase web config is public; it is passed in the registration URL query string. */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js')

const q = new URL(self.location.href).searchParams
firebase.initializeApp({
  apiKey: q.get('apiKey'), authDomain: q.get('authDomain'), projectId: q.get('projectId'),
  appId: q.get('appId'), messagingSenderId: q.get('messagingSenderId'),
})
firebase.messaging() // notification-type messages are displayed by the browser automatically

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const link = (event.notification.data && event.notification.data.FCM_MSG && event.notification.data.FCM_MSG.notification && event.notification.data.FCM_MSG.notification.click_action) || '/my-requests'
  event.waitUntil(self.clients.openWindow(link))
})
