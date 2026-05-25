import { NextResponse } from 'next/server';
import { db } from '@shared/firebase/clientApp';
import { collection, query, where, getDocs } from 'firebase/firestore';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, title, body: msgBody, clickAction } = body;

    if (!userId || !title || !msgBody) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters (userId, title, body)' },
        { status: 400 }
      );
    }

    // 1. Query registered FCM Web Push device tokens for this user
    const tokensCol = collection(db, 'fcm_tokens');
    const q = query(tokensCol, where('userId', '==', userId));
    const querySnapshot = await getDocs(q);

    const tokens: string[] = [];
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.token) {
        tokens.push(data.token);
      }
    });

    console.log(`[SendPush API] Dispatching notifications to user "${userId}". Found ${tokens.length} active device token(s).`);
    console.log(`[SendPush API] Details - Title: "${title}", Body: "${msgBody}", URL: "${clickAction || '/'}"`);

    if (tokens.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Notification generated, but no active device token found for native push.'
      });
    }

    // 2. Real FCM Dispatch Gateway Invocation
    // If the Server Key is missing, fall back to simulated successful deliveries
    const fcmServerKey = process.env.FIREBASE_FCM_SERVER_KEY;
    if (!fcmServerKey) {
      console.log('[SendPush API] FIREBASE_FCM_SERVER_KEY environment variable is not defined. Bypassing native delivery (simulated success).');
      return NextResponse.json({
        success: true,
        message: 'FCM push simulated successfully (Server key not configured).'
      });
    }

    // Legacy standard FCM HTTP gateway endpoint (lightweight for serverless routing)
    const fcmEndpoint = 'https://fcm.googleapis.com/fcm/send';

    const sendPromises = tokens.map(async (token) => {
      try {
        const response = await fetch(fcmEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `key=${fcmServerKey}`
          },
          body: JSON.stringify({
            to: token,
            notification: {
              title,
              body: msgBody,
              icon: '/favicon.ico',
              click_action: clickAction || '/'
            },
            data: {
              clickAction: clickAction || '/'
            }
          })
        });
        const data = await response.json();
        return { token, success: true, result: data };
      } catch (err) {
        console.error(`[SendPush API] Error sending push to token ${token.substring(0, 10)}...:`, err);
        return { token, success: false, error: err };
      }
    });

    const results = await Promise.all(sendPromises);

    return NextResponse.json({
      success: true,
      message: 'FCM push operations completed.',
      results
    });

  } catch (err) {
    console.error('[SendPush API] Request handler failed:', err);
    const error = err as Error;
    return NextResponse.json(
      { success: false, error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
