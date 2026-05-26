import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  
  // Gate check for `/admin` routes
  if (url.pathname.startsWith('/admin')) {
    const adminSession = request.cookies.get('admin_session');
    
    // In local dev demo environments, if client keys are set to 'mock', we allow initial page load
    // to let users complete the admin credentials setup without loop redirects.
    const isMockBypass = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY === 'mock' || !process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;

    if (!adminSession && !isMockBypass) {
      console.warn('[Middleware] Blocked unauthorized routing request to Admin page. Session Cookie missing.');
      const loginRedirect = new URL('/login', request.url);
      loginRedirect.searchParams.set('error', 'admin_required');
      return NextResponse.redirect(loginRedirect);
    }
  }

  return NextResponse.next();
}

// Target matcher rules matching Next.js 15 routing parameters
export const config = {
  matcher: ['/admin/:path*'],
};
