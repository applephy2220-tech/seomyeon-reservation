'use client';

import React, { useEffect } from 'react';
import { useAuth } from '@shared/hooks/useAuth';

export const KakaoTokenListener: React.FC = () => {
  const { loginOrRegister, loginWithKakaoCustomToken } = useAuth();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const customToken = params.get('customToken');
    const nickname = params.get('nickname');

    if (customToken) {
      const handleTokenAuthentication = async () => {
        try {
          console.log('[KakaoTokenListener] Processing custom token authentication...', customToken);
          
          if (customToken === 'mock-kakao-token') {
            // Mock Kakao Login Fallback
            await loginOrRegister(
              'kakao-demo-user@kakao.com',
              'kakao-demo-password',
              nickname || '카카오단골손님'
            );
            console.log('[KakaoTokenListener] Mock Kakao login successful.');
          } else {
            // Real Custom Token Login
            await loginWithKakaoCustomToken(customToken);
            console.log('[KakaoTokenListener] Real Kakao login via Custom Token successful.');
          }
        } catch (err) {
          console.error('[KakaoTokenListener] Kakao callback authentication failed:', err);
          alert('카카오 로그인 연동 실패: ' + (err instanceof Error ? err.message : String(err)));
        } finally {
          // Clean up the URL parameters so they don't linger in the browser bar
          const url = new URL(window.location.href);
          url.searchParams.delete('customToken');
          url.searchParams.delete('nickname');
          window.history.replaceState({}, '', url.pathname + url.search);
        }
      };

      handleTokenAuthentication();
    }
  }, [loginOrRegister, loginWithKakaoCustomToken]);

  return null;
};

export default KakaoTokenListener;
