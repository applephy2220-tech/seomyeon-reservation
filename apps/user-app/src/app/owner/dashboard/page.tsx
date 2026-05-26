'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { db } from '@shared/firebase/clientApp';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Seat, Reservation, SeatStatus, AiRecommendation } from '@shared/types';
import { useRealtimeVenues } from '@shared/hooks/useRealtimeVenues';
import { useRealtimeSeats } from '@shared/hooks/useRealtimeSeats';
import { changeSeatStatus, verifyVisitCodeTransaction, cancelReservationAsNoShow, completeVisitTransaction } from '@shared/firebase/owner';
import { createDealTransaction, cancelDealTransaction, useRealtimeDeals } from '@shared/firebase/deals';
import { getAiRecommendations } from '@shared/services/recommendation';
import { LoadingSpinner } from '@shared/components/LoadingSpinner';
import { NotificationToast } from '@shared/components/NotificationToast';
import { triggerNotification } from '@shared/firebase/notification';
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
  Sparkles,
  CreditCard,
  ChefHat
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

  // Subscribe to all deals for the selected venue in real-time to compute statistics
  const { deals: allDeals } = useRealtimeDeals({ venueId: selectedVenueId, onlyActive: false });
  
  // Filter active deals client-side to preserve the existing UI behavior
  const activeDeals = React.useMemo(() => {
    return allDeals.filter(d => d.status === 'active' && d.remainingSlots > 0);
  }, [allDeals]);

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

  // Aggregated Statistics and Performance Analytics
  const stats = React.useMemo(() => {
    const todayStr = new Date().toLocaleDateString();
    
    // 1. 오늘 예약 수 (visitTime 기준)
    const todayRes = reservations.filter(r => {
      try {
        return new Date(r.visitTime).toLocaleDateString() === todayStr;
      } catch {
        return false;
      }
    });
    const todayCount = todayRes.length;

    // 2. 예약 상태별 카운트
    const confirmedCount = reservations.filter(r => r.status === 'confirmed').length;
    const visitedCount = reservations.filter(r => r.status === 'visited' || r.status === 'used').length;
    const completedCount = reservations.filter(r => r.status === 'completed').length;
    const noshowCount = reservations.filter(r => r.status === 'noshow_expired').length;
    const cancelledCount = reservations.filter(r => r.status === 'canceled').length;

    // 3. 긴급딜 사용 수 (dealId가 연결된 예약들의 수)
    const dealUsedCount = reservations.filter(r => r.dealId).length;

    // 4. 현재 열려있는 좌석 수
    const openSeatsCount = seats.filter(s => s.status === 'available').length;

    // 5. 총 예약금 합산 (취소되지 않은 결제 예약의 합계)
    const totalDeposits = reservations
      .filter(r => r.status !== 'canceled')
      .reduce((sum, r) => sum + (r.paymentAmount || 5000), 0);

    return {
      todayCount,
      confirmedCount,
      visitedCount,
      completedCount,
      noshowCount,
      cancelledCount,
      dealUsedCount,
      openSeatsCount,
      totalDeposits
    };
  }, [reservations, seats]);

  const aiInsights = React.useMemo(() => {
    try {
      const hasInsufficientData = !reservations || reservations.length === 0;
      if (hasInsufficientData) {
        return [
          {
            id: `ai-rec-insufficient-${selectedVenueId}`,
            type: 'turnover_insight',
            title: '✨ 실시간 AI 운영 가이드 대기 중',
            description: '아직 분석할 주문 데이터가 부족합니다. 첫 실시간 테이블 예약 및 선주문 결제가 완료되면 정밀 AI 인사이트 추천 카드가 자동으로 활성화됩니다.',
            severity: 'low',
            createdAt: new Date().toISOString()
          } as AiRecommendation
        ];
      }
      return getAiRecommendations(selectedVenueId, seats, reservations, allDeals);
    } catch (err) {
      console.error('Error generating AI insights in useMemo:', err);
      return [
        {
          id: `ai-rec-fallback-err-${selectedVenueId}`,
          type: 'turnover_insight',
          title: '✨ AI 네비게이터 일시 정지',
          description: '아직 분석할 주문 데이터가 부족하거나 일시적인 동기화 대기 상태입니다.',
          severity: 'low',
          createdAt: new Date().toISOString()
        } as AiRecommendation
      ];
    }
  }, [selectedVenueId, seats, reservations, allDeals]);

  // Recent Streams
  const recentBookings = React.useMemo(() => {
    return reservations
      .filter(r => r.status === 'confirmed' || r.status === 'visited' || r.status === 'used')
      .slice(0, 5);
  }, [reservations]);

  const recentCompletedBookings = React.useMemo(() => {
    return reservations
      .filter(r => r.status === 'completed')
      .slice(0, 5);
  }, [reservations]);

  // Background loop: check for expired (no-show) reservations (> 30 mins elapsed)
  // We use a ref to prevent recreating setInterval when reservations state updates.
  const reservationsRef = React.useRef<Reservation[]>(reservations);
  React.useEffect(() => {
    reservationsRef.current = reservations;
  }, [reservations]);

  // Keep track of processing reservation IDs to prevent redundant trigger loops
  const processingNoShowIdsRef = React.useRef<Set<string>>(new Set());
  const notifiedGraceTenMinRef = React.useRef<Set<string>>(new Set());
  const notifiedGraceExpiredWarnRef = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const currentReservations = reservationsRef.current;

      currentReservations.forEach((item) => {
        // Only target active 'confirmed' status
        if (item.status !== 'confirmed') return;

        try {
          const visitTime = new Date(item.visitTime);
          
          // A. 10 Minutes Visit Reminder (visitTime is in the future)
          const timeToVisitMs = visitTime.getTime() - now.getTime();
          const tenMinutes = 10 * 60 * 1000;
          if (timeToVisitMs > 0 && timeToVisitMs <= tenMinutes) {
            if (!notifiedGraceTenMinRef.current.has(item.id)) {
              notifiedGraceTenMinRef.current.add(item.id);
              triggerNotification(
                item.userId,
                '⏰ 방문 10분 전 리마인더',
                `[야키토리 시선 서면점 ${item.seatLabel}] 예약 시간 10분 전입니다! 늦지 않게 도착하여 체크인해 주세요.`,
                `/reservation-success?id=${item.id}`
              );
            }
          }

          // B. 15 Minutes Grace Delayed Warning (visitTime is in the past)
          const elapsedMs = now.getTime() - visitTime.getTime();
          const fifteenMinutes = 15 * 60 * 1000;
          const thirtyMinutes = 30 * 60 * 1000;

          if (elapsedMs >= fifteenMinutes && elapsedMs < thirtyMinutes) {
            if (!notifiedGraceExpiredWarnRef.current.has(item.id)) {
              notifiedGraceExpiredWarnRef.current.add(item.id);
              triggerNotification(
                item.userId,
                '🚨 [방문 지연] 노쇼 마감 임박 경고',
                `예약 방문 시간(15분 경과)이 지연되고 있습니다. 30분 초과 미입장 시 보증금 전액 소멸 및 예약 자동 취소됩니다.`,
                `/profile`
              );
            }
          }

          // C. 30 Minutes No-Show Automatic Cancellation
          if (elapsedMs >= thirtyMinutes) {
            if (processingNoShowIdsRef.current.has(item.id)) return;

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

  const handleAiActionClick = (rec: AiRecommendation) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = rec.actionPayload as any;
    if (rec.type === 'deal_trigger' && payload) {
      const vacantSeat = seats.find(s => s.status === 'available');
      if (vacantSeat) {
        setOpenDealModalSeat(vacantSeat);
        setDealTitle(payload.title);
        setDealDescription(payload.description);
        setDealBenefitType(payload.benefitType);
        setDealBenefitValue(payload.benefitValue);
        setDealDurationMinutes(payload.durationMinutes);
      } else {
        alert('현재 긴급딜을 즉시 발행할 수 있는 빈 좌석이 비어있지 않습니다.');
      }
    } else if (rec.type === 'no_show_warning' && payload) {
      alert(`[AI 수사팀] ${payload.reservationId.slice(0, 8)}번 지각 예약 건에 대한 유선 체크(비상연락망) 및 노쇼 유예 시간 30분 카운트다운 진행 상태를 점검해 주세요.`);
    }
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

  const handleCompleteVisitClick = async (reservationId: string, seatId: string) => {
    if (!confirm('이 예약 고객의 이용을 종료하고 퇴장 처리하시겠습니까? 테이블이 즉시 개방됩니다.')) return;

    setSeatMutatingId(seatId);
    try {
      const res = await completeVisitTransaction(reservationId, seatId);
      alert(res.message);
    } catch (err) {
      console.error(err);
      alert('퇴장 처리에 실패했습니다.');
    } finally {
      setSeatMutatingId(null);
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
      
      {/* Real-time In-App Neon Notifications for Owner Channel */}
      <NotificationToast userId="demo-owner" role="owner" />

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

        <div className="flex items-center gap-3">
          <Link
            href="/owner/kitchen"
            className="px-3.5 py-1.5 rounded-xl bg-orange-950/20 border border-orange-500/30 hover:border-orange-500 text-[10px] font-black text-orange-400 hover:text-white transition-all shadow-[0_0_10px_rgba(249,115,22,0.1)] flex items-center gap-1"
          >
            <ChefHat className="w-3.5 h-3.5 text-orange-500" />
            주방 조리 대시보드
          </Link>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-[10px] text-zinc-550 font-bold font-mono">FIRESTORE SYNC ACTIVE</span>
          </div>
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

      {/* Real-Time Statistics Neon Card Dashboard */}
      <section className="px-6 mt-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3.5">
          {/* 1. 오늘 총 예약 */}
          <div className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-850/60 backdrop-blur-md hover:border-cyan-500/30 hover:shadow-[0_0_15px_rgba(34,211,238,0.04)] transition-all duration-300 group hover:-translate-y-0.5">
            <div className="flex justify-between items-start">
              <span className="text-[9px] font-black tracking-widest text-zinc-500 group-hover:text-cyan-400 transition-colors uppercase">오늘 총 예약</span>
              <Calendar className="w-4 h-4 text-cyan-400 animate-pulse" />
            </div>
            <div className="mt-2.5 flex items-baseline gap-1">
              <span className="text-xl font-black text-white font-mono">{stats.todayCount}</span>
              <span className="text-[10px] text-zinc-500 font-bold">건</span>
            </div>
            <p className="text-[8px] text-zinc-650 mt-1 font-semibold">보증금 확보 완료</p>
          </div>

          {/* 2. 대기 중 */}
          <div className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-850/60 backdrop-blur-md hover:border-purple-500/30 hover:shadow-[0_0_15px_rgba(168,85,247,0.04)] transition-all duration-300 group hover:-translate-y-0.5">
            <div className="flex justify-between items-start">
              <span className="text-[9px] font-black tracking-widest text-zinc-500 group-hover:text-purple-400 transition-colors uppercase">입장 대기</span>
              <Clock className="w-4 h-4 text-purple-400" />
            </div>
            <div className="mt-2.5 flex items-baseline gap-1">
              <span className="text-xl font-black text-white font-mono">{stats.confirmedCount}</span>
              <span className="text-[10px] text-zinc-500 font-bold">건</span>
            </div>
            <p className="text-[8px] text-purple-400/70 mt-1 font-semibold">입장 대기 손님</p>
          </div>

          {/* 3. 이용 중 */}
          <div className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-850/60 backdrop-blur-md hover:border-orange-500/30 hover:shadow-[0_0_15px_rgba(249,115,22,0.04)] transition-all duration-300 group hover:-translate-y-0.5">
            <div className="flex justify-between items-start">
              <span className="text-[9px] font-black tracking-widest text-zinc-500 group-hover:text-orange-400 transition-colors uppercase">현재 이용중</span>
              <Users className="w-4 h-4 text-orange-400" />
            </div>
            <div className="mt-2.5 flex items-baseline gap-1">
              <span className="text-xl font-black text-white font-mono">{stats.visitedCount}</span>
              <span className="text-[10px] text-zinc-500 font-bold">석</span>
            </div>
            <p className="text-[8px] text-orange-400/70 mt-1 font-semibold">이용 및 식사 중</p>
          </div>

          {/* 4. 방문 완료 */}
          <div className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-850/60 backdrop-blur-md hover:border-emerald-500/30 hover:shadow-[0_0_15px_rgba(16,185,129,0.04)] transition-all duration-300 group hover:-translate-y-0.5">
            <div className="flex justify-between items-start">
              <span className="text-[9px] font-black tracking-widest text-zinc-500 group-hover:text-emerald-400 transition-colors uppercase">방문 완료</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="mt-2.5 flex items-baseline gap-1">
              <span className="text-xl font-black text-white font-mono">{stats.completedCount}</span>
              <span className="text-[10px] text-zinc-500 font-bold">건</span>
            </div>
            <p className="text-[8px] text-emerald-400/70 mt-1 font-semibold">퇴장 및 정산 완료</p>
          </div>

          {/* 5. 노쇼 마감 */}
          <div className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-850/60 backdrop-blur-md hover:border-red-500/30 hover:shadow-[0_0_15px_rgba(239,68,68,0.04)] transition-all duration-300 group hover:-translate-y-0.5">
            <div className="flex justify-between items-start">
              <span className="text-[9px] font-black tracking-widest text-zinc-500 group-hover:text-red-400 transition-colors uppercase">노쇼 마감</span>
              <XCircle className="w-4 h-4 text-red-400" />
            </div>
            <div className="mt-2.5 flex items-baseline gap-1">
              <span className="text-xl font-black text-white font-mono">{stats.noshowCount}</span>
              <span className="text-[10px] text-zinc-500 font-bold">건</span>
            </div>
            <p className="text-[8px] text-red-500/70 mt-1 font-semibold">보증금 몰수 처리</p>
          </div>

          {/* 6. 실시간 빈 좌석 */}
          <div className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-850/60 backdrop-blur-md hover:border-teal-500/30 hover:shadow-[0_0_15px_rgba(20,184,166,0.04)] transition-all duration-300 group hover:-translate-y-0.5">
            <div className="flex justify-between items-start">
              <span className="text-[9px] font-black tracking-widest text-zinc-500 group-hover:text-teal-400 transition-colors uppercase">실시간 빈 좌석</span>
              <LayoutGrid className="w-4 h-4 text-teal-400" />
            </div>
            <div className="mt-2.5 flex items-baseline gap-1">
              <span className="text-xl font-black text-white font-mono">{stats.openSeatsCount}</span>
              <span className="text-[10px] text-zinc-500 font-bold">석</span>
            </div>
            <p className="text-[8px] text-teal-400/70 mt-1 font-semibold">즉시 개방 좌석</p>
          </div>

          {/* 7. 누적 예약금 */}
          <div className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-850/60 backdrop-blur-md hover:border-amber-500/30 hover:shadow-[0_0_15px_rgba(245,158,11,0.04)] transition-all duration-300 group hover:-translate-y-0.5">
            <div className="flex justify-between items-start">
              <span className="text-[9px] font-black tracking-widest text-zinc-500 group-hover:text-amber-400 transition-colors uppercase">누적 예약금</span>
              <CreditCard className="w-4 h-4 text-amber-400 animate-pulse" />
            </div>
            <div className="mt-2.5 flex items-baseline gap-0.5">
              <span className="text-xl font-black text-white font-mono">{stats.totalDeposits.toLocaleString()}</span>
              <span className="text-[10px] text-zinc-500 font-bold">원</span>
            </div>
            <p className="text-[8px] text-amber-500/70 mt-1 font-semibold">보증금/정산 대상액</p>
          </div>
        </div>

        {/* Dynamic Reservation Sub-Breakdown Indicator Board */}
        <div className="mt-3.5 p-4 rounded-2xl bg-zinc-950/40 border border-zinc-900 backdrop-blur-md flex flex-wrap gap-x-6 gap-y-2 items-center text-xs justify-between">
          <div className="flex gap-2 items-center">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shadow-[0_0_4px_rgba(168,85,247,0.8)]"></span>
            <span className="text-[10px] font-bold text-zinc-400">예약 상태별 실시간 세부 현황</span>
          </div>
          <div className="flex items-center gap-4 flex-wrap text-[10px] font-mono">
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-500 font-bold">대기 (confirmed):</span>
              <span className="text-purple-400 font-extrabold">{stats.confirmedCount}건</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-500 font-bold">이용 (visited):</span>
              <span className="text-orange-400 font-extrabold">{stats.visitedCount}건</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-500 font-bold">완료 (completed):</span>
              <span className="text-emerald-400 font-extrabold">{stats.completedCount}건</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-500 font-bold">노쇼 (no-show):</span>
              <span className="text-red-400 font-extrabold">{stats.noshowCount}건</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-500 font-bold">취소 (canceled):</span>
              <span className="text-zinc-500 font-extrabold">{stats.cancelledCount}건</span>
            </div>
            <div className="h-3 w-[1px] bg-zinc-850 hidden sm:block"></div>
            <div className="flex items-center gap-1.5">
              <span className="text-orange-400 font-bold flex items-center gap-0.5">🔥 긴급딜 기여:</span>
              <span className="text-white font-extrabold">{stats.dealUsedCount}건</span>
            </div>
          </div>
        </div>
      </section>

      {/* AI Operations Navigator Section */}
      <section className="px-6 mt-6">
        <div className="p-5.5 rounded-3xl bg-gradient-to-tr from-purple-950/10 to-zinc-900/50 border border-purple-500/20 shadow-[0_0_20px_rgba(168,85,247,0.04)] space-y-4">
          <div className="flex justify-between items-center pb-2 border-b border-zinc-900">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
              </span>
              <h4 className="text-xs font-black tracking-widest text-purple-400 uppercase flex items-center gap-1.5">
                ✨ AI 스마트 운영 네비게이터 (AI Insights)
              </h4>
            </div>
            <span className="text-[9px] text-zinc-550 font-bold bg-purple-950/30 px-2 py-0.5 rounded border border-purple-500/20">
              REAL-TIME NAVIGATOR ACTIVE
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {aiInsights.map((insight) => (
              <div
                key={insight.id}
                className={`p-4 rounded-2xl border transition-all duration-300 flex flex-col justify-between ${
                  insight.severity === 'high'
                    ? 'bg-red-950/10 border-red-500/20 hover:border-red-500/30'
                    : insight.severity === 'medium'
                      ? 'bg-amber-950/10 border-amber-500/20 hover:border-amber-500/30'
                      : 'bg-zinc-900/30 border-zinc-850 hover:border-zinc-800'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex justify-between items-start">
                    <span className={`px-2 py-0.5 rounded text-[8.5px] font-black uppercase tracking-wider ${
                      insight.type === 'deal_trigger'
                        ? 'bg-orange-950 text-orange-400 border border-orange-500/20'
                        : insight.type === 'no_show_warning'
                          ? 'bg-red-950 text-red-400 border border-red-500/20 animate-pulse'
                          : 'bg-purple-950 text-purple-400 border border-purple-500/20'
                    }`}>
                      AI {insight.type === 'deal_trigger' ? '긴급딜 추천' : insight.type === 'no_show_warning' ? '노쇼 경보' : '운영 권고'}
                    </span>
                    <span className="text-[8px] text-zinc-600 font-semibold font-mono">실시간 분석</span>
                  </div>
                  <h5 className="text-xs font-black text-white">{insight.title}</h5>
                  <p className="text-[10px] text-zinc-500 leading-relaxed">{insight.description}</p>
                </div>

                {insight.actionLabel && (
                  <div className="mt-4 pt-3 border-t border-zinc-900/40 flex justify-end">
                    <button
                      onClick={() => handleAiActionClick(insight)}
                      className={`px-3 py-1.5 rounded-lg text-[9px] font-black tracking-tight transition-all active:scale-[0.96] border ${
                        insight.severity === 'high'
                          ? 'bg-red-950/40 border-red-550/40 text-red-400 hover:bg-red-500 hover:text-black'
                          : 'bg-orange-950/40 border-orange-550/40 text-orange-400 hover:bg-orange-500 hover:text-black shadow-[0_0_8px_rgba(249,115,22,0.1)]'
                      }`}
                    >
                      {insight.actionLabel} →
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
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

      {/* Emergency Deals Cumulative Performance Analytics Board */}
      <section className="px-6 mt-6">
        <div className="p-6 rounded-3xl bg-zinc-900/60 border border-zinc-850 backdrop-blur-md">
          <div className="flex justify-between items-center border-b border-zinc-850 pb-3 mb-4">
            <h4 className="text-xs font-black tracking-widest text-orange-400 uppercase flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-orange-400 animate-pulse" />
              🔥 긴급딜 실시간 성과 분석 리포트
            </h4>
            <span className="text-[9px] text-zinc-550 font-bold uppercase">DEAL METRICS</span>
          </div>

          {allDeals.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-850 text-zinc-550 font-bold">
                    <th className="py-3 pr-4">긴급딜 정보</th>
                    <th className="py-3 px-4">딜 상태</th>
                    <th className="py-3 px-4 text-center">클릭 수 (노출)</th>
                    <th className="py-3 px-4 text-center">예약 전환 수</th>
                    <th className="py-3 px-4 text-center">이용 완료 수</th>
                    <th className="py-3 px-4 text-center">예약 전환율</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-850/60 text-zinc-400 font-medium">
                  {allDeals.map((deal) => {
                    const matchedSeat = seats.find(s => s.id === deal.seatId);
                    
                    // Generate natural mock click values based on deal.id
                    const clicks = deal.clicks || (Math.abs(deal.id.charCodeAt(0) * 11) % 30 + 15);
                    // Live conversion count from reservations linked with deal.id
                    const conversions = reservations.filter(r => r.dealId === deal.id).length;
                    // Completed count from reservations linked with deal.id and status is completed
                    const completedConversions = reservations.filter(r => r.dealId === deal.id && r.status === 'completed').length;
                    
                    // Conversion rate percentage
                    const conversionRate = clicks > 0 ? Math.min(100, Math.round((conversions / clicks) * 100)) : 0;

                    return (
                      <tr key={deal.id} className="hover:bg-zinc-950/20 transition-all">
                        <td className="py-3.5 pr-4">
                          <div className="space-y-0.5">
                            <span className="text-white font-extrabold block text-xs">{deal.title}</span>
                            <span className="text-[9px] text-zinc-500 font-bold uppercase">
                              [{matchedSeat ? matchedSeat.label : '좌석'}] {deal.benefitValue}
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border ${
                            deal.status === 'active'
                              ? 'text-orange-400 border-orange-500/20 bg-orange-950/10'
                              : deal.status === 'sold_out'
                              ? 'text-purple-400 border-purple-500/20 bg-purple-950/10 shadow-[0_0_8px_rgba(168,85,247,0.05)]'
                              : deal.status === 'expired'
                              ? 'text-zinc-500 border-zinc-800 bg-zinc-900/30'
                              : 'text-red-400 border-red-500/20 bg-red-950/10'
                          }`}>
                            {deal.status === 'active' 
                              ? '진행 중' 
                              : deal.status === 'sold_out' 
                              ? '완판 마감' 
                              : deal.status === 'expired'
                              ? '시간 만료'
                              : '회수 취소'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono font-bold text-zinc-300">{clicks}회</td>
                        <td className="py-3.5 px-4 text-center font-mono font-bold text-orange-400">{conversions}건</td>
                        <td className="py-3.5 px-4 text-center font-mono font-bold text-emerald-400">{completedConversions}건</td>
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex flex-col items-center justify-center gap-1.5 max-w-[100px] mx-auto">
                            <span className="font-mono font-extrabold text-white text-xs">{conversionRate}%</span>
                            <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                              <div 
                                className={`h-full rounded-full transition-all duration-500 ${
                                  conversionRate > 50 
                                    ? 'bg-gradient-to-r from-orange-500 to-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]'
                                    : 'bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.4)]'
                                }`} 
                                style={{ width: `${conversionRate}%` }} 
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-zinc-650 text-xs border border-dashed border-zinc-850 rounded-2xl space-y-2">
              <Clock className="w-8 h-8 text-zinc-600 mx-auto" />
              <p className="font-bold">누적된 긴급딜 실시간 성과 내역이 없습니다.</p>
              <p className="text-[10px] text-zinc-650">긴급딜을 생성하고 사용자가 이를 통해 예약을 완료하면 여기에 리포트가 누적됩니다.</p>
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
                    <th className="py-3 px-4">상태</th>
                    <th className="py-3 pl-4 text-right">퇴장 관리</th>
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
                      <td className="py-3.5 px-4">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${
                          item.status === 'confirmed'
                            ? 'text-purple-400 border-purple-500/20 bg-purple-950/20 shadow-[0_0_8px_rgba(168,85,247,0.05)]'
                            : item.status === 'visited' || item.status === 'used'
                            ? 'text-orange-400 border-orange-500/20 bg-orange-950/20 shadow-[0_0_8px_rgba(249,115,22,0.05)]'
                            : item.status === 'completed'
                            ? 'text-zinc-400 border-zinc-800 bg-zinc-900/30'
                            : item.status === 'noshow_expired'
                            ? 'text-red-400 border-red-500/20 bg-red-950/20'
                            : 'text-zinc-550 border-zinc-850 bg-zinc-900/10'
                        }`}>
                          {item.status === 'confirmed' 
                            ? '입장 대기' 
                            : item.status === 'visited' || item.status === 'used' 
                            ? '이용 중' 
                            : item.status === 'completed'
                            ? '이용 완료'
                            : item.status === 'noshow_expired' 
                            ? '노쇼 마감' 
                            : '예약 취소'}
                        </span>
                      </td>
                      <td className="py-3.5 pl-4 text-right">
                        {(item.status === 'visited' || item.status === 'used') && (
                          <button
                            onClick={() => handleCompleteVisitClick(item.id, item.seatId)}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-950/30 border border-emerald-500/30 hover:bg-emerald-500 hover:text-black transition-all active:scale-[0.95] text-[10px] font-black text-emerald-400"
                          >
                            방문 완료 (퇴장)
                          </button>
                        )}
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

      {/* Recent Activity Live Timelines Grid (Side-by-Side) */}
      <section className="px-6 mt-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Column A: Recent Booking Activity */}
          <div className="p-6 rounded-3xl bg-zinc-900/60 border border-zinc-850 backdrop-blur-md space-y-4">
            <div className="flex justify-between items-center border-b border-zinc-850 pb-3">
              <h4 className="text-xs font-black tracking-widest text-purple-400 uppercase flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-purple-400 animate-pulse" />
                최근 접수 예약/이용 흐름
              </h4>
              <span className="text-[9px] text-zinc-550 font-bold uppercase">RECENT ACTIVE</span>
            </div>

            {recentBookings.length > 0 ? (
              <div className="relative pl-4 border-l border-zinc-850 space-y-4 pt-1">
                {recentBookings.map((item) => (
                  <div key={item.id} className="relative group">
                    {/* Glowing timeline node dot */}
                    <span className={`absolute left-[-21px] top-1.5 w-2.5 h-2.5 rounded-full border border-black z-10 transition-all ${
                      item.status === 'visited' || item.status === 'used'
                        ? 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)]'
                        : 'bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]'
                    }`} />
                    
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black text-white">{item.seatLabel}</span>
                        <span className="text-[9px] font-mono text-zinc-500">
                          {item.userId === 'demo-user' ? '데모손님' : item.userId.substring(0, 6)}
                        </span>
                        <span className={`text-[8px] font-black px-1.5 py-0.2 rounded border ${
                          item.status === 'confirmed'
                            ? 'text-purple-400 border-purple-500/20 bg-purple-950/10'
                            : 'text-orange-400 border-orange-500/20 bg-orange-950/10'
                        }`}>
                          {item.status === 'confirmed' ? '입장 대기' : '이용 중'}
                        </span>
                        {item.dealId && (
                          <span className="text-[8px] font-bold text-orange-400 bg-orange-950/20 border border-orange-500/25 px-1 rounded-sm">
                            딜 적용
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono">
                        <span>방문 예약: {new Date(item.visitTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
                        {item.visitedAt && (
                          <span className="block text-[8px] text-orange-400/70">
                            체크인 시각: {new Date(item.visitedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 text-zinc-600 text-[10px]">
                최근 진행 중인 예약/이용 흐름이 없습니다.
              </div>
            )}
          </div>

          {/* Column B: Recent Checkout Completions */}
          <div className="p-6 rounded-3xl bg-zinc-900/60 border border-zinc-850 backdrop-blur-md space-y-4">
            <div className="flex justify-between items-center border-b border-zinc-850 pb-3">
              <h4 className="text-xs font-black tracking-widest text-emerald-400 uppercase flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                최근 완료/퇴장 정산 흐름
              </h4>
              <span className="text-[9px] text-zinc-550 font-bold uppercase">RECENT COMPLETED</span>
            </div>

            {recentCompletedBookings.length > 0 ? (
              <div className="relative pl-4 border-l border-zinc-850 space-y-4 pt-1">
                {recentCompletedBookings.map((item) => (
                  <div key={item.id} className="relative group">
                    {/* Glowing timeline node dot */}
                    <span className="absolute left-[-21px] top-1.5 w-2.5 h-2.5 rounded-full border border-black z-10 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                    
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black text-white">{item.seatLabel}</span>
                        <span className="text-[9px] font-mono text-zinc-500">
                          {item.userId === 'demo-user' ? '데모손님' : item.userId.substring(0, 6)}
                        </span>
                        <span className="text-[8px] font-black px-1.5 py-0.2 rounded border text-zinc-400 border-zinc-800 bg-zinc-900/30">
                          이용 완료
                        </span>
                        {item.dealId && (
                          <span className="text-[8px] font-bold text-orange-400 bg-orange-950/20 border border-orange-500/25 px-1 rounded-sm">
                            딜 적용
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono">
                        <span className="text-emerald-400/80 block">
                          퇴장 정산: {item.completedAt ? new Date(item.completedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '완료됨'}
                        </span>
                        <span>입장 예약 시각: {new Date(item.visitTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 text-zinc-650 text-[10px]">
                최근 완료된 퇴장/정산 흐름이 없습니다.
              </div>
            )}
          </div>
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
