import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');

    if (!code) {
      console.warn('[Kakao Auth API] Authorization code missing in request.');
      return NextResponse.redirect(new URL('/login?error=code_missing', request.url));
    }

    const kakaoClientId = process.env.NEXT_PUBLIC_KAKAO_CLIENT_ID;
    const redirectUri = `${new URL(request.url).origin}/api/auth/kakao`;

    // 1. If Kakao credentials are not configured, fall back immediately to Mock login redirection
    if (!kakaoClientId || kakaoClientId === 'mock') {
      console.log('[Kakao Auth API] NEXT_PUBLIC_KAKAO_CLIENT_ID is not configured. Simulating mock custom token callback.');
      return NextResponse.redirect(new URL('/?customToken=mock-kakao-token', request.url));
    }

    // 2. Fetch Kakao Access Token from Kakao authorization server
    const tokenUrl = 'https://kauth.kakao.com/oauth/token';
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: kakaoClientId,
        redirect_uri: redirectUri,
        code
      })
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      console.error('[Kakao Auth API] Failed to trade authorization code for token:', errText);
      return NextResponse.redirect(new URL('/login?error=token_exchange_failed', request.url));
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // 3. Fetch Kakao User Profile details
    const userMeUrl = 'https://kapi.kakao.com/v2/user/me';
    const userResponse = await fetch(userMeUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
      }
    });

    if (!userResponse.ok) {
      console.error('[Kakao Auth API] Failed to fetch Kakao user profile.');
      return NextResponse.redirect(new URL('/login?error=user_profile_failed', request.url));
    }

    const kakaoUser = await userResponse.json();
    const kakaoId = kakaoUser.id.toString(); // Unique Kakao numerical account ID
    const nickname = kakaoUser.properties?.nickname || '카카오 나들이객';

    console.log(`[Kakao Auth API] Authenticated Kakao User. ID: ${kakaoId}, Nickname: ${nickname}`);

    // 4. Generate Firebase Custom Token
    // We dynamically load firebase-admin to prevent build bundle compilation crashes
    // if the library is not installed in the workspace.
    const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

    if (!privateKey || !clientEmail || !projectId) {
      console.log('[Kakao Auth API] Firebase Admin credentials are not fully configured. Bypassing native custom token generation with mock fallback.');
      return NextResponse.redirect(new URL(`/?customToken=mock-kakao-token&nickname=${encodeURIComponent(nickname)}`, request.url));
    }

    try {
      // Dynamic import to bypass next compile dependencies safety check
      // @ts-expect-error: firebase-admin may not be installed in the local workspace environment
      const admin = await import('firebase-admin');
      
      // Initialize admin app if not already active
      if (admin.apps.length === 0) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey: privateKey.replace(/\\n/g, '\n') // repair escape newlines in key string
          })
        });
      }

      // Generate custom firebase auth token matching unique Kakao account ID
      const firebaseUid = `kakao_${kakaoId}`;
      const customToken = await admin.auth().createCustomToken(firebaseUid, {
        displayName: nickname,
        email: `kakao_${kakaoId}@seomyeon-now.com`
      });

      console.log(`[Kakao Auth API] Custom Token generated successfully for UID: ${firebaseUid}`);
      
      // Redirect back to home with customToken to let client complete the sign-in
      return NextResponse.redirect(new URL(`/?customToken=${customToken}&nickname=${encodeURIComponent(nickname)}`, request.url));

    } catch (adminErr) {
      console.error('[Kakao Auth API] Dynamic firebase-admin token generation failed. Falling back to mock token redirect:', adminErr);
      return NextResponse.redirect(new URL(`/?customToken=mock-kakao-token&nickname=${encodeURIComponent(nickname)}`, request.url));
    }

  } catch (error) {
    console.error('[Kakao Auth API] Request handler failed:', error);
    return NextResponse.redirect(new URL('/login?error=server_error', request.url));
  }
}
