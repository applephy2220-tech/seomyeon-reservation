'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { db } from '@shared/firebase/clientApp';
import { collection, query, where, onSnapshot, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { Reservation } from '@shared/types';
import { useRealtimeSeats } from '@shared/hooks/useRealtimeSeats';
import { LoadingSpinner } from '@shared/components/LoadingSpinner';
import { BottomNavigation } from '@shared/components/BottomNavigation';
import { useAuth } from '@shared/hooks/useAuth';
import { seedFirestoreData } from '@shared/utils/seedData';
import { 
  User, 
  Ticket, 
  Calendar, 
  ChevronRight,
  LogOut,
  Flame,
  Database,
  Sparkles,
  CheckCircle,
  AlertCircle,
  SmartphoneNfc
} from 'lucide-react';

export default function ProfilePage() {
  const { user, profile: authProfile, loading: authLoading, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'active' | 'past' | 'info'>('active');
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [seedStatus, setSeedStatus] = useState<{ success?: boolean; message?: string } | null>(null);

  // Client URL query parameter monitoring for pre-render compilation safety
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const updateTabFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      if (tab === 'info') {
        setActiveTab('info');
      } else if (tab === 'past') {
        setActiveTab('past');
      } else {
        setActiveTab('active');
      }
    };
    updateTabFromUrl();
    window.addEventListener('popstate', updateTabFromUrl);
    return () => window.removeEventListener('popstate', updateTabFromUrl);
  }, []);

  // Subscribe to reservations belonging to logged-in user or 'demo-user' fallback
  useEffect(() => {
    const targetUserId = user?.uid || 'demo-user';
    const reservationsCol = collection(db, 'reservations');
    const q = query(
      reservationsCol,
      where('userId', '==', targetUserId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const resData: Reservation[] = [];
      snapshot.forEach((docSnap) => {
        const item = { id: docSnap.id, ...docSnap.data() } as Reservation;
        resData.push(item);
      });

      // Sort by creation time descending
      resData.sort((a, b) => {
        const tA = a.createdAt ? (a.createdAt as unknown as { seconds?: number }).seconds || new Date(a.createdAt as string).getTime() : 0;
        const tB = b.createdAt ? (b.createdAt as unknown as { seconds?: number }).seconds || new Date(b.createdAt as string).getTime() : 0;
        return tB - tA;
      });

      setReservations(resData);
      setLoading(false);
    }, (err) => {
      console.error('Error fetching user reservations:', err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // Real-time seats badge counter
  const { seats: globalAvailableSeats } = useRealtimeSeats({ onlyAvailable: true });

  const activeReservations = reservations.filter(r => r.status === 'confirmed' || r.status === 'visited');
  const pastReservations = reservations.filter(r => r.status !== 'confirmed' && r.status !== 'visited');

  // Handle Mock Cancellation inside Dashboard
  const handleCancelReservation = async (reservation: Reservation) => {
    if (confirm(`[${reservation.venueName}] 예약을 정말로 취소하시겠습니까? 예약금은 즉시 환불 처리됩니다.`)) {
      try {
        // 1. Revert seat to available
        const seatRef = doc(db, 'seats', reservation.seatId);
        await updateDoc(seatRef, {
          status: 'available',
          currentReservationId: null,
          updatedAt: Timestamp.now()
        });

        // 2. Update reservation status to canceled
        const reservationRef = doc(db, 'reservations', reservation.id);
        await updateDoc(reservationRef, {
          status: 'canceled',
          paymentStatus: 'refunded'
        });

        alert('예약이 성공적으로 취소되었습니다.');
      } catch (err) {
        console.error('Cancel reservation failed:', err);
        alert('예약 취소 중 오류가 발생했습니다.');
      }
    }
  };

  // Seed store data
  const handleSeedDatabase = async () => {
    setSeedStatus({ message: '시딩 시작 중...' });
    const result = await seedFirestoreData();
    setSeedStatus(result);
  };

  const isKakaoAccount = user?.email?.includes('kakao') || user?.uid?.startsWith('kakao') || authProfile?.email?.includes('kakao');

  return (
    <main className="min-h-screen bg-[#0B0B0C] text-white pb-36 max-w-md mx-auto relative shadow-2xl border-x border-zinc-900">
      
      {/* 1. Header Profile Banner */}
      <section className="p-6 bg-gradient-to-b from-purple-950/20 to-transparent border-b border-zinc-900/60 flex items-center gap-4 relative">
        <div className="w-14 h-14 rounded-full bg-zinc-900 border border-purple-500/30 flex items-center justify-center shadow-lg relative z-10 overflow-hidden">
          {isKakaoAccount ? (
            <div className="w-full h-full bg-[#FEE500] flex items-center justify-center text-[#191919] font-black">
              K
            </div>
          ) : (
            <User className="w-7 h-7 text-purple-400" />
          )}
        </div>
        <div className="space-y-1 relative z-10">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-extrabold text-white">
              {authProfile?.displayName || user?.displayName || '서면나들이객 (데모)'}
            </h2>
            {isKakaoAccount ? (
              <span className="text-[9px] font-black text-[#191919] bg-[#FEE500] px-1.5 py-0.5 rounded flex items-center gap-0.5 shadow-[0_0_6px_rgba(254,229,0,0.3)]">
                카카오 연동
              </span>
            ) : (
              <span className="text-[9px] font-bold text-cyan-400 bg-cyan-950/40 px-1.5 py-0.5 rounded border border-cyan-500/20">
                LV.3 단골
              </span>
            )}
          </div>
          <p className="text-[10px] text-zinc-500 font-medium">{authProfile?.email || user?.email || 'demo-user@seomyeon-live.com'}</p>
        </div>
      </section>

      {/* 2. Interactive Navigation Tabs */}
      <section className="px-6 mt-6">
        <div className="grid grid-cols-3 gap-2 bg-zinc-950/80 p-1.5 rounded-xl border border-zinc-900">
          <button
            onClick={() => {
              setActiveTab('active');
              window.history.pushState(null, '', '/profile?tab=active');
            }}
            className={`py-2.5 rounded-lg text-[10px] font-bold transition-all duration-200 ${
              activeTab === 'active'
                ? 'bg-purple-950/40 text-purple-400 border border-purple-500/20 shadow-[0_0_10px_rgba(168,85,247,0.05)]'
                : 'text-zinc-500 border border-transparent hover:text-zinc-400'
            }`}
          >
            이용 예정 ({activeReservations.length})
          </button>
          <button
            onClick={() => {
              setActiveTab('past');
              window.history.pushState(null, '', '/profile?tab=past');
            }}
            className={`py-2.5 rounded-lg text-[10px] font-bold transition-all duration-200 ${
              activeTab === 'past'
                ? 'bg-purple-950/40 text-purple-400 border border-purple-500/20 shadow-[0_0_10px_rgba(168,85,247,0.05)]'
                : 'text-zinc-500 border border-transparent hover:text-zinc-400'
            }`}
          >
            이용 내역 ({pastReservations.length})
          </button>
          <button
            onClick={() => {
              setActiveTab('info');
              window.history.pushState(null, '', '/profile?tab=info');
            }}
            className={`py-2.5 rounded-lg text-[10px] font-bold transition-all duration-200 ${
              activeTab === 'info'
                ? 'bg-purple-950/40 text-purple-400 border border-purple-500/20 shadow-[0_0_10px_rgba(168,85,247,0.05)]'
                : 'text-zinc-500 border border-transparent hover:text-zinc-400'
            }`}
          >
            내 프로필
          </button>
        </div>
      </section>

      {/* 3. Interactive Tab Panels */}
      <section className="mt-6 px-6 space-y-4">
        {loading || authLoading ? (
          <div className="py-16">
            <LoadingSpinner />
          </div>
        ) : activeTab === 'active' ? (
          // Active List
          activeReservations.length > 0 ? (
            activeReservations.map((item) => (
              <div 
                key={item.id} 
                className="rounded-2xl bg-zinc-900/60 border border-zinc-800 backdrop-blur-md overflow-hidden transition-all hover:border-purple-500/30 shadow-md relative animate-fadeIn"
              >
                {/* Visual Top Highlight */}
                <div className="h-1.5 bg-gradient-to-r from-purple-500 to-indigo-500" />
                
                <div className="p-5 space-y-4">
                  {/* Venue / Label */}
                  <div className="flex justify-between items-start">
                    <div className="space-y-0.5">
                      <span className="text-[9px] font-bold text-purple-400 uppercase tracking-widest bg-purple-950/40 px-2 py-0.5 rounded border border-purple-500/20">
                        {item.seatLabel}
                      </span>
                      <h4 className="text-base font-bold text-white pt-1.5 truncate max-w-[200px]">
                        {item.venueName}
                      </h4>
                    </div>
                    
                    {/* Glowing PIN code */}
                    <div className="text-right">
                      <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block">방문코드</span>
                      <span className="text-sm font-extrabold text-emerald-400 filter drop-shadow-[0_0_4px_rgba(52,211,153,0.3)] font-mono">
                        {item.visitCode}
                      </span>
                    </div>
                  </div>

                  {/* Visit Time */}
                  <div className="flex items-center gap-2 text-xs text-zinc-500 pt-1">
                    <Calendar className="w-4 h-4 text-zinc-600" />
                    <span>방문 예약일: {new Date(item.visitTime).toLocaleDateString()} (당일방문)</span>
                  </div>

                  {/* CTAs inside active card */}
                  <div className="pt-4 border-t border-zinc-800/60 flex items-center justify-between gap-3">
                    {item.status === 'confirmed' ? (
                      <button
                        onClick={() => handleCancelReservation(item)}
                        className="rounded-xl border border-zinc-850 bg-zinc-950/40 px-3.5 py-2 text-[10px] font-bold text-zinc-500 hover:text-red-400 hover:border-red-950/30 transition-colors"
                      >
                        예약 취소
                      </button>
                    ) : (
                      <span className="text-[10px] font-bold text-emerald-500 bg-emerald-950/20 px-2.5 py-1.5 rounded-lg border border-emerald-500/25">
                        이용 중 (취소 불가)
                      </span>
                    )}
                    
                    <Link
                      href={`/reservation-success?id=${item.id}`}
                      className="rounded-xl bg-zinc-900 border border-zinc-800 hover:border-purple-500/40 px-3.5 py-2 text-[10px] font-bold text-purple-400 flex items-center gap-1 transition-all"
                    >
                      <span>디지털 티켓 보기</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            ))
          ) : (
            // No Active Reservations
            <div className="py-16 text-center space-y-4 border border-dashed border-zinc-900 rounded-2xl">
              <Ticket className="w-8 h-8 text-zinc-800 mx-auto animate-pulse" />
              <div className="space-y-1">
                <h5 className="text-xs font-bold text-zinc-500">예약 대기 중인 자리가 없습니다</h5>
                <p className="text-[10px] text-zinc-600 leading-relaxed">
                  금요일/토요일 저녁 서면의 빈자리를 선점하여 <br />
                  웨이팅 없이 즉시 입장하세요!
                </p>
              </div>
              <Link 
                href="/" 
                className="inline-flex items-center gap-1 text-[11px] font-bold text-cyan-400 hover:brightness-115 pt-2"
              >
                <span>실시간 서면 빈자리 탐색</span>
                <Flame className="w-3.5 h-3.5 fill-cyan-400 animate-bounce" />
              </Link>
            </div>
          )
        ) : activeTab === 'past' ? (
          // Past Reservations List
          pastReservations.length > 0 ? (
            pastReservations.map((item) => (
              <div 
                key={item.id} 
                className="p-5 rounded-2xl bg-zinc-900/20 border border-zinc-900 text-zinc-550 flex items-center justify-between gap-4 animate-fadeIn"
              >
                <div className="space-y-1.5 truncate max-w-[70%]">
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] font-bold text-zinc-600 tracking-wider bg-zinc-950 px-1.5 py-0.5 rounded">
                      {item.seatLabel}
                    </span>
                    <span className={`text-[8px] font-bold tracking-wider px-1.5 py-0.5 rounded ${
                      item.status === 'canceled' 
                        ? 'text-red-500/50 bg-red-950/10' 
                        : item.status === 'noshow_expired'
                        ? 'text-amber-500/50 bg-amber-950/10'
                        : 'text-zinc-500 bg-zinc-900'
                    }`}>
                      {item.status === 'canceled' ? '취소됨' : item.status === 'noshow_expired' ? '노쇼 마감' : '방문 완료'}
                    </span>
                  </div>
                  
                  <h4 className="text-sm font-bold text-zinc-400 truncate">{item.venueName}</h4>
                  <p className="text-[9px] text-zinc-650 font-mono">
                    {item.createdAt && typeof (item.createdAt as { toDate?: () => Date }).toDate === 'function'
                      ? (item.createdAt as { toDate: () => Date }).toDate().toLocaleDateString()
                      : item.createdAt && (item.createdAt as { seconds?: number }).seconds
                      ? new Date((item.createdAt as { seconds: number }).seconds * 1000).toLocaleDateString()
                      : new Date(item.createdAt as string || Date.now()).toLocaleDateString()}
                  </p>
                </div>

                <div className="text-right text-xs">
                  <span className="text-[9px] font-bold text-zinc-650 block uppercase">금액</span>
                  <span className="font-semibold text-zinc-500 font-mono">5,000원</span>
                </div>
              </div>
            ))
          ) : (
            // No Past Reservations
            <div className="py-12 text-center text-zinc-600 text-xs">
              과거 완료된 이용 내역이 존재하지 않습니다.
            </div>
          )
        ) : (
          // Inner Profile Settings Panel
          <div className="space-y-5 animate-fadeIn">
            {/* User credentials details */}
            <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-850 space-y-4">
              <h4 className="text-xs font-black tracking-widest text-zinc-400 uppercase">인증 계정 세부사항</h4>
              <div className="space-y-3.5 text-xs">
                <div className="flex justify-between items-center py-1.5 border-b border-zinc-850/60">
                  <span className="text-zinc-500">계정 고유 식별자</span>
                  <span className="font-mono text-[10px] text-zinc-400">{user?.uid ? user.uid.substring(0, 16) + '...' : 'demo-user-session'}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-zinc-850/60">
                  <span className="text-zinc-500">인증 제공 파트너</span>
                  {isKakaoAccount ? (
                    <span className="font-bold text-[#191919] bg-[#FEE500] px-2 py-0.5 rounded text-[10px] shadow-[0_0_8px_rgba(254,229,0,0.25)]">
                      카카오 (Kakao Talk)
                    </span>
                  ) : (
                    <span className="font-bold text-purple-400 bg-purple-950/40 px-2 py-0.5 rounded text-[10px] border border-purple-500/20">
                      이메일 / 번호 간편인증
                    </span>
                  )}
                </div>
                <div className="flex justify-between items-center py-1.5">
                  <span className="text-zinc-500">서비스 단골 등급</span>
                  <span className="font-bold text-cyan-400 bg-cyan-950/40 px-2 py-0.5 rounded text-[10px] border border-cyan-500/20 animate-pulse">
                    LV.3 단골손님
                  </span>
                </div>
              </div>
            </div>

            {/* PWA Installer Details Card */}
            <div className="p-5 rounded-2xl bg-zinc-900/60 border border-zinc-850/80 space-y-3.5 relative overflow-hidden">
              <div className="absolute top-[-30px] right-[-30px] w-24 h-24 rounded-full bg-cyan-500/5 blur-2xl pointer-events-none"></div>
              
              <h4 className="text-xs font-black tracking-widest text-cyan-400 uppercase flex items-center gap-1.5">
                <SmartphoneNfc className="w-4 h-4 text-cyan-400 animate-pulse" />
                모바일 앱 설치 지원 (PWA)
              </h4>
              
              <p className="text-[10px] text-zinc-500 leading-relaxed">
                &quot;서면나우&quot;는 네이티브 브라우저 모바일 앱 설치 표준 규격(PWA)을 완벽히 지원합니다. 홈 화면에 추가하시면 오프라인 상태에서도 예약 티켓 조회가 가동됩니다.
              </p>
              
              <div className="bg-zinc-950 p-3.5 rounded-xl border border-zinc-850 space-y-2 text-[10px] text-zinc-400 font-medium">
                <div className="flex gap-2">
                  <span className="text-cyan-400 font-bold">1. 안드로이드 / Chrome:</span>
                  <span>상단 주소창 우측 또는 브라우저 메뉴의 [설치] 또는 [홈 화면에 추가] 단추를 누르세요.</span>
                </div>
                <div className="flex gap-2 pt-1 border-t border-zinc-900">
                  <span className="text-purple-400 font-bold">2. 아이폰 / Safari:</span>
                  <span>하단 중앙의 [공유하기] 단추를 누른 뒤 위로 올려 [홈 화면에 추가] 단추를 누르세요.</span>
                </div>
              </div>
            </div>

            {/* Owner dynamic seeder container inside profile tab */}
            <div className="p-5 rounded-2xl bg-zinc-900/40 border border-zinc-850 space-y-4">
              <div className="flex items-start gap-3">
                <Database className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-white">데이터베이스 데모 재시딩</h4>
                  <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                    서면나우의 원활한 실시간 렌더링 확인을 위해 5곳의 핫플레이스 술집과 40여 개의 빈자리/마감 좌석 정보 구조를 Firestore에 새로 주입합니다.
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
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-zinc-950 border border-zinc-850 hover:border-purple-500/30 px-4 py-3 text-xs font-bold text-white transition-all active:scale-[0.98]"
              >
                <Sparkles className="w-4 h-4 text-purple-400" />
                서면 술집 & 좌석 리셋하기
              </button>
            </div>

            {/* Logout button */}
            {user ? (
              <button
                onClick={() => {
                  logout().then(() => {
                    alert('성공적으로 로그아웃되었습니다.');
                    window.location.href = '/login';
                  });
                }}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-zinc-900/60 border border-zinc-850 text-xs font-bold text-red-400 py-3.5 hover:bg-zinc-800/60 active:scale-[0.99] transition-all"
              >
                <LogOut className="w-4 h-4" />
                로그아웃 (세션 해제)
              </button>
            ) : (
              <Link
                href="/login"
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-500 text-xs font-black text-white py-3.5 hover:brightness-110 active:scale-[0.99] transition-all text-center shadow-[0_0_15px_rgba(168,85,247,0.2)]"
              >
                로그인 및 가입 페이지로 이동
              </Link>
            )}
          </div>
        )}
      </section>

      {/* 4. Bottom Navigation */}
      <BottomNavigation availableCount={globalAvailableSeats.length} />
    </main>
  );
}
