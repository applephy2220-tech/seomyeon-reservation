'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@shared/hooks/useAuth';
import { seedFirestoreData } from '@shared/utils/seedData';
import { BottomNavigation } from '@shared/components/BottomNavigation';
import { useRealtimeSeats } from '@shared/hooks/useRealtimeSeats';
import { 
  Mail, 
  Lock, 
  Smartphone, 
  Sparkles, 
  Database, 
  CheckCircle,
  AlertCircle,
  LogOut,
  UserCheck
} from 'lucide-react';

export default function LoginPage() {
  const { user, profile, loading, error, loginOrRegister, logout } = useAuth();
  const { seats } = useRealtimeSeats({ onlyAvailable: true });
  const router = useRouter();
  
  // Tab control: 'email' | 'phone'
  const [authTab, setAuthTab] = useState<'email' | 'phone'>('email');
  
  // Email Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  
  // Phone Form State
  const [phoneNumber, setPhoneNumber] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [smsSent, setSmsSent] = useState(false);
  
  // UI Status State
  const [authLoading, setAuthLoading] = useState(false);
  const [seedStatus, setSeedStatus] = useState<{ success?: boolean; message?: string } | null>(null);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    
    setAuthLoading(true);
    try {
      // Auto-register hybrid login trigger
      await loginOrRegister(email, password, displayName || undefined);
    } catch {
      // Handled inside useAuth state
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSendSms = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber) return;
    setAuthLoading(true);
    setTimeout(() => {
      setSmsSent(true);
      setAuthLoading(false);
    }, 1200);
  };

  const handleVerifySms = (e: React.FormEvent) => {
    e.preventDefault();
    if (!smsCode) return;
    alert('휴대폰 간편 로그인 placeholder 동작! 현재 단계에서는 이메일 회원가입/로그인을 추천합니다.');
  };

  const handleSeedDatabase = async () => {
    setSeedStatus({ message: '시딩 시작 중...' });
    const result = await seedFirestoreData();
    setSeedStatus(result);
  };

  const handleKakaoMockLogin = async () => {
    const kakaoClientId = process.env.NEXT_PUBLIC_KAKAO_CLIENT_ID;
    
    if (!kakaoClientId || kakaoClientId === 'mock') {
      // Mock Login Mode
      setAuthLoading(true);
      try {
        await loginOrRegister('kakao-demo-user@kakao.com', 'kakao-demo-password', '카카오단골손님');
        router.push('/');
      } catch (err) {
        console.error('Mock Kakao login error:', err);
      } finally {
        setAuthLoading(false);
      }
    } else {
      // Real OAuth Mode
      const redirectUri = `${window.location.origin}/api/auth/kakao`;
      window.location.href = `https://kauth.kakao.com/oauth/authorize?response_type=code&client_id=${kakaoClientId}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    }
  };

  return (
    <main className="min-h-screen bg-[#0B0B0C] text-white pb-32 max-w-md mx-auto relative shadow-2xl border-x border-zinc-900">
      {/* Background neon ambient blur */}
      <div className="absolute top-[-100px] left-1/2 -translate-x-1/2 w-72 h-72 rounded-full bg-purple-500/10 blur-[80px] pointer-events-none"></div>

      {/* Header */}
      <header className="px-6 pt-8 pb-4">
        <h1 className="text-xl font-black tracking-tight bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent">
          SEOMYEON RESERVATION
        </h1>
        <p className="text-xs text-zinc-500 font-semibold tracking-wider uppercase mt-1">
          서면 실시간 빈자리 예약
        </p>
      </header>

      <section className="px-6 mt-4">
        {user ? (
          /* Profile & Admin Actions View */
          <div className="space-y-6 animate-fadeIn">
            <div className="p-6 rounded-2xl bg-zinc-900/60 border border-purple-500/20 backdrop-blur-md space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-500 to-cyan-400 flex items-center justify-center font-bold text-lg text-black shadow-[0_0_15px_rgba(168,85,247,0.3)]">
                  {profile?.displayName?.charAt(0) || 'U'}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-1.5">
                    {profile?.displayName || '나들이객'}
                    <UserCheck className="w-4 h-4 text-cyan-400" />
                  </h3>
                  <p className="text-xs text-zinc-500">{profile?.email || user.email}</p>
                </div>
              </div>

              <div className="border-t border-zinc-800/80 pt-3 flex justify-between items-center text-xs">
                <span className="text-zinc-500">인증 수단</span>
                <span className="font-semibold text-purple-400 bg-purple-950/40 px-2 py-0.5 rounded border border-purple-500/20">
                  이메일 계정
                </span>
              </div>
            </div>

            {/* DB seeder container for demo testing */}
            <div className="p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/60 backdrop-blur-md space-y-4">
              <div className="flex items-start gap-3">
                <Database className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-white">데이터베이스 데모 셋업</h4>
                  <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                    실시간 렌더링을 빠르게 테스트할 수 있도록 서면의 유명 술집 5곳과 40여 개의 실시간 테이블 구조 데이터를 Firestore에 즉시 생성합니다.
                  </p>
                </div>
              </div>

              {seedStatus && (
                <div className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
                  seedStatus.success === true 
                    ? 'bg-emerald-950/30 text-emerald-400 border-emerald-500/20' 
                    : seedStatus.success === false
                      ? 'bg-amber-950/30 text-amber-400 border-amber-500/20'
                      : 'bg-zinc-800/30 text-zinc-400 border-zinc-700/25 animate-pulse'
                }`}>
                  {seedStatus.success === true ? (
                    <CheckCircle className="w-4 h-4 flex-shrink-0 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-400" />
                  )}
                  <span>{seedStatus.message}</span>
                </div>
              )}

              <button
                onClick={handleSeedDatabase}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-500 px-4 py-3 text-xs font-bold text-white hover:brightness-110 hover:shadow-[0_0_15px_rgba(168,85,247,0.3)] transition-all duration-300"
              >
                <Sparkles className="w-4 h-4 text-purple-200" />
                서면 술집 & 좌석 생성하기
              </button>
            </div>

            {/* Logout button */}
            <button
              onClick={logout}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-bold text-red-400 py-3 hover:bg-zinc-800/60 active:scale-[0.99] transition-all"
            >
              <LogOut className="w-4 h-4" />
              로그아웃
            </button>
          </div>
        ) : (
          /* Authentication Form View */
          <div className="space-y-6">
            {/* Header Description */}
            <div className="text-center py-2 space-y-1">
              <h2 className="text-lg font-bold text-white">반갑습니다!</h2>
              <p className="text-xs text-zinc-500">지금 서면에서 바로 예약 가능한 자리를 찾으세요.</p>
            </div>

            {/* Tab Selection */}
            <div className="grid grid-cols-2 p-1 rounded-xl bg-zinc-950/80 border border-zinc-900">
              <button
                onClick={() => setAuthTab('email')}
                className={`py-2 text-xs font-bold rounded-lg transition-all ${
                  authTab === 'email' 
                    ? 'bg-zinc-900 text-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.1)]' 
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                이메일 간편가입
              </button>
              <button
                onClick={() => setAuthTab('phone')}
                className={`py-2 text-xs font-bold rounded-lg transition-all ${
                  authTab === 'phone' 
                    ? 'bg-zinc-900 text-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.1)]' 
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                휴대폰 번호 로그인
              </button>
            </div>

            {/* Error alerts */}
            {error && (
              <div className="p-3 rounded-xl bg-red-950/30 border border-red-500/20 text-red-400 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Form Fields */}
            {authTab === 'email' ? (
              /* EMAIL LOGIN/REGISTER FORM */
              <form onSubmit={handleEmailAuth} className="space-y-4">
                {/* Optional Display Name for New Registrant */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider pl-1">
                    닉네임 (선택)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="서면 나들이객"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full bg-zinc-900/60 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500 transition-colors"
                    />
                    <Sparkles className="w-4 h-4 text-zinc-600 absolute left-3 top-3.5" />
                  </div>
                </div>

                {/* Email Input */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider pl-1">
                    이메일 주소
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      required
                      placeholder="seomyeon@domain.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-zinc-900/60 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500 transition-colors"
                    />
                    <Mail className="w-4 h-4 text-zinc-600 absolute left-3 top-3.5" />
                  </div>
                </div>

                {/* Password Input */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider pl-1">
                    비밀번호
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-zinc-900/60 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500 transition-colors"
                    />
                    <Lock className="w-4 h-4 text-zinc-600 absolute left-3 top-3.5" />
                  </div>
                </div>

                {/* Info Text */}
                <p className="text-[10px] text-zinc-500 pl-1">
                  💡 계정이 없는 경우, 입력한 정보로 자동 회원가입되어 즉시 예약이 가능합니다!
                </p>

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full rounded-xl bg-gradient-to-r from-purple-500 to-cyan-500 py-3 text-xs font-bold text-black hover:brightness-110 shadow-[0_0_15px_rgba(168,85,247,0.2)] hover:shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all duration-300 active:scale-[0.98] disabled:opacity-50"
                >
                  {authLoading ? '진행 중...' : '로그인 & 즉시 시작하기'}
                </button>
              </form>
            ) : (
              /* PHONE AUTH PLACEHOLDER FORM */
              <div className="space-y-4">
                {!smsSent ? (
                  <form onSubmit={handleSendSms} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider pl-1">
                        휴대폰 번호
                      </label>
                      <div className="relative">
                        <input
                          type="tel"
                          required
                          placeholder="010-1234-5678"
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                          className="w-full bg-zinc-900/60 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500 transition-colors"
                        />
                        <Smartphone className="w-4 h-4 text-zinc-600 absolute left-3 top-3.5" />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={authLoading}
                      className="w-full rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-bold py-3 text-white hover:bg-zinc-800 active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                      {authLoading ? '번호 확인 중...' : '인증 문자 발송하기'}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleVerifySms} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider pl-1">
                        인증번호 6자리
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          required
                          placeholder="123456"
                          value={smsCode}
                          onChange={(e) => setSmsCode(e.target.value)}
                          className="w-full bg-zinc-900/60 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500 transition-colors"
                        />
                        <Lock className="w-4 h-4 text-zinc-600 absolute left-3 top-3.5" />
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-[10px] text-zinc-500 pl-1">
                      <span>인증번호가 발송되었습니다.</span>
                      <button 
                        type="button" 
                        onClick={() => setSmsSent(false)} 
                        className="text-purple-400 font-semibold"
                      >
                        번호 수정
                      </button>
                    </div>

                    <button
                      type="submit"
                      className="w-full rounded-xl bg-gradient-to-r from-purple-500 to-cyan-500 py-3 text-xs font-bold text-black hover:brightness-110 transition-all duration-300"
                    >
                      인증 및 시작하기
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* Neon Accent Divider */}
            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-zinc-800/80"></div>
              <span className="flex-shrink mx-4 text-[10px] font-bold text-zinc-600 uppercase tracking-widest">
                간편 로그인
              </span>
              <div className="flex-grow border-t border-zinc-800/80"></div>
            </div>

            {/* Social Logins */}
            <div className="space-y-3">
              {/* Kakao Yellow Login button */}
              <button
                type="button"
                onClick={handleKakaoMockLogin}
                className="w-full flex items-center justify-center gap-2.5 rounded-xl bg-[#FEE500] hover:bg-[#FEE500]/90 text-[#191919] font-bold text-xs py-3.5 transition-all duration-200"
              >
                {/* Kakao logo vector representation */}
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M12 3c-4.97 0-9 3.185-9 7.115 0 2.53 1.69 4.753 4.22 5.922-.163.606-.59 2.193-.675 2.518-.1.385.138.38.29.278.12-.08 1.91-1.296 2.67-1.81.425.06.862.093 1.307.093 4.97 0 9-3.186 9-7.115C21 6.185 16.97 3 12 3z" />
                </svg>
                카카오계정으로 로그인
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Bottom PWA Bar Spacer & Navigation */}
      <BottomNavigation availableCount={seats.length} />
    </main>
  );
}
