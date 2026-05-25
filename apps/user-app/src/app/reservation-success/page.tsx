'use client';

import React, { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { db } from '@shared/firebase/clientApp';
import { doc, getDoc } from 'firebase/firestore';
import { Reservation } from '@shared/types';
import { LoadingSpinner } from '@shared/components/LoadingSpinner';
import { CheckCircle2, MapPin, ClipboardCheck, ArrowRight, Home, Calendar } from 'lucide-react';

function ReservationSuccessContent() {
  const searchParams = useSearchParams();
  const reservationId = searchParams.get('id');
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReservation = async () => {
      if (!reservationId) {
        setLoading(false);
        return;
      }
      try {
        const docRef = doc(db, 'reservations', reservationId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setReservation({ id: docSnap.id, ...docSnap.data() } as Reservation);
        }
      } catch (err) {
        console.error('Error fetching reservation details:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchReservation();
  }, [reservationId]);

  if (loading) {
    return <LoadingSpinner fullPage message="영수증 정보를 발급하고 있습니다..." />;
  }

  if (!reservation) {
    return (
      <main className="min-h-screen bg-[#0B0B0C] text-white flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-xl font-bold text-red-400">예약 내역을 찾을 수 없습니다</h2>
        <p className="text-xs text-zinc-500 mt-2">유효하지 않거나 만료된 예약 번호입니다.</p>
        <Link href="/" className="mt-6 rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-xs text-purple-400 font-bold">
          &larr; 홈으로 돌아가기
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0B0B0C] text-white pb-16 max-w-md mx-auto relative shadow-2xl border-x border-zinc-900 flex flex-col items-center justify-center p-6">
      
      {/* Background Orbs */}
      <div className="absolute top-[20%] left-[50%] -translate-x-1/2 w-64 h-64 rounded-full bg-emerald-500/10 blur-[80px] pointer-events-none"></div>

      {/* 1. Success Indicator */}
      <div className="text-center space-y-3 z-10">
        <div className="w-16 h-16 rounded-full bg-emerald-950/60 border border-emerald-500/30 flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(16,185,129,0.2)] animate-bounce">
          <CheckCircle2 className="w-9 h-9 text-emerald-400" />
        </div>
        <div className="space-y-1">
          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest bg-emerald-950/50 px-2.5 py-0.5 rounded border border-emerald-500/20">
            PAYMENT CONFIRMED
          </span>
          <h2 className="text-xl font-black text-white pt-1">실시간 테이블 예약 완료!</h2>
          <p className="text-xs text-zinc-500">서면 실시간 100% 매칭 세션이 성공적으로 잠겼습니다.</p>
        </div>
      </div>

      {/* 2. Premium Ticket Voucher */}
      <div className="w-full mt-8 rounded-3xl bg-zinc-900/60 border border-zinc-800 backdrop-blur-md overflow-hidden relative shadow-lg z-10">
        {/* Top Segment */}
        <div className="p-6 border-b border-dashed border-zinc-800/80 space-y-1 text-center">
          <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider block">예약된 술집</span>
          <h3 className="text-lg font-extrabold text-white">{reservation.venueName}</h3>
          
          <div className="flex items-center justify-center gap-1 text-[10px] text-zinc-500 pt-1">
            <MapPin className="w-3 h-3 text-zinc-600" />
            <span>부산진구 서면 핫플레이스</span>
          </div>
        </div>

        {/* Ticket Circle Cutouts (Left & Right) */}
        <div className="absolute left-[-10px] top-[148px] w-5 h-5 rounded-full bg-[#0B0B0C] border-r border-zinc-800"></div>
        <div className="absolute right-[-10px] top-[148px] w-5 h-5 rounded-full bg-[#0B0B0C] border-l border-zinc-800"></div>

        {/* Bottom Segment: Staff Pin Code Area */}
        <div className="p-6 text-center space-y-4">
          <div className="space-y-1.5">
            <span className="text-[9px] font-bold text-purple-400 uppercase tracking-widest block">방문 확인용 코드</span>
            
            {/* Massive Glowing Neon 4-digit code */}
            <div className="inline-block py-2.5 px-6 rounded-2xl bg-zinc-950/80 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.05)]">
              <span className="text-3xl font-black tracking-[0.25em] text-emerald-400 pl-[0.25em] filter drop-shadow-[0_0_6px_rgba(52,211,153,0.3)] font-mono">
                {reservation.visitCode}
              </span>
            </div>

            {/* Premium Glowing scanable QR Code */}
            <div className="py-4 flex justify-center items-center">
              <div className="p-3 rounded-2xl bg-white border border-purple-500/30 shadow-[0_0_20px_rgba(168,85,247,0.25)] relative overflow-hidden animate-fadeIn">
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(
                    JSON.stringify({ reservationId: reservation.id, visitCode: reservation.visitCode })
                  )}`}
                  alt="QR Visit Code"
                  className="w-36 h-36 object-contain"
                />
              </div>
            </div>
            
            <p className="text-[10px] font-semibold text-zinc-500 pt-1 flex items-center justify-center gap-1 animate-pulse">
              <ClipboardCheck className="w-3.5 h-3.5 text-zinc-500" />
              “직원에게 이 QR 코드나 방문 코드를 보여주세요”
            </p>
          </div>

          {/* Details Table */}
          <div className="border-t border-zinc-800/60 pt-4 text-xs space-y-2.5 text-left text-zinc-400">
            <div className="flex justify-between">
              <span>선점된 테이블 명</span>
              <span className="font-bold text-white">{reservation.seatLabel}</span>
            </div>
            <div className="flex justify-between">
              <span>보증 예약금 (Mock)</span>
              <span className="font-bold text-white">5,000원 (방문 시 전액 공제)</span>
            </div>
            <div className="flex justify-between">
              <span>예약 생성 시각</span>
              <span className="font-mono text-zinc-500">
                {reservation.createdAt && typeof (reservation.createdAt as { toDate?: () => Date }).toDate === 'function'
                  ? (reservation.createdAt as { toDate: () => Date }).toDate().toLocaleString('ko-KR', { hour12: false })
                  : reservation.createdAt && (reservation.createdAt as { seconds?: number }).seconds
                  ? new Date((reservation.createdAt as { seconds: number }).seconds * 1000).toLocaleString('ko-KR', { hour12: false })
                  : new Date(reservation.createdAt as string || Date.now()).toLocaleString('ko-KR', { hour12: false })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Next Action Navigation */}
      <div className="w-full mt-8 space-y-3 z-10">
        <Link 
          href="/profile" 
          className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 py-3 text-xs font-black text-white hover:brightness-110 transition-all hover:shadow-[0_0_15px_rgba(168,85,247,0.2)] active:scale-[0.98]"
        >
          <Calendar className="w-4 h-4" />
          <span>내 예약 내역 확인하기</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
        
        <Link 
          href="/" 
          className="w-full flex items-center justify-center gap-2 rounded-2xl bg-zinc-900 border border-zinc-800 py-3 text-xs font-bold text-zinc-400 hover:text-white transition-colors active:scale-[0.98]"
        >
          <Home className="w-4 h-4" />
          <span>홈으로 돌아가기</span>
        </Link>
      </div>
    </main>
  );
}

export default function ReservationSuccessPage() {
  return (
    <Suspense fallback={<LoadingSpinner fullPage message="로딩 중..." />}>
      <ReservationSuccessContent />
    </Suspense>
  );
}
