// Firebase Cloud Messaging background push handler.
// Replace the firebaseConfig values below with your Firebase project's web config
// (or serve this file dynamically / update with your keys before production deploy).

importScripts('https://www.gstatic.com/firebasejs/11.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.0.0/firebase-messaging-compat.js');

const DEFAULT_CONFIG = {
  apiKey: 'your_firebase_api_key',
  authDomain: 'your_project_id.firebaseapp.com',
  projectId: 'your_project_id',
  storageBucket: 'your_project_id.appspot.com',
  messagingSenderId: 'your_messaging_sender_id',
  appId: 'your_firebase_app_id',
};

let messagingInitialized = false;

function initMessaging(config) {
  if (messagingInitialized) return;
  if (!config || !config.apiKey || config.apiKey === 'your_firebase_api_key') return;
  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(config);
    }
    const messaging = firebase.messaging();
    messaging.onBackgroundMessage((payload) => {
      const title = payload.notification?.title || payload.data?.title || '💌 Our Little Universe';
      const options = {
        body: payload.notification?.body || payload.data?.body || 'New love note waiting for you ✨',
        icon: '/icons/icon-192.svg',
        badge: '/icons/icon-192.svg',
        vibrate: [120, 60, 120],
        data: payload.data || { tab: 'chat' },
      };
      self.registration.showNotification(title, options);
    });
    messagingInitialized = true;
  } catch (err) {
    console.warn('[FCM SW] Init skipped:', err);
  }
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'FIREBASE_CONFIG') {
    initMessaging(event.data.config);
  }
});

initMessaging(DEFAULT_CONFIG);

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        if ('focus' in client) {
          client.focus();
          client.postMessage({ type: 'OPEN_FROM_NOTIFICATION', data: event.notification.data || {} });
          return;
        }
      }
      return self.clients.openWindow('/');
    })
  );
});

