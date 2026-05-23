'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { db } from '@shared/firebase/clientApp';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Reservation, SeatStatus } from '@shared/types';
import { useRealtimeVenues } from '@shared/hooks/useRealtimeVenues';
import { useRealtimeSeats } from '@shared/hooks/useRealtimeSeats';
import { changeSeatStatus, verifyVisitCodeTransaction } from '@shared/firebase/owner';
import { LoadingSpinner } from '@shared/components/LoadingSpinner';
import { 
  Building, 
  Users, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  ClipboardList, 
  LayoutGrid, 
  ShieldCheck, 
  ArrowLeft,
  Calendar,
  Sparkles
} from 'lucide-react';

export default function OwnerDashboardPage() {
  const { venues, loading: venuesLoading } = useRealtimeVenues();
  const [selectedVenueId, setSelectedVenueId] = useState<string>('');
  
  // Set default venue once loaded
  useEffect(() => {
    if (venues.length > 0 && !selectedVenueId) {
      setSelectedVenueId(venues[0].id);
    }
  }, [venues, selectedVenueId]);

  // Subscribe to seats for the selected venue in real-time
  const { seats, loading: seatsLoading } = useRealtimeSeats({ venueId: selectedVenueId });

  // Subscribe to all reservations for the selected venue
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [resLoading, setResLoading] = useState(true);

  useEffect(() => {
    if (!selectedVenueId) return;
    
    setResLoading(true);
    const resCol = collection(db, 'reservations');
    const q = query(resCol, where('venueId', '==', selectedVenueId));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const resData: Reservation[] = [];
      snapshot.forEach((docSnap) => {
        resData.push({ id: docSnap.id, ...docSnap.data() } as Reservation);
      });

      // Sort by creation time descending (newest first)
      resData.sort((a, b) => {
        const tA = a.createdAt
          ? (a.createdAt as { seconds?: number }).seconds || new Date(a.createdAt as string).getTime()
          : 0;
        const tB = b.createdAt
          ? (b.createdAt as { seconds?: number }).seconds || new Date(b.createdAt as string).getTime()
          : 0;
        return tB - tA;
      });

      setReservations(resData);
      setResLoading(false);
    }, (err) => {
      console.error('Error fetching reservations:', err);
      setResLoading(false);
    });

    return () => unsubscribe();
  }, [selectedVenueId]);

  // Visit PIN code input state
  const [pinCode, setPinCode] = useState<string>('');
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkInResult, setCheckInResult] = useState<{ success: boolean; message: string } | null>(null);

  // Seat state mutation loading indicator map
  const [seatMutatingId, setSeatMutatingId] = useState<string | null>(null);

  const handleKeyPress = (val: string) => {
    if (checkingIn) return;
    
    if (val === 'C') {
      setPinCode('');
      setCheckInResult(null);
    } else if (val === 'OK') {
      triggerCheckIn();
    } else {
      if (pinCode.length < 4) {
        setPinCode(prev => prev + val);
        setCheckInResult(null);
      }
    }
  };

  const triggerCheckIn = async () => {
    if (pinCode.length !== 4) {
      alert('4자리 방문 PIN 코드를 기입해 주세요.');
      return;
    }

    setCheckingIn(true);
    setCheckInResult(null);
    try {
      const res = await verifyVisitCodeTransaction(selectedVenueId, pinCode);
      setCheckInResult({
        success: res.success,
        message: res.message
      });

      if (res.success) {
        setPinCode('');
        // Automatically hide success panel after 5 seconds
        setTimeout(() => setCheckInResult(null), 5000);
      }
    } catch (err) {
      console.error(err);
      setCheckInResult({
        success: false,
        message: '방문 체크인 등록 진행 중 오류가 발생했습니다.'
      });
    } finally {
      setCheckingIn(false);
    }
  };

  const handleSeatStatusChange = async (seatId: string, newStatus: SeatStatus) => {
    setSeatMutatingId(seatId);
    try {
      await changeSeatStatus(seatId, newStatus);
    } catch (err) {
      console.error(err);
      alert('좌석 상태 변경에 실패했습니다.');
    } finally {
      setSeatMutatingId(null);
    }
  };

  const getActiveVenue = () => {
    return venues.find(v => v.id === selectedVenueId) || null;
  };

  const getSeatStatusStyle = (status: SeatStatus) => {
    switch (status) {
      case 'available':
        return 'border-emerald-500/20 text-emerald-400 bg-emerald-950/20';
      case 'locked':
        return 'border-amber-500/20 text-amber-400 bg-amber-950/20';
      case 'reserved':
        return 'border-purple-500/20 text-purple-400 bg-purple-950/20';
      case 'occupied':
        return 'border-zinc-800 text-zinc-400 bg-zinc-900/40';
      case 'closed':
      default:
        return 'border-red-950/20 text-red-500 bg-red-950/20';
    }
  };

  const getSeatStatusLabel = (status: SeatStatus) => {
    switch (status) {
      case 'available': return '이용 가능';
      case 'locked': return '선점대기 (5분)';
      case 'reserved': return '예약 확정';
      case 'occupied': return '손님 이용 중';
      case 'closed': return '이용 불가';
      default: return '미지정';
    }
  };

  const isGlobalLoading = venuesLoading || !selectedVenueId;
  const activeVenue = getActiveVenue();

  if (isGlobalLoading) {
    return <LoadingSpinner fullPage message="업주 대시보드를 구축하고 있습니다..." />;
  }

  return (
    <main className="min-h-screen bg-[#0B0B0C] text-white pb-24 relative max-w-4xl mx-auto shadow-2xl border-x border-zinc-900">
      
      {/* Background Neon Orbs */}
      <div className="absolute top-[-80px] right-[-80px] w-96 h-96 rounded-full bg-purple-500/5 blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[100px] left-[-80px] w-96 h-96 rounded-full bg-cyan-500/5 blur-[120px] pointer-events-none"></div>

      {/* 1. Header Banner */}
      <header className="sticky top-0 z-30 px-6 py-4 bg-zinc-950/80 border-b border-zinc-900 backdrop-blur-md flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition-all">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <span className="text-[9px] font-black tracking-widest text-purple-400 uppercase bg-purple-950/40 px-2 py-0.5 rounded border border-purple-500/20">
              OWNER CHANNEL (실시간)
            </span>
            <h1 className="text-base font-black tracking-tight text-white mt-0.5">서면 예약 관리 센터</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-[10px] text-zinc-550 font-bold font-mono">FIRESTORE SYNC ACTIVE</span>
        </div>
      </header>

      {/* 2. Venue Switcher Board (Touch Friendly Slider) */}
      <section className="px-6 mt-6">
        <h3 className="text-xs font-black tracking-widest text-zinc-500 uppercase mb-3 flex items-center gap-1.5">
          <Building className="w-4 h-4 text-purple-400" />
          관리 대상 매장 선택
        </h3>
        
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none snap-x">
          {venues.map((v) => (
            <button
              key={v.id}
              onClick={() => {
                setSelectedVenueId(v.id);
                setPinCode('');
                setCheckInResult(null);
              }}
              className={`p-4 rounded-2xl border text-left flex-shrink-0 transition-all duration-300 w-44 flex flex-col justify-between snap-start ${
                selectedVenueId === v.id
                  ? 'bg-purple-950/20 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.15)] text-white'
                  : 'bg-zinc-900/40 border-zinc-850 hover:border-zinc-800 text-zinc-500 hover:text-zinc-400'
              }`}
            >
              <span className={`text-[9px] font-bold uppercase tracking-wider block ${selectedVenueId === v.id ? 'text-purple-400' : 'text-zinc-650'}`}>
                {v.category}
              </span>
              <span className="text-sm font-black truncate w-full mt-2 block">{v.name}</span>
            </button>
          ))}
        </div>
      </section>

      {/* 3. Grid Details Grid (Left/Right split on tablets) */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 px-6 mt-6">
        
        {/* Left Column: Guest PIN Code check-in (Spans 2 columns) */}
        <div className="md:col-span-2 space-y-6">
          
          <div className="p-6 rounded-3xl bg-zinc-900/60 border border-zinc-850 backdrop-blur-md space-y-4">
            <h4 className="text-xs font-black tracking-widest text-zinc-400 uppercase flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              모바일 방문 코드 고속 확인
            </h4>

            {/* Glowing input box */}
            <div className="py-3 px-4 rounded-xl bg-zinc-950 border border-zinc-850 text-center relative overflow-hidden shadow-inner">
              <span className="text-3xl font-black font-mono tracking-[0.4em] pl-[0.4em] text-emerald-400 filter drop-shadow-[0_0_6px_rgba(52,211,153,0.35)] min-h-[36px] block">
                {pinCode.padEnd(4, '_')}
              </span>
            </div>

            {/* Custom Neon Keypad grid */}
            <div className="grid grid-cols-3 gap-2 max-w-[280px] mx-auto pt-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'OK'].map((btn) => (
                <button
                  key={btn}
                  onClick={() => handleKeyPress(btn)}
                  disabled={checkingIn}
                  className={`py-3 rounded-xl border flex items-center justify-center font-extrabold text-sm transition-all duration-150 active:scale-[0.93] ${
                    btn === 'OK'
                      ? 'bg-emerald-500 text-black border-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                      : btn === 'C'
                      ? 'bg-zinc-850 text-red-400 border-zinc-800 hover:bg-zinc-800'
                      : 'bg-zinc-900 border-zinc-850 text-white hover:bg-zinc-850 hover:border-zinc-800'
                  }`}
                >
                  {btn}
                </button>
              ))}
            </div>

            {/* Check-in transactional result dialog */}
            {checkInResult && (
              <div className={`p-4 rounded-2xl border text-xs flex gap-2.5 animate-fadeIn ${
                checkInResult.success 
                  ? 'bg-emerald-950/20 border-emerald-500/20 text-emerald-400' 
                  : 'bg-red-950/20 border-red-500/20 text-red-400'
              }`}>
                {checkInResult.success ? (
                  <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-400" />
                ) : (
                  <XCircle className="w-5 h-5 flex-shrink-0 text-red-400" />
                )}
                <span className="font-semibold leading-normal">{checkInResult.message}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Realtime Seats Board (Spans 3 columns) */}
        <div className="md:col-span-3 space-y-6">
          <div className="p-6 rounded-3xl bg-zinc-900/60 border border-zinc-850 backdrop-blur-md">
            
            <div className="flex justify-between items-center border-b border-zinc-850 pb-3 mb-4">
              <h4 className="text-xs font-black tracking-widest text-zinc-400 uppercase flex items-center gap-1.5">
                <LayoutGrid className="w-4 h-4 text-purple-400 animate-pulse" />
                테이블 이용 현황 및 퀵 제어 ({seats.length})
              </h4>
              <span className="text-[9px] text-zinc-650 font-bold uppercase">{activeVenue?.name}</span>
            </div>

            {seatsLoading ? (
              <div className="py-12">
                <LoadingSpinner />
              </div>
            ) : seats.length > 0 ? (
              <div className="space-y-3.5 max-h-[500px] overflow-y-auto pr-1 scrollbar-thin">
                {seats.map((seat) => (
                  <div 
                    key={seat.id} 
                    className="p-4 rounded-2xl bg-zinc-950/60 border border-zinc-850/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 relative transition-all"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{seat.label}</span>
                        <span className={`text-[8px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${getSeatStatusStyle(seat.status)}`}>
                          {getSeatStatusLabel(seat.status)}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-3 text-[10px] text-zinc-550">
                        <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5 text-zinc-650" />수용 {seat.capacity}인</span>
                        {seat.status === 'available' && (
                          <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-zinc-650" />비어있음</span>
                        )}
                        {seat.status === 'locked' && (
                          <span className="text-amber-500 font-medium">선점 진행 중...</span>
                        )}
                        {seat.status === 'reserved' && (
                          <span className="text-purple-400 font-semibold">입장 대기</span>
                        )}
                      </div>
                    </div>

                    {/* Touch Action Status controllers */}
                    <div className="flex gap-1.5 self-end sm:self-center">
                      {[
                        { id: 'available', name: '열기', color: 'hover:bg-emerald-500 hover:text-black border-emerald-950/40 text-emerald-500/80 bg-emerald-950/10' },
                        { id: 'occupied', name: '점유', color: 'hover:bg-zinc-700 hover:text-white border-zinc-800 text-zinc-400 bg-zinc-900/20' },
                        { id: 'closed', name: '마감', color: 'hover:bg-red-500 hover:text-black border-red-950/30 text-red-500/80 bg-red-950/10' }
                      ].map((item) => (
                        <button
                          key={item.id}
                          onClick={() => handleSeatStatusChange(seat.id, item.id as SeatStatus)}
                          disabled={seatMutatingId === seat.id || seat.status === 'locked'}
                          className={`px-3 py-1.5 rounded-lg border text-[10px] font-black transition-all ${item.color} ${
                            seat.status === item.id 
                              ? 'bg-zinc-800 text-white border-purple-500/30 pointer-events-none ring-1 ring-purple-500/20' 
                              : ''
                          } disabled:opacity-30 disabled:cursor-not-allowed`}
                        >
                          {item.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-zinc-650 text-xs border border-dashed border-zinc-850 rounded-2xl">
                등록된 좌석 정보가 존재하지 않습니다.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. Today's Bookings Feed (Full screen spanning board) */}
      <section className="px-6 mt-6">
        <div className="p-6 rounded-3xl bg-zinc-900/60 border border-zinc-850 backdrop-blur-md">
          
          <div className="flex justify-between items-center border-b border-zinc-850 pb-3 mb-4">
            <h4 className="text-xs font-black tracking-widest text-zinc-400 uppercase flex items-center gap-1.5">
              <ClipboardList className="w-4 h-4 text-purple-400" />
              실시간 예약 및 체크인 스트림
            </h4>
            <span className="text-[9px] text-zinc-550 font-bold uppercase">TODAY FEED</span>
          </div>

          {resLoading ? (
            <div className="py-12">
              <LoadingSpinner />
            </div>
          ) : reservations.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-850 text-zinc-550 font-bold">
                    <th className="py-3 pr-4">테이블</th>
                    <th className="py-3 px-4">예약고객</th>
                    <th className="py-3 px-4">방문코드</th>
                    <th className="py-3 px-4 text-right">예약금</th>
                    <th className="py-3 px-4">등록시각</th>
                    <th className="py-3 pl-4">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-850/60 text-zinc-400 font-medium">
                  {reservations.map((item) => (
                    <tr key={item.id} className="hover:bg-zinc-950/20 transition-all">
                      <td className="py-3.5 pr-4 font-bold text-white">{item.seatLabel}</td>
                      <td className="py-3.5 px-4 font-mono text-zinc-550">{item.userId === 'demo-user' ? '데모손님' : item.userId.substring(0, 6)}</td>
                      <td className="py-3.5 px-4 font-black font-mono text-emerald-400">{item.visitCode}</td>
                      <td className="py-3.5 px-4 text-right font-mono text-zinc-400">5,000원</td>
                      <td className="py-3.5 px-4 text-[10px] font-mono text-zinc-550">
                        {item.createdAt && typeof (item.createdAt as { toDate?: () => Date }).toDate === 'function'
                          ? (item.createdAt as { toDate: () => Date }).toDate().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
                          : item.createdAt && (item.createdAt as { seconds?: number }).seconds
                          ? new Date((item.createdAt as { seconds: number }).seconds * 1000).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
                          : new Date(item.createdAt as string || Date.now()).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-3.5 pl-4">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${
                          item.status === 'confirmed'
                            ? 'text-purple-400 border-purple-500/20 bg-purple-950/20 shadow-[0_0_8px_rgba(168,85,247,0.05)]'
                            : item.status === 'used'
                            ? 'text-emerald-400 border-emerald-500/20 bg-emerald-950/20'
                            : 'text-zinc-500 border-zinc-850 bg-zinc-900/30'
                        }`}>
                          {item.status === 'confirmed' ? '입장 대기' : item.status === 'used' ? '입장 완료' : '예약 취소'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-zinc-650 text-xs border border-dashed border-zinc-850 rounded-2xl space-y-2">
              <Calendar className="w-8 h-8 text-zinc-800 mx-auto animate-pulse" />
              <p className="font-bold">오늘 접수된 테이블 예약 신청이 없습니다.</p>
              <p className="text-[10px] text-zinc-650">실시간 사용자 PWA 앱에서 선점 예약을 완료하면 여기에 피드가 들어옵니다!</p>
            </div>
          )}
        </div>
      </section>

      {/* Floating Sparkle indicator inside Owner Page */}
      <div className="fixed bottom-6 right-6 z-50">
        <Link 
          href="/" 
          className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-3 text-xs font-black text-white hover:brightness-110 shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-all active:scale-[0.95]"
        >
          <Sparkles className="w-4 h-4 fill-white" />
          <span>사용자 앱 바로가기</span>
        </Link>
      </div>
    </main>
  );
}
