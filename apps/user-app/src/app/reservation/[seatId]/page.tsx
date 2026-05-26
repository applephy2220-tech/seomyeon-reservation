'use client';

import React, { use, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { db } from '@shared/firebase/clientApp';
import { doc, onSnapshot, collection, query, where } from 'firebase/firestore';
import { Seat, Deal, MenuItem, OrderItem, SelectedOption } from '@shared/types';
import { useRealtimeVenueDetail } from '@shared/hooks/useRealtimeVenues';
import { LoadingSpinner } from '@shared/components/LoadingSpinner';
import { releaseSeat, confirmMockPaymentTransaction } from '@shared/firebase/booking';
import { getUserPersonalizedMenus } from '@shared/services/recommendation';
import { Reservation } from '@shared/types';
import { 
  ArrowLeft, 
  Clock, 
  CreditCard, 
  ShieldCheck, 
  AlertCircle, 
  Info,
  Plus, 
  Minus, 
  ShoppingCart, 
  ChefHat, 
  Sparkles
} from 'lucide-react';

interface ReservationPageProps {
  params: Promise<{ seatId: string }>;
}

export default function ReservationPage({ params }: ReservationPageProps) {
  const resolvedParams = use(params);
  const seatId = resolvedParams.seatId;
  const router = useRouter();

  const [seat, setSeat] = useState<Seat | null>(null);
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);
  const [seatLoading, setSeatLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState<number>(300); // 5 minutes default
  const [selectedMethod, setSelectedMethod] = useState<string>('card');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expiredNotification, setExpiredNotification] = useState(false);
  const paymentConfirmedRef = React.useRef(false);

  // 메뉴 리스트 및 장바구니 선주문 상태
  const [venueMenus, setVenueMenus] = useState<MenuItem[]>([]);
  const [selectedOrders, setSelectedOrders] = useState<OrderItem[]>([]);
  const [selectedEta, setSelectedEta] = useState<string>('도착 즉시 서빙');
  
  // 사용자의 이전 예약 내역 (AI 맞춤형 메뉴 추천 전용)
  const [userPastReservations, setUserPastReservations] = useState<Reservation[]>([]);
  
  // 메뉴 상세 옵션 모달 전용 상태
  const [activeOptionMenu, setActiveOptionMenu] = useState<MenuItem | null>(null);
  const [tempSelectedOptions, setTempSelectedOptions] = useState<SelectedOption[]>([]);
  const [tempQuantity, setTempQuantity] = useState<number>(1);

  // Fetch venue detail using custom hook (declared early to allow access in effects)
  const { venue, loading: venueLoading } = useRealtimeVenueDetail(seat?.venueId || '');

  // Fetch past bookings of 'demo-user' to support AI personalization fuzzy matchers
  useEffect(() => {
    const resCol = collection(db, 'reservations');
    const q = query(resCol, where('userId', '==', 'demo-user'));
    const unsubscribe = onSnapshot(q, (snap) => {
      const list: Reservation[] = [];
      snap.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as Reservation);
      });
      setUserPastReservations(list);
    }, (err) => {
      console.error('Error fetching past reservations:', err);
    });

    return () => unsubscribe();
  }, []);

  const personalizedAiMenus = React.useMemo(() => {
    return getUserPersonalizedMenus('demo-user', userPastReservations, venueMenus);
  }, [userPastReservations, venueMenus]);

  // Subscribe to menus for the specific venue in real-time
  useEffect(() => {
    if (!seat?.venueId) return;

    const menusCol = collection(db, 'menus');
    const q = query(menusCol, where('venueId', '==', seat.venueId));
    
    const unsubscribe = onSnapshot(q, (snap) => {
      const items: MenuItem[] = [];
      snap.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() } as MenuItem);
      });
      setVenueMenus(items);
    }, (err) => {
      console.error('Error fetching menus:', err);
    });

    return () => unsubscribe();
  }, [seat?.venueId]);

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

  // Toss SDK Script dynamic loader
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const script = document.createElement('script');
    script.src = 'https://js.tosspayments.com/v1/';
    script.async = true;
    document.body.appendChild(script);
    return () => {
      // Clean up script on unmount
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  // Listen to Toss Payments error/failure query redirect parameters
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const urlParams = new URLSearchParams(window.location.search);
    const paymentError = urlParams.get('paymentError');
    if (paymentError) {
      alert('결제 도중 오류가 발생했거나 결제창이 닫혔습니다. 선점을 다시 시작해 주세요.');
      
      // Purge query keys
      const url = new URL(window.location.href);
      url.searchParams.delete('paymentError');
      url.searchParams.delete('message');
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  }, []);

  // Process success callback redirect from Toss secure server API
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const urlParams = new URLSearchParams(window.location.search);
    const paymentSuccess = urlParams.get('paymentSuccess');
    const paymentKey = urlParams.get('paymentKey');
    const dealId = urlParams.get('dealId');
    const ordersStr = urlParams.get('orders');
    const etaStr = urlParams.get('eta');
    const amountStr = urlParams.get('amount') || '5000';

    if (paymentSuccess === 'true' && paymentKey && seatId && seat && venue) {
      // Prevent double checkout finalizations in StrictMode or via Realtime Listener triggers
      if (paymentConfirmedRef.current) {
        console.log('[Toss Page] Reservation already finalized. Suppressing double execution.');
        return;
      }

      const finalizeTossReservation = async () => {
        paymentConfirmedRef.current = true;
        setIsSubmitting(true);
        try {
          let parsedOrders: OrderItem[] = [];
          if (ordersStr) {
            try {
              parsedOrders = JSON.parse(decodeURIComponent(ordersStr));
            } catch (e) {
              console.error('Failed to parse pre-ordered items from query:', e);
            }
          }

          const finalAmount = Number(amountStr) || 5000;
          const eta = etaStr ? decodeURIComponent(etaStr) : '';

          console.log('[Toss Page] Confirming atomic checkout transaction in Firestore for paymentKey:', paymentKey);
          
          const res = await confirmMockPaymentTransaction(
            seatId,
            venue.id,
            venue.name,
            seat.label,
            'demo-user',
            dealId || null,
            paymentKey,
            parsedOrders,
            eta,
            finalAmount
          );

          if (res.success && res.reservationId) {
            router.replace(`/reservation-success?id=${res.reservationId}`);
          } else {
            // Double check: if seat is already reserved, this means the transaction completed successfully in a previous tick.
            // We gracefully downgrade this console warning and redirect the user instead of displaying toxic alert errors.
            if (seat.status === 'reserved' && seat.currentReservationId) {
              console.warn('[Toss Page] Duplicate finalization triggered but seat is already reserved. Routing to success page:', res.message);
              router.replace(`/reservation-success?id=${seat.currentReservationId}`);
              return;
            }

            console.error('[Toss Page] Transaction finalization failed:', res.message);
            alert(res.message || '예약 내역 생성 도중 문제가 발생했습니다.');
            setIsSubmitting(false);
          }
        } catch (err) {
          console.error('[Toss Page] Firestore write transaction crashed:', err);
          // Safety fallback redirect if the seat shows reserved by us
          if (seat.status === 'reserved' && seat.currentReservationId) {
            router.replace(`/reservation-success?id=${seat.currentReservationId}`);
            return;
          }
          alert('예약 확정 완료 과정에서 예기치 못한 오류가 발생했습니다.');
          setIsSubmitting(false);
        }
      };

      finalizeTossReservation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seatId, seat, venue]);

  // Subscribe to the active deal document if seat.activeDealId is present
  useEffect(() => {
    if (!seat || !seat.activeDealId) {
      setActiveDeal(null);
      return;
    }

    const dealRef = doc(db, 'deals', seat.activeDealId);
    const unsubscribe = onSnapshot(dealRef, (docSnap) => {
      if (docSnap.exists()) {
        setActiveDeal({ id: docSnap.id, ...docSnap.data() } as Deal);
      } else {
        setActiveDeal(null);
      }
    }, (err) => {
      console.error('Error fetching active deal details:', err);
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seat?.activeDealId]);



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

  // 메뉴 클릭 시 옵션 모달 트리거 또는 즉시 장바구니 추가
  const handleMenuClick = (menu: MenuItem) => {
    if (menu.options && menu.options.length > 0) {
      setActiveOptionMenu(menu);
      setTempSelectedOptions(
        menu.options.map(opt => ({
          optionName: opt.name,
          itemName: opt.items[0].name,
          price: opt.items[0].price
        }))
      );
      setTempQuantity(1);
    } else {
      // 옵션이 없는 메뉴는 즉시 장바구니 추가
      const existing = selectedOrders.find(item => item.menuId === menu.id);
      if (existing) {
        setSelectedOrders(selectedOrders.map(item => 
          item.menuId === menu.id ? { ...item, quantity: item.quantity + 1 } : item
        ));
      } else {
        setSelectedOrders([...selectedOrders, {
          menuId: menu.id,
          name: menu.name,
          price: menu.price,
          quantity: 1,
          selectedOptions: []
        }]);
      }
    }
  };

  // 옵션 변경 핸들러
  const handleOptionChange = (optionName: string, itemName: string, price: number) => {
    setTempSelectedOptions(prev => 
      prev.map(opt => opt.optionName === optionName ? { optionName, itemName, price } : opt)
    );
  };

  // 옵션 선택 후 최종 장바구니 담기 완료
  const handleAddWithOptionConfirm = () => {
    if (!activeOptionMenu) return;

    const extraPrice = tempSelectedOptions.reduce((sum, opt) => sum + opt.price, 0);
    const finalItemPrice = activeOptionMenu.price + extraPrice;

    // 옵션 구성이 완전히 동일한 기존 품목이 있는지 확인
    const optionKey = JSON.stringify(tempSelectedOptions);
    const existingIndex = selectedOrders.findIndex(item => 
      item.menuId === activeOptionMenu.id && JSON.stringify(item.selectedOptions) === optionKey
    );

    if (existingIndex > -1) {
      const updated = [...selectedOrders];
      updated[existingIndex].quantity += tempQuantity;
      setSelectedOrders(updated);
    } else {
      setSelectedOrders([...selectedOrders, {
        menuId: activeOptionMenu.id,
        name: activeOptionMenu.name,
        price: finalItemPrice,
        quantity: tempQuantity,
        selectedOptions: tempSelectedOptions
      }]);
    }

    setActiveOptionMenu(null);
  };

  // 장바구니 내 수량 조절
  const handleUpdateCartQuantity = (index: number, nextQty: number) => {
    if (nextQty <= 0) {
      setSelectedOrders(selectedOrders.filter((_, i) => i !== index));
    } else {
      setSelectedOrders(selectedOrders.map((item, i) => 
        i === index ? { ...item, quantity: nextQty } : item
      ));
    }
  };

  const handlePayment = async () => {
    if (!seat || !venue) return;

    setIsSubmitting(true);
    
    // Calculate total price
    const preOrderTotal = selectedOrders.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const finalAmount = 5000 + preOrderTotal;
    
    const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
    const ordersJson = encodeURIComponent(JSON.stringify(selectedOrders));
    const etaEncoded = encodeURIComponent(selectedEta);

    // 1. Hybrid Sandbox Mode: Bypasses native Toss window when API keys are absent/mock
    if (!clientKey || clientKey === 'mock') {
      console.log('[Toss Page] NEXT_PUBLIC_TOSS_CLIENT_KEY is mock. Simulating secure custom checkout redirect.');
      
      setTimeout(() => {
        const mockPaymentKey = 'mock-key-' + Date.now();
        const mockOrderId = 'mock-order-' + Date.now();
        
        const mockSuccessUrl = new URL('/api/payment/success', window.location.origin);
        mockSuccessUrl.searchParams.set('paymentKey', mockPaymentKey);
        mockSuccessUrl.searchParams.set('orderId', mockOrderId);
        mockSuccessUrl.searchParams.set('amount', finalAmount.toString());
        mockSuccessUrl.searchParams.set('seatId', seatId);
        mockSuccessUrl.searchParams.set('venueId', venue.id);
        mockSuccessUrl.searchParams.set('venueName', venue.name);
        mockSuccessUrl.searchParams.set('seatLabel', seat.label);
        mockSuccessUrl.searchParams.set('userId', 'demo-user');
        mockSuccessUrl.searchParams.set('orders', ordersJson);
        mockSuccessUrl.searchParams.set('eta', etaEncoded);
        mockSuccessUrl.searchParams.set('paymentSuccess', 'true');
        if (seat.activeDealId) {
          mockSuccessUrl.searchParams.set('dealId', seat.activeDealId);
        }
        
        window.location.href = mockSuccessUrl.toString();
      }, 1200);
      return;
    }

    try {
      // 2. Real Toss Payments card checkout redirect trigger
      // @ts-expect-error: TossPayments is dynamically loaded via external CDN script
      const TossPayments = window.TossPayments;
      if (!TossPayments) {
        alert('결제 연동 모듈을 불러오는 중입니다. 잠시 후 다시 시도해 주세요.');
        setIsSubmitting(false);
        return;
      }

      const tossInstance = TossPayments(clientKey);
      const orderId = `order_${seatId}_${Date.now()}`;
      const redirectUri = `${window.location.origin}/api/payment/success`;

      await tossInstance.requestPayment('카드', {
        amount: finalAmount,
        orderId,
        orderName: `${venue.name} - ${seat.label} 테이블 예약 ${selectedOrders.length > 0 ? `외 선주문 ${selectedOrders.length}종` : ''}`,
        successUrl: `${redirectUri}?seatId=${seatId}&venueId=${venue.id}&venueName=${encodeURIComponent(venue.name)}&seatLabel=${encodeURIComponent(seat.label)}&userId=demo-user&dealId=${seat.activeDealId || ''}&orders=${ordersJson}&eta=${etaEncoded}&amount=${finalAmount}`,
        failUrl: `${window.location.origin}/reservation/${seatId}?paymentError=true`,
      });
      
    } catch (err) {
      console.error('[Toss Page] requestPayment crashed:', err);
      alert('결제창을 실행하는 중 오류가 발생했습니다: ' + (err instanceof Error ? err.message : String(err)));
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

  const preOrderTotal = selectedOrders.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const finalAmount = 5000 + preOrderTotal;

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

          {activeDeal && (
            <div className="p-3.5 rounded-2xl bg-orange-950/20 border border-orange-500/20 flex flex-col gap-1 shadow-[0_0_10px_rgba(249,115,22,0.05)]">
              <span className="text-[9px] font-black text-orange-400 uppercase tracking-widest flex items-center gap-1 animate-pulse">
                🔥 적용 대기 중인 긴급 딜 혜택
              </span>
              <h5 className="text-xs font-black text-white">{activeDeal.title}</h5>
              <p className="text-[9px] text-zinc-400 leading-normal">{activeDeal.description}</p>
              <div className="mt-1 text-[11px] font-black text-amber-300">
                🎁 제공 혜택: {activeDeal.benefitValue}
              </div>
            </div>
          )}

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

      {/* 3.5 Signature Menus Pre-order Section */}
      <section className="mx-6 mt-8 space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
          <h4 className="text-xs font-black tracking-widest text-orange-400 uppercase flex items-center gap-1.5 animate-pulse">
            <ChefHat className="w-4 h-4 text-orange-500 animate-bounce" />
            도착 즉시 조리! 선주문 메뉴 추가
          </h4>
          <span className="text-[9px] text-zinc-550">인기 시그니처</span>
        </div>

        {/* ETA Picker */}
        <div className="p-4.5 rounded-2xl bg-zinc-900/40 border border-zinc-800 backdrop-blur-md space-y-3">
          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider pl-0.5">
            ⏱️ 매장 도착 예정 시간 (ETA)
          </label>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {['도착 즉시 서빙', '10분 뒤 도착', '20분 뒤 도착', '30분 뒤 도착'].map((eta) => (
              <button
                key={eta}
                type="button"
                onClick={() => setSelectedEta(eta)}
                className={`px-3 py-2 rounded-xl text-[10.5px] font-black whitespace-nowrap transition-all border ${
                  selectedEta === eta
                    ? 'bg-orange-950/30 text-orange-450 border-orange-500/40 shadow-[0_0_10px_rgba(249,115,22,0.1)]'
                    : 'bg-zinc-950/60 text-zinc-500 border-zinc-900 hover:text-zinc-300'
                }`}
              >
                {eta}
              </button>
            ))}
          </div>
          <p className="text-[9px] text-zinc-650 pl-0.5 leading-normal font-medium">
            💡 지정한 도착 시간에 맞춰 매장에서 즉시 서빙할 수 있도록 조리를 시작합니다.
          </p>
        </div>

        {/* AI Personalized Signature Menu Section */}
        {personalizedAiMenus.length > 0 && (
          <div className="p-4 rounded-2xl bg-gradient-to-tr from-purple-950/10 to-zinc-900/50 border border-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.03)] space-y-3">
            <span className="text-[10px] font-black text-purple-400 uppercase tracking-widest flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-purple-400 animate-pulse fill-purple-400" />
              ✨ AI 단골손님 취향 저격 메뉴
            </span>
            <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
              {personalizedAiMenus.map((menu) => {
                return (
                  <div
                    key={`ai-${menu.id}`}
                    onClick={() => handleMenuClick(menu)}
                    className="flex-shrink-0 w-36 p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-850 hover:border-purple-500/30 transition-all cursor-pointer text-center group"
                  >
                    <span className="text-[9px] font-black text-purple-400 bg-purple-950/40 px-1.5 py-0.5 rounded border border-purple-500/20">
                      AI 추천
                    </span>
                    <span className="text-xs font-bold text-white block mt-2 truncate">{menu.name}</span>
                    <span className="text-[10px] font-black text-orange-450 block mt-1">{menu.price.toLocaleString()}원</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Menu Cards List */}
        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none snap-x snap-mandatory">
          {venueMenus.map((menu) => {
            const isInCart = selectedOrders.some(item => item.menuId === menu.id);
            const cartQty = selectedOrders.filter(item => item.menuId === menu.id).reduce((sum, item) => sum + item.quantity, 0);

            return (
              <div 
                key={menu.id}
                onClick={() => handleMenuClick(menu)}
                className="w-[200px] flex-shrink-0 snap-start p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-850 hover:border-zinc-700 transition-all flex flex-col justify-between cursor-pointer group"
              >
                <div className="space-y-2">
                  <div className="relative h-28 w-full rounded-xl overflow-hidden bg-zinc-950">
                    <img 
                      src={menu.imageUrl} 
                      alt={menu.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    {menu.isPopular && (
                      <span className="absolute top-2 left-2 inline-flex items-center gap-0.5 rounded bg-orange-500 border border-orange-400 px-1.5 py-0.5 text-[8px] font-black text-black shadow-[0_0_6px_rgba(249,115,22,0.4)]">
                        <Sparkles className="w-2.5 h-2.5 fill-black" />
                        HIT
                      </span>
                    )}
                  </div>
                  
                  <div>
                    <h5 className="text-xs font-black text-white group-hover:text-orange-400 transition-colors">{menu.name}</h5>
                    <p className="text-[9px] text-zinc-500 mt-0.5 line-clamp-2 leading-relaxed">{menu.description}</p>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between pt-2 border-t border-zinc-900/60">
                  <span className="text-xs font-black text-orange-450">{menu.price.toLocaleString()}원</span>
                  
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMenuClick(menu);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[9px] font-black tracking-tight transition-all border ${
                      isInCart 
                        ? 'bg-orange-950/40 border-orange-550/40 text-orange-400'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                    }`}
                  >
                    {isInCart ? `담김 (${cartQty})` : '추가하기'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected Pre-order Cart Summary */}
        {selectedOrders.length > 0 && (
          <div className="p-4.5 rounded-2xl bg-gradient-to-tr from-orange-950/15 to-zinc-900/50 border border-orange-550/20 shadow-[0_0_20px_rgba(249,115,22,0.06)] space-y-3.5 animate-slideDown">
            <div className="flex items-center justify-between border-b border-orange-500/10 pb-2">
              <span className="text-[10px] font-black text-orange-400 uppercase tracking-widest flex items-center gap-1">
                <ShoppingCart className="w-3.5 h-3.5 text-orange-500" />
                선주문 장바구니 ({selectedOrders.reduce((sum, item) => sum + item.quantity, 0)}개)
              </span>
              <button 
                type="button" 
                onClick={() => setSelectedOrders([])} 
                className="text-[9px] font-bold text-zinc-650 hover:text-zinc-400"
              >
                비우기
              </button>
            </div>

            <div className="space-y-2 max-h-40 overflow-y-auto scrollbar-none pr-1">
              {selectedOrders.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center bg-zinc-950/60 p-2.5 rounded-xl border border-zinc-905">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-white block">{item.name}</span>
                    {item.selectedOptions.length > 0 && (
                      <span className="text-[9px] text-zinc-550 block font-medium">
                        옵션: {item.selectedOptions.map(opt => `${opt.optionName}(${opt.itemName})`).join(', ')}
                      </span>
                    )}
                    <span className="text-[10px] font-black text-orange-450">
                      {(item.price * item.quantity).toLocaleString()}원
                    </span>
                  </div>

                  {/* Quantity Counter */}
                  <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
                    <button
                      type="button"
                      onClick={() => handleUpdateCartQuantity(idx, item.quantity - 1)}
                      className="p-1 rounded bg-zinc-950 text-zinc-400 hover:text-white"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-xs font-black font-mono w-4 text-center">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => handleUpdateCartQuantity(idx, item.quantity + 1)}
                      className="p-1 rounded bg-zinc-950 text-zinc-400 hover:text-white"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-zinc-900/60 flex justify-between items-center text-xs">
              <span className="text-zinc-550 font-bold">선주문 안주 총액</span>
              <span className="text-sm font-black text-orange-450">{preOrderTotal.toLocaleString()}원</span>
            </div>
          </div>
        )}
      </section>

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
                <span>{finalAmount.toLocaleString()}원 결제 완료하기</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Option Customizer Modal Overlay */}
      {activeOptionMenu && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="bg-zinc-950 border border-zinc-800 rounded-3xl w-full max-w-sm overflow-hidden shadow-[0_0_50px_rgba(249,115,22,0.15)] animate-slideUp">
            {/* Header */}
            <div className="p-5 border-b border-zinc-900 flex justify-between items-center bg-zinc-900/20">
              <div>
                <h4 className="text-sm font-black text-white">{activeOptionMenu.name}</h4>
                <p className="text-[10px] text-zinc-500 mt-0.5">원하시는 옵션을 선택해 주세요.</p>
              </div>
              <button 
                onClick={() => setActiveOptionMenu(null)}
                className="text-xs text-zinc-500 hover:text-white"
              >
                닫기
              </button>
            </div>

            {/* Content */}
            <div className="p-5 space-y-5 max-h-[60vh] overflow-y-auto scrollbar-none">
              {activeOptionMenu.options?.map((opt, optIdx) => (
                <div key={optIdx} className="space-y-2.5">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">
                    {opt.name} {opt.required && <span className="text-red-500">*필수</span>}
                  </label>
                  <div className="space-y-2">
                    {opt.items.map((item, itemIdx) => {
                      const isSelected = tempSelectedOptions.some(
                        t => t.optionName === opt.name && t.itemName === item.name
                      );
                      return (
                        <div 
                          key={itemIdx}
                          onClick={() => handleOptionChange(opt.name, item.name, item.price)}
                          className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                            isSelected 
                              ? 'bg-orange-950/20 border-orange-500/50 text-white' 
                              : 'bg-zinc-900/30 border-zinc-900 text-zinc-450 hover:text-zinc-350'
                          }`}
                        >
                          <span className="text-xs font-bold">{item.name}</span>
                          <span className="text-xs font-black text-orange-450">
                            {item.price > 0 ? `+${item.price.toLocaleString()}원` : '기본'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Quantity */}
              <div className="flex justify-between items-center pt-4 border-t border-zinc-900">
                <span className="text-xs font-bold text-zinc-400">수량 선택</span>
                <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-1.5">
                  <button
                    type="button"
                    onClick={() => setTempQuantity(Math.max(1, tempQuantity - 1))}
                    className="p-1 rounded bg-zinc-950 text-zinc-400 hover:text-white"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-xs font-black font-mono w-6 text-center">{tempQuantity}</span>
                  <button
                    type="button"
                    onClick={() => setTempQuantity(tempQuantity + 1)}
                    className="p-1 rounded bg-zinc-950 text-zinc-400 hover:text-white"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Action Bar */}
            <div className="p-4 bg-zinc-900/40 border-t border-zinc-900 flex gap-3">
              <button
                type="button"
                onClick={() => setActiveOptionMenu(null)}
                className="flex-1 py-3 text-xs font-bold bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-450 hover:text-white"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleAddWithOptionConfirm}
                className="flex-[2] py-3 text-xs font-black bg-gradient-to-r from-orange-500 to-amber-500 rounded-xl text-black hover:brightness-110 shadow-[0_0_20px_rgba(249,115,22,0.2)]"
              >
                {(
                  (activeOptionMenu.price + tempSelectedOptions.reduce((sum, opt) => sum + opt.price, 0)) * tempQuantity
                ).toLocaleString()}원 담기
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
