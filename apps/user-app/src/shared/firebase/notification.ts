import { db, app } from './clientApp';
import { collection, addDoc, doc, setDoc, Timestamp } from 'firebase/firestore';

/**
 * 1. Safe detection of Notification, Service Workers, and FCM support
 */
export const isNotificationSupported = async (): Promise<boolean> => {
  if (typeof window === 'undefined') return false;
  if (!('Notification' in window)) return false;
  if (!('serviceWorker' in navigator)) return false;
  try {
    const { isSupported } = await import('firebase/messaging');
    return await isSupported();
  } catch (error) {
    console.warn('[Notification] Support check warning: ', error);
    return false;
  }
};

/**
 * 2. Request native browser notification privileges
 */
export const requestNotificationPermission = async (): Promise<NotificationPermission> => {
  if (typeof window === 'undefined') return 'default';
  if (!('Notification' in window)) return 'default';
  
  // Safe backward compatibility check for promise support
  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch {
    return 'default';
  }
};

/**
 * 3. Retrieve FCM Web Push token and register in Firestore fcm_tokens
 */
export const getAndSaveFcmToken = async (
  userId: string,
  role: 'user' | 'owner'
): Promise<string | null> => {
  try {
    const supported = await isNotificationSupported();
    if (!supported) {
      console.warn('[Notification] Messaging not supported on this platform/browser.');
      return null;
    }

    const permission = await requestNotificationPermission();
    if (permission !== 'granted') {
      console.warn('[Notification] Permission blocked or not granted.');
      return null;
    }

    const { getMessaging, getToken } = await import('firebase/messaging');
    const messaging = getMessaging(app);

    // VAPID Key from environment variables (e.g. for production pushes)
    const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || undefined;
    
    // Dynamically register our custom background SW
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/'
    });
    
    const token = await getToken(messaging, {
      serviceWorkerRegistration: registration,
      vapidKey
    });

    if (token) {
      console.log(`[Notification] Token resolved for ${userId}:`, token);
      
      // Upsert into fcm_tokens to allow targeted push deliveries
      const tokenRef = doc(db, 'fcm_tokens', token);
      await setDoc(tokenRef, {
        token,
        userId,
        role,
        deviceType: 'web',
        updatedAt: Timestamp.now()
      });
      return token;
    }
    return null;
  } catch (err) {
    console.error('[Notification] Token acquisition failed:', err);
    return null;
  }
};

/**
 * 4. Dual-Mode Event Trigger:
 *    A. Writes to Firestore 'inapp_notifications' (catalyzes highly responsive in-app neon toasts)
 *    B. Queries 'fcm_tokens' and hits Next API send-push endpoint (catalyzes background push alerts)
 */
export const triggerNotification = async (
  userId: string,
  title: string,
  body: string,
  clickAction: string = '/'
): Promise<void> => {
  try {
    // A. Reactive In-App Notification Document creation
    const inappCol = collection(db, 'inapp_notifications');
    await addDoc(inappCol, {
      userId,
      title,
      body,
      clickAction,
      read: false,
      createdAt: Timestamp.now()
    });

    // B. Trigger Web Fetch to API endpoint for PWA background pushes
    fetch('/api/send-push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId,
        title,
        body,
        clickAction
      })
    }).catch(err => {
      // Silence network trigger failures safely in local environments
      console.warn('[Notification] FCM native API push request skipped: ', err);
    });

  } catch (err) {
    console.error('[Notification] triggerNotification failed: ', err);
  }
};
