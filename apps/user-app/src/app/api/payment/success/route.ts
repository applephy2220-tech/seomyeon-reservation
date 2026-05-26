import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  
  // Standard Toss Payments query parameters
  const paymentKey = searchParams.get('paymentKey');
  const orderId = searchParams.get('orderId');
  const amount = searchParams.get('amount');
  
  // Custom business relation parameters passed from our redirect success url
  const seatId = searchParams.get('seatId');
  const venueId = searchParams.get('venueId');
  const venueName = searchParams.get('venueName');
  const seatLabel = searchParams.get('seatLabel');
  const userId = searchParams.get('userId') || 'demo-user';
  const dealId = searchParams.get('dealId') || '';

  console.log(`[Toss Success API] Received Callback. paymentKey: ${paymentKey}, orderId: ${orderId}, amount: ${amount}`);

  if (!paymentKey || !orderId || !amount || !seatId) {
    console.error('[Toss Success API] Missing critical transaction parameters.');
    return NextResponse.redirect(new URL('/?paymentError=missing_params', request.url));
  }

  const tossSecretKey = process.env.TOSS_SECRET_KEY;

  // 1. Hybrid Sandbox Mode: If Toss API keys are not set or set to 'mock'
  if (!tossSecretKey || tossSecretKey === 'mock') {
    console.log('[Toss Success API] TOSS_SECRET_KEY is not configured. Simulating mock custom confirmation transaction.');
    
    // Redirect back to the reservation seat page with success query parameters so client transaction takes over
    const clientRedirectUrl = new URL(`/reservation/${seatId}`, request.url);
    clientRedirectUrl.searchParams.set('paymentSuccess', 'true');
    clientRedirectUrl.searchParams.set('paymentKey', paymentKey);
    clientRedirectUrl.searchParams.set('orderId', orderId);
    clientRedirectUrl.searchParams.set('amount', amount);
    clientRedirectUrl.searchParams.set('venueId', venueId || '');
    clientRedirectUrl.searchParams.set('venueName', venueName || '');
    clientRedirectUrl.searchParams.set('seatLabel', seatLabel || '');
    clientRedirectUrl.searchParams.set('userId', userId);
    if (dealId) {
      clientRedirectUrl.searchParams.set('dealId', dealId);
    }
    
    return NextResponse.redirect(clientRedirectUrl);
  }

  try {
    // 2. Real Toss Payments POST Confirm verification call
    const authHeader = Buffer.from(`${tossSecretKey}:`).toString('base64');
    const confirmResponse = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        paymentKey,
        orderId,
        amount: Number(amount)
      })
    });

    if (!confirmResponse.ok) {
      const errText = await confirmResponse.text();
      console.error('[Toss Success API] Verification confirm request failed:', errText);
      return NextResponse.redirect(new URL(`/reservation/${seatId}?paymentError=true&message=${encodeURIComponent('토스결제승인실패')}`, request.url));
    }

    const confirmData = await confirmResponse.json();
    console.log('[Toss Success API] Transaction verified successfully on Toss backend!', confirmData.status);

    // Redirect to client-side page with transaction status to let client finalize the reservation in Firestore
    const clientRedirectUrl = new URL(`/reservation/${seatId}`, request.url);
    clientRedirectUrl.searchParams.set('paymentSuccess', 'true');
    clientRedirectUrl.searchParams.set('paymentKey', paymentKey);
    clientRedirectUrl.searchParams.set('orderId', orderId);
    clientRedirectUrl.searchParams.set('amount', amount);
    clientRedirectUrl.searchParams.set('venueId', venueId || '');
    clientRedirectUrl.searchParams.set('venueName', venueName || '');
    clientRedirectUrl.searchParams.set('seatLabel', seatLabel || '');
    clientRedirectUrl.searchParams.set('userId', userId);
    if (dealId) {
      clientRedirectUrl.searchParams.set('dealId', dealId);
    }

    return NextResponse.redirect(clientRedirectUrl);

  } catch (err) {
    console.error('[Toss Success API] Server-side fetch process crashed:', err);
    return NextResponse.redirect(new URL(`/reservation/${seatId}?paymentError=true`, request.url));
  }
}
