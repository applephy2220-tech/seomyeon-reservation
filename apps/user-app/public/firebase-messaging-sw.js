// Web Push Background Service Worker for Firebase Cloud Messaging
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// Fallback configuration initialized safely inside Worker thread
const firebaseConfig = {
  apiKey: 'mock-api-key',
  authDomain: 'mock-auth-domain.firebaseapp.com',
  projectId: 'mock-project-id',
  storageBucket: 'mock-storage-bucket.appspot.com',
  messagingSenderId: 'mock-sender-id',
  appId: 'mock-app-id'
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Handle Background Messaging event
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Background Push Received: ', payload);
  
  if (!payload.notification) return;

  const notificationTitle = payload.notification.title || '서면 밤거리 예약 센터';
  const notificationOptions = {
    body: payload.notification.body || '실시간 매장 상태가 갱신되었습니다.',
    icon: '/favicon.ico',
    data: {
      url: payload.data ? payload.data.clickAction || '/' : '/'
    }
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle push notification click and navigate to specified URL
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data ? event.notification.data.url : '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // If a window is already open with the target URL, focus it
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window/tab
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
