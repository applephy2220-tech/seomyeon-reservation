'use client';

import React, { use, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { db } from '@shared/firebase/clientApp';
import { doc, onSnapshot } from 'firebase/firestore';
import { Seat } from '@shared/types';
import { useRealtimeVenueDetail } from '@shared/hooks/useRealtimeVenues';
import { LoadingSpinner } from '@shared/components/LoadingSpinner';
import { releaseSeat, confirmMockPaymentTransaction } from '@shared/firebase/booking';
import { 
  ArrowLeft, 
  Clock, 
  CreditCard, 
  ShieldCheck, 
  AlertCircle, 
  Info
} from 'lucide-react';

interface ReservationPageProps {
  params: Promise<{ seatId: string }>;
}

export default function ReservationPage({ params }: ReservationPageProps) {
  const resolvedParams = use(params);
  const seatId = resolvedParams.seatId;
  const router = useRouter();

  const [seat, setSeat] = useState<Seat | null>(null);
  const [seatLoading, setSeatLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState<number>(300); // 5 minutes default
  const [selectedMethod, setSelectedMethod] = useState<string>('card');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expiredNotification, setExpiredNotification] = useState(false);

  // Subscribe to the specific seat document in real-time
  useEffect(() => {
    if (!seatId) return;

    const seatRef = doc(db, 'seats', seatId);
    const unsubscribe = onSnapshot(seatRef, (docSnap) => {
      if (docSnap.exists()) {
        const seatData = { id: docSnap.id, ...docSnap.data() } as Seat;
        setSeat(seatData);
        
        // Ensure user belongs to this lock (mock UID is 'demo-user')
        if (seatData.status === 'locked' && seatData.lockedBy !== 'demo-user') {
          alert('올바르지 않은 예약 세션입니다.');
          router.replace('/');
        }
      } else {
        alert('좌석 정보를 찾을 수 없습니다.');
        router.replace('/');
      }
      setSeatLoading(false);
    }, (err) => {
      console.error('Error fetching seat detail:', err);
      setSeatLoading(false);
    });

    return () => unsubscribe();
  }, [seatId, router]);

  // Fetch venue detail using custom hook
  const { venue, loading: venueLoading } = useRealtimeVenueDetail(seat?.venueId || '');

  // 5-minute Countdown Timer logic
  useEffect(() => {
    if (!seat || seat.status !== 'locked' || !seat.lockExpiresAt) return;

    const calculateTimeRemaining = () => {
      const now = new Date().getTime();
      const expiry = new Date(seat.lockExpiresAt!).getTime();
      const diffSeconds = Math.max(0, Math.floor((expiry - now) / 1000));
      return diffSeconds;
    };

    // Initialize time remaining
    const initialRemaining = calculateTimeRemaining();
    setTimeLeft(initialRemaining);

    if (initialRemaining <= 0) {
      handleTimeExpired();
      return;
    }

    const timer = setInterval(() => {
      const remaining = calculateTimeRemaining();
      setTimeLeft(remaining);

      if (remaining <= 0) {
        clearInterval(timer);
        handleTimeExpired();
      }
    }, 1000);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seat]);

  const handleTimeExpired = async () => {
    if (expiredNotification) return;
    setExpiredNotification(true);
    
    // Safety release
    if (seatId) {
      await releaseSeat(seatId);
    }
    
    alert('예약 대기 시간이 만료되었습니다. 홈 화면으로 이동합니다.');
    router.replace('/');
  };

  const handleCancel = async () => {
    if (confirm('예약을 취소하시겠습니까? 좌석 선점이 해제됩니다.')) {
      setIsSubmitting(true);
      if (seatId) {
        await releaseSeat(seatId);
      }
      router.replace('/');
    }
  };

  const handlePayment = async () => {
    if (!seat || !venue) return;

    setIsSubmitting(true);
    try {
      const res = await confirmMockPaymentTransaction(
        seat.id,
        venue.id,
        venue.name,
        seat.label,
        'demo-user' // Mock authenticated user UID
      );

      if (res.success && res.reservationId) {
        // Redirect to success screen with reservation identifier
        router.replace(`/reservation-success?id=${res.reservationId}`);
      } else {
        alert(res.message || '결제 진행 중 오류가 발생했습니다.');
        setIsSubmitting(false);
      }
    } catch (err) {
      console.error('Payment error:', err);
      alert('결제 처리 중 예상치 못한 오류가 발생했습니다.');
      setIsSubmitting(false);
    }
  };

  // Format seconds to MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (seatLoading || venueLoading) {
    return <LoadingSpinner fullPage message="예약 정보를 안전하게 로드하는 중..." />;
  }

  if (!seat || !venue) {
    return (
      <main className="min-h-screen bg-[#0B0B0C] text-white flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <h2 className="text-xl font-bold">오류가 발생했습니다</h2>
        <p className="text-xs text-zinc-500 mt-2">좌석 또는 가게의 유효 정보를 찾지 못했습니다.</p>
        <Link href="/" className="mt-6 rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-xs text-purple-400 font-bold">
          홈으로 돌아가기
        </Link>
      </main>
    );
  }

  // Progress percentage for visual timer
  const progressPercent = Math.min(100, Math.max(0, (timeLeft / 300) * 100));

  return (
    <main className="min-h-screen bg-[#0B0B0C] text-white pb-24 max-w-md mx-auto relative shadow-2xl border-x border-zinc-900">
      {/* 1. Header */}
      <div className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-zinc-950/70 border-b border-zinc-900 backdrop-blur-md">
        <button 
          onClick={handleCancel}
          className="p-2 rounded-xl bg-zinc-900/50 border border-zinc-800 text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className="text-xs font-bold text-zinc-400 tracking-wider">안전 결제 선점</span>
        <div className="w-8"></div>
      </div>

      {/* 2. Lock Expiry Floating Banner */}
      <div className="p-4 mx-6 mt-6 rounded-2xl bg-amber-950/10 border border-amber-500/20 backdrop-blur-md space-y-3 relative overflow-hidden">
        <div className="flex justify-between items-center">
          <span className="text-xs text-amber-400 font-bold tracking-tight flex items-center gap-1.5 animate-pulse">
            <Clock className="w-4 h-4" />
            선점 만료 대기 시간
          </span>
          <span className="text-lg font-black font-mono text-amber-400 tracking-wider">
            {formatTime(timeLeft)}
          </span>
        </div>
        
        {/* Animated neon progress bar */}
        <div className="w-full bg-zinc-950 rounded-full h-1.5 overflow-hidden border border-zinc-900">
          <div 
            className="bg-gradient-to-r from-amber-500 to-orange-500 h-1.5 transition-all duration-1000 ease-linear rounded-full shadow-[0_0_10px_rgba(245,158,11,0.5)]" 
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <p className="text-[10px] text-zinc-500 leading-normal">
          5분 이내 결제하지 않으면, 다른 대기 사용자들을 위해 선점이 자동 해제되며 해당 테이블이 즉시 오픈됩니다.
        </p>
      </div>

      {/* 3. Ticket Detail Card */}
      <div className="mx-6 mt-6 rounded-3xl bg-zinc-900/60 border border-zinc-800 backdrop-blur-md overflow-hidden relative">
        <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/10 blur-[30px] rounded-full"></div>
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-cyan-500/10 blur-[30px] rounded-full"></div>
        
        {/* Ticket Header */}
        <div className="p-5 border-b border-dashed border-zinc-800/80 space-y-1 relative">
          <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest bg-purple-950/40 px-2 py-0.5 rounded border border-purple-500/20">
            SEOMYEON DIGITAL TICKET
          </span>
          <h3 className="text-lg font-black text-white pt-1">{venue.name}</h3>
          <p className="text-[10px] text-zinc-500">{venue.address}</p>
        </div>

        {/* Ticket Body */}
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">선택한 테이블</span>
              <p className="text-sm font-bold text-white">{seat.label}</p>
            </div>
            <div className="space-y-1">
              <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">이용 인원수</span>
              <p className="text-sm font-bold text-white">최대 {seat.capacity}명 수용</p>
            </div>
          </div>

          <div className="pt-3 border-t border-zinc-800/60 flex justify-between items-center">
            <div className="space-y-1">
              <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">실시간 예약 매칭금</span>
              <div className="flex items-baseline gap-1">
                <span className="text-base font-black text-emerald-400">5,000</span>
                <span className="text-xs font-bold text-emerald-400">원</span>
              </div>
            </div>
            <span className="text-[10px] text-zinc-500 bg-zinc-950/80 px-2.5 py-1 rounded border border-zinc-800">
              현장 100% 공제 차감
            </span>
          </div>
        </div>
      </div>

      {/* 4. Payment Selection (Mock) */}
      <section className="mt-8 px-6 space-y-3">
        <h4 className="text-xs font-black tracking-widest text-zinc-400 uppercase flex items-center gap-1.5">
          <CreditCard className="w-4 h-4 text-purple-400" />
          간편 안전 결제 수단
        </h4>

        <div className="grid grid-cols-2 gap-3">
          {[
            { id: 'card', name: '신용/체크카드', logo: '💳' },
            { id: 'toss', name: '토스페이', logo: '🔵' },
            { id: 'kakao', name: '카카오페이', logo: '🟡' },
            { id: 'naver', name: '네이버페이', logo: '🟢' }
          ].map((method) => (
            <button
              key={method.id}
              onClick={() => setSelectedMethod(method.id)}
              className={`p-3.5 rounded-xl border flex items-center justify-between transition-all duration-300 font-bold text-xs ${
                selectedMethod === method.id
                  ? 'bg-purple-950/20 border-purple-500 text-white shadow-[0_0_15px_rgba(168,85,247,0.1)]'
                  : 'bg-zinc-900/40 border-zinc-800 text-zinc-400 hover:text-zinc-300 hover:border-zinc-700'
              }`}
            >
              <span className="flex items-center gap-2">
                <span>{method.logo}</span>
                <span>{method.name}</span>
              </span>
              {selectedMethod === method.id && (
                <div className="w-2.5 h-2.5 rounded-full bg-purple-500" />
              )}
            </button>
          ))}
        </div>
      </section>

      {/* 5. Policy Notice */}
      <div className="mx-6 mt-6 p-4 rounded-xl bg-zinc-900/20 border border-zinc-850 flex gap-3 text-xs">
        <Info className="w-5 h-5 text-zinc-500 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h5 className="font-bold text-zinc-400">결제 공지 및 약관</h5>
          <p className="text-[10px] text-zinc-500 leading-normal">
            예약금 5,000원은 방문 확정 시 매장 총결제 금액에서 전액 공제 처리됩니다. 노쇼 방지를 위해 입장 예정 시간에서 30분이 지나면 노쇼로 확정되어 예약이 자동 마감됩니다.
          </p>
        </div>
      </div>

      {/* 6. Dynamic Floating Action Trigger */}
      <div className="fixed bottom-0 left-0 right-0 z-40 p-4 bg-zinc-950/80 border-t border-zinc-900 backdrop-blur-lg max-w-md mx-auto">
        <div className="flex gap-3">
          <button
            onClick={handleCancel}
            disabled={isSubmitting}
            className="flex-1 rounded-xl bg-zinc-900 border border-zinc-800 py-3 text-xs font-bold text-zinc-400 hover:text-white transition-colors active:scale-[0.98] disabled:opacity-50"
          >
            선점 취소
          </button>
          <button
            onClick={handlePayment}
            disabled={isSubmitting}
            className="flex-[2] rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 py-3 text-xs font-black text-white hover:brightness-110 shadow-[0_0_20px_rgba(168,85,247,0.3)] transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {isSubmitting ? (
              <span>결제 승인 중...</span>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>5,000원 결제 완료하기</span>
              </>
            )}
          </button>
        </div>
      </div>
    </main>
  );
}
