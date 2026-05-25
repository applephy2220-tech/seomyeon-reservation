'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { db } from '@shared/firebase/clientApp';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Seat, Reservation, SeatStatus } from '@shared/types';
import { useRealtimeVenues } from '@shared/hooks/useRealtimeVenues';
import { useRealtimeSeats } from '@shared/hooks/useRealtimeSeats';
import { changeSeatStatus, verifyVisitCodeTransaction, cancelReservationAsNoShow } from '@shared/firebase/owner';
import { createDealTransaction, cancelDealTransaction, useRealtimeDeals } from '@shared/firebase/deals';
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

const OwnerDealCountdown = ({ validUntil }: { validUntil: string }) => {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const calculateTime = () => {
      const now = new Date();
      const target = new Date(validUntil);
      const diffMs = target.getTime() - now.getTime();
      if (diffMs <= 0) {
        setTimeLeft('만료됨');
        return;
      }
      const mins = Math.floor(diffMs / 1000 / 60);
      const secs = Math.floor((diffMs / 1000) % 60);
      setTimeLeft(`${mins}분 ${secs.toString().padStart(2, '0')}초 남음`);
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [validUntil]);

  return (
    <span className="font-extrabold text-orange-400 font-mono text-xs">
      {timeLeft}
    </span>
  );
};

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

  // Subscribe to active deals for the selected venue in real-time
  const { deals: activeDeals } = useRealtimeDeals({ venueId: selectedVenueId, onlyActive: true });

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

  // Background loop: check for expired (no-show) reservations (> 30 mins elapsed)
  // We use a ref to prevent recreating setInterval when reservations state updates.
  const reservationsRef = React.useRef<Reservation[]>(reservations);
  React.useEffect(() => {
    reservationsRef.current = reservations;
  }, [reservations]);

  // Keep track of processing reservation IDs to prevent redundant trigger loops
  const processingNoShowIdsRef = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const currentReservations = reservationsRef.current;

      currentReservations.forEach((item) => {
        // Only target active 'confirmed' status
        if (item.status !== 'confirmed') return;

        // If it's already in processing list, skip to avoid double updates
        if (processingNoShowIdsRef.current.has(item.id)) return;

        try {
          const visitTime = new Date(item.visitTime);
          const diffMs = now.getTime() - visitTime.getTime();
          const thirtyMinutes = 30 * 60 * 1000;

          if (diffMs > thirtyMinutes) {
            console.log(`Auto No-Show Check: Reservation ${item.id} is past the 30-min threshold. Canceling...`);
            
            // Mark as processing
            processingNoShowIdsRef.current.add(item.id);

            // Execute transactional atomic cancel
            cancelReservationAsNoShow(item.id, item.seatId)
              .catch((err) => {
                console.error(`Auto no-show cancellation failed for ${item.id}:`, err);
                // On error, remove it from processing list so it can retry later
                processingNoShowIdsRef.current.delete(item.id);
              });
          }
        } catch (err) {
          console.error(`Failed to process no-show calculation for ${item.id}:`, err);
        }
      });
    }, 10000); // Check every 10 seconds

    return () => clearInterval(timer);
  }, []);

  // Visit PIN code input state
  const [pinCode, setPinCode] = useState<string>('');
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkInResult, setCheckInResult] = useState<{ success: boolean; message: string } | null>(null);

  // Seat state mutation loading indicator map
  const [seatMutatingId, setSeatMutatingId] = useState<string | null>(null);

  // Advanced Seating Open Modal States
  const [openModalSeat, setOpenModalSeat] = useState<Seat | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<number>(60); // Default 60 minutes
  const [selectedTag, setSelectedTag] = useState<string>(''); // Default no tag

  // Emergency Deal Modal States
  const [openDealModalSeat, setOpenDealModalSeat] = useState<Seat | null>(null);
  const [dealTitle, setDealTitle] = useState<string>('초긴급 혜택 딜!');
  const [dealDescription, setDealDescription] = useState<string>('지금 테이블을 선점 예약하고 특별한 혜택을 챙기세요.');
  const [dealBenefitType, setDealBenefitType] = useState<'service' | 'discount' | 'time_limit'>('service');
  const [dealBenefitValue, setDealBenefitValue] = useState('하이볼 1잔 서비스');
  const [dealDurationMinutes, setDealDurationMinutes] = useState<number>(30); // 30 minutes active by default

  const handleCreateDealClick = (seat: Seat) => {
    setOpenDealModalSeat(seat);
    // Preset values
    setDealTitle('초긴급 혜택 딜!');
    setDealDescription('지금 테이블을 선점 예약하고 특별한 혜택을 챙기세요.');
    setDealBenefitType('service');
    setDealBenefitValue('하이볼 1잔 서비스');
    setDealDurationMinutes(30);
  };

  const handleCancelDealClick = async (dealId: string, seatId: string) => {
    if (!confirm('이 좌석에 설정된 긴급딜을 회수하시겠습니까?')) return;
    
    setSeatMutatingId(seatId);
    try {
      const res = await cancelDealTransaction(dealId, seatId);
      alert(res.message);
    } catch (err) {
      console.error(err);
      alert('긴급딜 회수 처리에 실패했습니다.');
    } finally {
      setSeatMutatingId(null);
    }
  };

  const handleConfirmCreateDeal = async () => {
    if (!openDealModalSeat) return;

    setSeatMutatingId(openDealModalSeat.id);
    try {
      const now = new Date();
      const expiry = new Date(now.getTime() + dealDurationMinutes * 60 * 1000);
      const validUntil = expiry.toISOString();

      const res = await createDealTransaction({
        venueId: selectedVenueId,
        seatId: openDealModalSeat.id,
        title: dealTitle,
        description: dealDescription,
        benefitType: dealBenefitType,
        benefitValue: dealBenefitValue,
        validUntil
      });

      if (res.success) {
        setOpenDealModalSeat(null);
      } else {
        alert(res.message);
      }
    } catch (err) {
      console.error(err);
      alert('긴급딜 등록에 실패했습니다.');
    } finally {
      setSeatMutatingId(null);
    }
  };

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

  const handleSeatClickOpen = (seat: Seat) => {
    setOpenModalSeat(seat);
    setSelectedTag(`${seat.capacity}인석 바로 입장`);
    setSelectedDuration(60); // Default to 1 hour
  };

  const handleSeatDirectStatusChange = async (seatId: string, newStatus: SeatStatus) => {
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

  const handleConfirmOpenSeat = async () => {
    if (!openModalSeat) return;

    setSeatMutatingId(openModalSeat.id);
    try {
      const now = new Date();
      const expiry = new Date(now.getTime() + selectedDuration * 60 * 1000);
      const availableUntil = expiry.toISOString();

      await changeSeatStatus(
        openModalSeat.id,
        'available',
        availableUntil,
        selectedTag || undefined
      );

      setOpenModalSeat(null);
    } catch (err) {
      console.error(err);
      alert('좌석 개방 설정에 실패했습니다.');
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-white">{seat.label}</span>
                        <span className={`text-[8px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${getSeatStatusStyle(seat.status)}`}>
                          {getSeatStatusLabel(seat.status)}
                        </span>
                        {seat.activeDealId && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-orange-950/60 border border-orange-500/30 px-1.5 py-0.5 text-[8px] font-black text-orange-400 shadow-[0_0_8px_rgba(249,115,22,0.2)] animate-pulse">
                            🔥 긴급딜 진행중
                          </span>
                        )}
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
                    {/* Touch Action Status controllers */}
                    <div className="flex gap-1.5 self-end sm:self-center flex-wrap justify-end">
                      <button
                        onClick={() => handleSeatClickOpen(seat)}
                        disabled={seatMutatingId === seat.id || seat.status === 'locked'}
                        className={`px-3 py-1.5 rounded-lg border text-[10px] font-black transition-all hover:bg-emerald-500 hover:text-black border-emerald-950/40 text-emerald-500/80 bg-emerald-950/10 ${
                          seat.status === 'available' 
                            ? 'bg-zinc-800 text-white border-purple-500/30 pointer-events-none ring-1 ring-purple-500/20' 
                            : ''
                        } disabled:opacity-30 disabled:cursor-not-allowed`}
                      >
                        열기
                      </button>

                      {seat.status === 'available' && !seat.activeDealId && (
                        <button
                          onClick={() => handleCreateDealClick(seat)}
                          disabled={seatMutatingId === seat.id}
                          className="px-3 py-1.5 rounded-lg border text-[10px] font-black transition-all hover:bg-orange-500 hover:text-black border-orange-950/40 text-orange-500 bg-orange-950/15 shadow-[0_0_8px_rgba(249,115,22,0.1)] active:scale-[0.95]"
                        >
                          긴급딜
                        </button>
                      )}

                      {seat.status === 'available' && seat.activeDealId && (
                        <button
                          onClick={() => handleCancelDealClick(seat.activeDealId!, seat.id)}
                          disabled={seatMutatingId === seat.id}
                          className="px-3 py-1.5 rounded-lg border text-[10px] font-black transition-all hover:bg-zinc-700 hover:text-white border-zinc-800 text-zinc-500 bg-zinc-900/30 active:scale-[0.95]"
                        >
                          딜회수
                        </button>
                      )}

                      <button
                        onClick={() => handleSeatDirectStatusChange(seat.id, 'occupied')}
                        disabled={seatMutatingId === seat.id || seat.status === 'locked'}
                        className={`px-3 py-1.5 rounded-lg border text-[10px] font-black transition-all hover:bg-zinc-700 hover:text-white border-zinc-800 text-zinc-400 bg-zinc-900/20 ${
                          seat.status === 'occupied' 
                            ? 'bg-zinc-800 text-white border-purple-500/30 pointer-events-none ring-1 ring-purple-500/20' 
                            : ''
                        } disabled:opacity-30 disabled:cursor-not-allowed`}
                      >
                        점유
                      </button>

                      <button
                        onClick={() => handleSeatDirectStatusChange(seat.id, 'closed')}
                        disabled={seatMutatingId === seat.id || seat.status === 'locked'}
                        className={`px-3 py-1.5 rounded-lg border text-[10px] font-black transition-all hover:bg-red-500 hover:text-black border-red-950/30 text-red-500/80 bg-red-950/10 ${
                          seat.status === 'closed' 
                            ? 'bg-zinc-800 text-white border-purple-500/30 pointer-events-none ring-1 ring-purple-500/20' 
                            : ''
                        } disabled:opacity-30 disabled:cursor-not-allowed`}
                      >
                        마감
                      </button>
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

      {/* 3.5 Active Emergency Deals Live Feed */}
      <section className="px-6 mt-6">
        <div className="p-6 rounded-3xl bg-zinc-900/60 border border-zinc-850 backdrop-blur-md">
          <div className="flex justify-between items-center border-b border-zinc-850 pb-3 mb-4">
            <h4 className="text-xs font-black tracking-widest text-orange-400 uppercase flex items-center gap-1.5 animate-pulse">
              <Sparkles className="w-4 h-4 text-orange-400" />
              🔥 진행 중인 긴급딜 운영 현황 ({activeDeals.length})
            </h4>
            <span className="text-[9px] text-zinc-550 font-bold uppercase">LIVE DEALS</span>
          </div>

          {activeDeals.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-850 text-zinc-550 font-bold">
                    <th className="py-3 pr-4">대상 테이블</th>
                    <th className="py-3 px-4">긴급딜 제목</th>
                    <th className="py-3 px-4">제공 혜택</th>
                    <th className="py-3 px-4">남은 유효시간</th>
                    <th className="py-3 px-4 text-center">딜 소진율 (수량)</th>
                    <th className="py-3 pl-4 text-right">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-850/60 text-zinc-400 font-medium">
                  {activeDeals.map((deal) => {
                    const matchedSeat = seats.find(s => s.id === deal.seatId);
                    return (
                      <tr key={deal.id} className="hover:bg-zinc-950/20 transition-all">
                        <td className="py-3.5 pr-4 font-bold text-white">
                          {matchedSeat ? matchedSeat.label : '지정 좌석'}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-zinc-300">{deal.title}</td>
                        <td className="py-3.5 px-4 font-bold text-amber-300">{deal.benefitValue}</td>
                        <td className="py-3.5 px-4">
                          <OwnerDealCountdown validUntil={deal.validUntil} />
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono font-bold text-orange-400">
                          {deal.usedSlots} / {deal.totalSlots} 자리 소진
                        </td>
                        <td className="py-3.5 pl-4 text-right">
                          <button
                            onClick={() => handleCancelDealClick(deal.id, deal.seatId)}
                            disabled={seatMutatingId === deal.seatId}
                            className="px-3 py-1.5 rounded-lg bg-red-950/30 border border-red-500/30 hover:bg-red-500 hover:text-black transition-all active:scale-[0.95] text-[10px] font-black text-red-400 disabled:opacity-30"
                          >
                            딜 회수
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-zinc-650 text-xs border border-dashed border-zinc-850 rounded-2xl space-y-2">
              <Clock className="w-8 h-8 text-zinc-850 mx-auto animate-pulse" />
              <p className="font-bold">현재 진행 중인 실시간 긴급딜이 없습니다.</p>
              <p className="text-[10px] text-zinc-650">위 테이블 현황에서 [available] 상태의 테이블에 대해 &quot;긴급딜&quot; 버튼을 눌러보세요!</p>
            </div>
          )}
        </div>
      </section>

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
                            : item.status === 'noshow_expired'
                            ? 'text-amber-400 border-amber-500/20 bg-amber-950/20'
                            : 'text-zinc-500 border-zinc-850 bg-zinc-900/30'
                        }`}>
                          {item.status === 'confirmed' ? '입장 대기' : item.status === 'used' ? '입장 완료' : item.status === 'noshow_expired' ? '노쇼 마감' : '예약 취소'}
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

      {/* 5. Seating Tag & Duration Modal Dialog */}
      {openModalSeat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-sm p-6 rounded-3xl bg-zinc-900 border border-purple-500/30 shadow-[0_0_30px_rgba(168,85,247,0.15)] space-y-5">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[9px] font-bold text-purple-400 uppercase tracking-widest bg-purple-950/40 px-2 py-0.5 rounded border border-purple-500/20">
                  SEATING ENHANCEMENT
                </span>
                <h4 className="text-base font-black text-white mt-1.5">[{openModalSeat.label}] 빈자리 개방 설정</h4>
              </div>
              <button 
                onClick={() => setOpenModalSeat(null)}
                className="p-1 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>

            {/* Duration Selector */}
            <div className="space-y-2">
              <label className="text-[10px] font-black tracking-wider text-zinc-500 uppercase block">이용 제한시간 설정</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 30, label: '30분' },
                  { value: 60, label: '1시간' },
                  { value: 120, label: '2시간' },
                  { value: 180, label: '3시간' },
                  { value: 720, label: '무제한' }
                ].map((d) => (
                  <button
                    key={d.value}
                    onClick={() => setSelectedDuration(d.value)}
                    type="button"
                    className={`py-2 rounded-xl border text-[11px] font-black transition-all ${
                      selectedDuration === d.value
                        ? 'bg-purple-950/30 border-purple-500 text-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.1)]'
                        : 'bg-zinc-950 border-zinc-850 text-zinc-400 hover:border-zinc-800'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Recommendation Tags Selector */}
            <div className="space-y-2">
              <label className="text-[10px] font-black tracking-wider text-zinc-500 uppercase block">실시간 추천 문구 지정 (선택)</label>
              <div className="space-y-2">
                {[
                  '30분 내 방문 가능',
                  `${openModalSeat.capacity}인석 바로 입장`,
                  '오늘만 서비스 제공',
                  '' // None
                ].map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setSelectedTag(tag)}
                    type="button"
                    className={`w-full py-2.5 px-4 rounded-xl border text-left text-[11px] font-bold transition-all flex items-center justify-between ${
                      selectedTag === tag
                        ? 'bg-purple-950/20 border-purple-500 text-white shadow-[0_0_10px_rgba(168,85,247,0.05)]'
                        : 'bg-zinc-950 border-zinc-850 text-zinc-500 hover:border-zinc-800'
                    }`}
                  >
                    <span>{tag === '' ? '💡 선택 안 함 (기본)' : `✨ ${tag}`}</span>
                    {selectedTag === tag && (
                      <div className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_6px_rgba(168,85,247,0.8)]" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* CTAs */}
            <div className="pt-2 flex gap-3">
              <button
                onClick={() => setOpenModalSeat(null)}
                type="button"
                className="flex-1 py-3 rounded-xl bg-zinc-950 border border-zinc-850 text-xs font-bold text-zinc-500 hover:text-white transition-colors"
              >
                닫기
              </button>
              <button
                onClick={handleConfirmOpenSeat}
                disabled={seatMutatingId === openModalSeat.id}
                type="button"
                className="flex-[2] py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-xs font-black text-white hover:brightness-110 shadow-[0_0_15px_rgba(168,85,247,0.3)] transition-all flex items-center justify-center gap-1.5"
              >
                <span>빈자리 개방 확정</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Emergency Deal Modal Dialog */}
      {openDealModalSeat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-sm p-6 rounded-3xl bg-zinc-900 border border-orange-500/30 shadow-[0_0_30px_rgba(249,115,22,0.15)] space-y-5">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[9px] font-bold text-orange-400 uppercase tracking-widest bg-orange-950/40 px-2 py-0.5 rounded border border-orange-500/20">
                  🔥 EMERGENCY DEAL ISSUER
                </span>
                <h4 className="text-base font-black text-white mt-1.5">[{openDealModalSeat.label}] 긴급딜 등록 설정</h4>
              </div>
              <button 
                onClick={() => setOpenDealModalSeat(null)}
                className="p-1 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>

            {/* Presets Selection */}
            <div className="space-y-2">
              <label className="text-[10px] font-black tracking-wider text-zinc-500 uppercase block">추천 딜 템플릿 선택</label>
              <div className="space-y-2">
                {[
                  { title: '30분 내 방문 시 하이볼 1잔', desc: '지금 즉시 매장 방문 고객께 시원한 산토리 하이볼 1잔을 서비스로 드립니다!', type: 'service' as const, value: '하이볼 1잔 서비스' },
                  { title: '오늘만 안주 서비스 제공', desc: '지금 예약 후 30분 내 매장 도착 시 갓 튀긴 감자튀김을 요리 주방에서 즉시 조리해 서비스합니다!', type: 'service' as const, value: '감자튀김 안주 서비스' },
                  { title: '마감 전 20% 초특급 할인 혜택', desc: '마감 전 비어있는 특별석에 대해 총 현장 이용 금액의 20%를 전액 현장 차감 할인해 드립니다!', type: 'discount' as const, value: '20% 현장 할인' },
                ].map((preset, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setDealTitle(preset.title);
                      setDealDescription(preset.desc);
                      setDealBenefitType(preset.type);
                      setDealBenefitValue(preset.value);
                    }}
                    type="button"
                    className={`w-full py-2 px-3 rounded-xl border text-left text-[10px] font-bold transition-all ${
                      dealTitle === preset.title
                        ? 'bg-orange-950/20 border-orange-500 text-white shadow-[0_0_10px_rgba(249,115,22,0.05)]'
                        : 'bg-zinc-950 border-zinc-850 text-zinc-500 hover:border-zinc-800'
                    }`}
                  >
                    <span className="block text-white font-extrabold">{preset.title}</span>
                    <span className="block text-[8px] text-zinc-550 truncate mt-0.5">{preset.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Manual Fields */}
            <div className="space-y-3.5 bg-zinc-950/50 p-4 rounded-2xl border border-zinc-850/50">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-zinc-650 uppercase">딜 제목</label>
                <input 
                  type="text" 
                  value={dealTitle}
                  onChange={(e) => setDealTitle(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-850 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-650 focus:outline-none focus:border-orange-500/50"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-zinc-650 uppercase">제공 혜택 상세값</label>
                <input 
                  type="text" 
                  value={dealBenefitValue}
                  onChange={(e) => setDealBenefitValue(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-850 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-650 focus:outline-none focus:border-orange-500/50"
                  placeholder="예: 하이볼 1잔 서비스, 20% 현장 할인"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-zinc-650 uppercase">혜택 종류</label>
                  <select
                    value={dealBenefitType}
                    onChange={(e) => setDealBenefitType(e.target.value as 'service' | 'discount' | 'time_limit')}
                    className="w-full bg-zinc-900 border border-zinc-850 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500/50"
                  >
                    <option value="service">안주/음료 서비스</option>
                    <option value="discount">현장 총액 할인</option>
                    <option value="time_limit">이용 시간 연장</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-zinc-650 uppercase">딜 유효 기간 (선택)</label>
                  <select
                    value={dealDurationMinutes}
                    onChange={(e) => setDealDurationMinutes(Number(e.target.value))}
                    className="w-full bg-zinc-900 border border-zinc-850 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500/50"
                  >
                    <option value={15}>15분</option>
                    <option value={30}>30분</option>
                    <option value={45}>45분</option>
                    <option value={60}>1시간</option>
                    <option value={120}>2시간</option>
                  </select>
                </div>
              </div>
            </div>

            {/* CTAs */}
            <div className="pt-2 flex gap-3">
              <button
                onClick={() => setOpenDealModalSeat(null)}
                type="button"
                className="flex-1 py-3 rounded-xl bg-zinc-950 border border-zinc-850 text-xs font-bold text-zinc-500 hover:text-white transition-colors"
              >
                닫기
              </button>
              <button
                onClick={handleConfirmCreateDeal}
                disabled={seatMutatingId === openDealModalSeat.id}
                type="button"
                className="flex-[2] py-3 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 text-xs font-black text-white hover:brightness-110 shadow-[0_0_15px_rgba(249,115,22,0.3)] transition-all flex items-center justify-center gap-1.5"
              >
                <span>긴급딜 발행 확정</span>
              </button>
            </div>
          </div>
        </div>
      )}

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
