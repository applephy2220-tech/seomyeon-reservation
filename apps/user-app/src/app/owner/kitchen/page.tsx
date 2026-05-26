'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { db } from '@shared/firebase/clientApp';
import { collection, query, where, onSnapshot, doc, updateDoc, Timestamp, getDocs } from 'firebase/firestore';
import { Reservation, OrderItem } from '@shared/types';
import { triggerNotification } from '@shared/firebase/notification';
import { getOptimalPrepTime } from '@shared/services/recommendation';
import { 
  ChefHat, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  Flame, 
  TrendingUp,
  BellRing,
  Sparkles
} from 'lucide-react';

interface BestsellerItem {
  name: string;
  quantity: number;
  totalSales: number;
}

export default function KitchenConsolePage() {
  const [orders, setOrders] = useState<Reservation[]>([]);
  const [bestsellers, setBestsellers] = useState<BestsellerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  
  // Sound chime tracking ref to prevent multiple chime sounds simultaneously
  const audioChimeRef = useRef<HTMLAudioElement | null>(null);
  const prevOrdersCountRef = useRef<number>(0);

  // Time ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 10000); // refresh every 10 seconds for ETA calculations
    return () => clearInterval(timer);
  }, []);

  // Audio initialize
  useEffect(() => {
    if (typeof window !== 'undefined') {
      audioChimeRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-120.wav');
      audioChimeRef.current.volume = 0.4;
    }
  }, []);

  // Listen for real-time kitchen orders
  useEffect(() => {
    const reservationsCol = collection(db, 'reservations');
    // Query active orders (where orders field has elements and status is not served/cancelled/noshow)
    const q = query(
      reservationsCol, 
      where('orderStatus', 'in', ['pending', 'preparing', 'ready'])
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const activeOrders: Reservation[] = [];
      snap.forEach((docSnap) => {
        activeOrders.push({ id: docSnap.id, ...docSnap.data() } as Reservation);
      });

      // Sort by arrival countdown priority (closer ETA first)
      activeOrders.sort((a, b) => {
        const remainingA = getRemainingMinutesToArrival(a.createdAt, a.eta);
        const remainingB = getRemainingMinutesToArrival(b.createdAt, b.eta);
        return remainingA - remainingB;
      });

      // Play Chime on new orders
      if (prevOrdersCountRef.current > 0 && activeOrders.length > prevOrdersCountRef.current) {
        audioChimeRef.current?.play().catch(e => console.log('Audio autoplay blocked or failed:', e));
      }
      
      prevOrdersCountRef.current = activeOrders.length;
      setOrders(activeOrders);
      setLoading(false);
    }, (err) => {
      console.error('Error listening to kitchen orders:', err);
      setLoading(false);
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch sales analytics and calculate top-selling menu items dynamically
  useEffect(() => {
    const fetchTopMenus = async () => {
      try {
        const reservationsCol = collection(db, 'reservations');
        const snap = await getDocs(reservationsCol);
        const menuCounts: { [name: string]: { qty: number; sales: number } } = {};

        snap.forEach((docSnap) => {
          const res = docSnap.data() as Reservation;
          if (res.orders && res.orders.length > 0) {
            res.orders.forEach((item) => {
              if (menuCounts[item.name]) {
                menuCounts[item.name].qty += item.quantity;
                menuCounts[item.name].sales += item.price * item.quantity;
              } else {
                menuCounts[item.name] = {
                  qty: item.quantity,
                  sales: item.price * item.quantity
                };
              }
            });
          }
        });

        const sorted = Object.entries(menuCounts)
          .map(([name, stat]) => ({
            name,
            quantity: stat.qty,
            totalSales: stat.sales
          }))
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 3); // top 3 signatures

        setBestsellers(sorted);
      } catch (err) {
        console.error('Error fetching bestsellers:', err);
      }
    };

    fetchTopMenus();
    // Refetch analytics every 60 seconds
    const interval = setInterval(fetchTopMenus, 60000);
    return () => clearInterval(interval);
  }, [orders]);

  // Helper: Calculate remaining time to guest arrival in minutes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getRemainingMinutesToArrival = (createdAtTimestamp: any, etaStr: string | null | undefined) => {
    if (!createdAtTimestamp) return 999;

    let minutesToAdd = 0;
    const cleanEta = etaStr || '';
    if (cleanEta.includes('10분')) {
      minutesToAdd = 10;
    } else if (cleanEta.includes('20분')) {
      minutesToAdd = 20;
    } else if (cleanEta.includes('30분')) {
      minutesToAdd = 30;
    } else {
      minutesToAdd = 0; // 도착 즉시 서빙 또는 ETA 미정
    }

    let createdAtDate: Date;
    if (typeof createdAtTimestamp.toDate === 'function') {
      createdAtDate = createdAtTimestamp.toDate();
    } else {
      createdAtDate = new Date(createdAtTimestamp);
    }

    const arrivalTime = new Date(createdAtDate.getTime() + minutesToAdd * 60 * 1000);
    const diffMs = arrivalTime.getTime() - currentTime.getTime();
    return Math.round(diffMs / (60 * 1000));
  };

  // State transitions:
  const handleUpdateOrderStatus = async (reservationId: string, nextStatus: 'preparing' | 'ready' | 'served', reservation: Reservation) => {
    try {
      const resRef = doc(db, 'reservations', reservationId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updatePayload: any = {
        orderStatus: nextStatus,
        updatedAt: Timestamp.now()
      };

      if (nextStatus === 'preparing') {
        updatePayload.cookingStartedAt = Timestamp.now();
      }

      await updateDoc(resRef, updatePayload);

      // Trigger custom notification alert to the guest in real-time
      if (nextStatus === 'preparing') {
        triggerNotification(
          reservation.userId,
          '🍳 안주 조리 시작!',
          `[${reservation.venueName}] 선주문하신 메뉴의 즉시 조리가 시작되었습니다! 즐거운 방문 되세요.`,
          '/profile'
        );
      } else if (nextStatus === 'ready') {
        triggerNotification(
          reservation.userId,
          '🔔 조리 완료! 테이블 세팅 완료!',
          `[${reservation.venueName}] 선주문하신 시그니처 메뉴 조리가 완벽하게 끝났습니다! 테이블에 즉시 서빙 대기 중입니다.`,
          '/profile'
        );
      } else if (nextStatus === 'served') {
        // served ends the active kitchen flow
        triggerNotification(
          reservation.userId,
          '🍺 서빙 완료! 맛있는 시간 되세요!',
          `[${reservation.venueName}] 선주문 메뉴 서빙이 정상적으로 완료되었습니다. 멋진 서면의 밤을 즐기세요!`,
          '/profile'
        );
      }

    } catch (err) {
      console.error('Failed to transition order status:', err);
      alert('상태 변경 도중 에러가 발생했습니다.');
    }
  };

  return (
    <main className="min-h-screen bg-[#09090A] text-white p-6 max-w-5xl mx-auto shadow-2xl border-x border-zinc-900 pb-20">
      
      {/* 1. Cyberpunk Neon Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-zinc-900 pb-6 gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
            </span>
            <span className="text-[10px] font-black uppercase text-orange-400 tracking-widest">
              Kitchen Preparation Center
            </span>
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <ChefHat className="w-7 h-7 text-orange-500" />
            실시간 주방 조리 관제 콘솔
          </h2>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/owner/dashboard"
            className="px-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-xs font-bold text-zinc-400 hover:text-white transition-colors"
          >
            통계 대시보드
          </Link>
          <div className="px-4 py-2.5 rounded-xl bg-zinc-950 border border-zinc-900 text-xs font-mono font-bold text-zinc-500 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            {currentTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        </div>
      </div>

      {/* 2. Main Columns Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
        
        {/* Left 2 Columns: Live Prep Queue */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-zinc-400 uppercase tracking-wider flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-500" />
              조리 및 서빙 대기 큐 ({orders.length}건)
            </h3>
            {orders.length > 0 && (
              <span className="text-[10px] text-zinc-650 animate-pulse">
                ※ 도착 시간 기준 자동 우선정렬
              </span>
            )}
          </div>

          {loading ? (
            <div className="p-12 text-center rounded-3xl bg-zinc-900/20 border border-dashed border-zinc-800 text-zinc-500 text-xs">
              실시간 예약 데이터베이스 동기화 중...
            </div>
          ) : orders.length === 0 ? (
            <div className="p-16 text-center rounded-3xl bg-zinc-900/10 border border-zinc-900/60 text-zinc-500 space-y-3 flex flex-col items-center">
              <CheckCircle2 className="w-8 h-8 text-zinc-850" />
              <div>
                <p className="text-xs font-bold text-zinc-400">대기 중인 선주문 조리 건이 없습니다.</p>
                <p className="text-[10px] text-zinc-600 mt-1">예약 확정 시 주문이 이곳에 실시간 연동됩니다.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map((res) => {
                const remainingMin = getRemainingMinutesToArrival(res.createdAt, res.eta);
                const isUrgent = remainingMin <= 15 && res.orderStatus === 'pending';
                const activeQueueCount = orders.filter(o => o.orderStatus === 'pending').length;
                const prepInsight = getOptimalPrepTime(res, activeQueueCount);
                
                return (
                  <div
                    key={res.id}
                    className={`rounded-2xl border transition-all relative overflow-hidden p-5 ${
                      isUrgent 
                        ? 'bg-gradient-to-br from-amber-950/15 to-zinc-950 border-amber-500/40 shadow-[0_0_20px_rgba(245,158,11,0.06)]'
                        : res.orderStatus === 'preparing'
                          ? 'bg-gradient-to-br from-orange-950/10 to-zinc-950 border-orange-500/25'
                          : res.orderStatus === 'ready'
                            ? 'bg-gradient-to-br from-emerald-950/10 to-zinc-950 border-emerald-500/25'
                            : 'bg-zinc-900/30 border-zinc-900'
                    }`}
                  >
                    {/* Status Badge */}
                    <div className="flex justify-between items-start gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`px-2.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                            res.orderStatus === 'pending'
                              ? 'bg-zinc-950 text-zinc-450 border border-zinc-800'
                              : res.orderStatus === 'preparing'
                                ? 'bg-orange-950 text-orange-400 border border-orange-500/20'
                                : 'bg-emerald-950 text-emerald-400 border border-emerald-500/20'
                          }`}>
                            {res.orderStatus === 'pending' ? '대기 중' : res.orderStatus === 'preparing' ? '조리 중' : '조리 완료'}
                          </span>
                          <span className="text-xs font-bold text-white">{res.seatLabel} 테이블</span>
                        </div>
                        <p className="text-[10px] text-zinc-500 font-medium">예약 번호: {res.id.slice(0, 8)}...</p>
                      </div>

                      {/* Remaining ETA Alarm Banner */}
                      <div className="text-right">
                        {remainingMin <= 0 ? (
                          <span className="inline-flex items-center gap-1 rounded bg-red-950 border border-red-500/20 px-2 py-0.5 text-[10px] font-black text-red-400 animate-pulse">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            손님 도착 완료 단계
                          </span>
                        ) : (
                          <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-black border ${
                            isUrgent 
                              ? 'bg-amber-950 border-amber-500/30 text-amber-400 animate-pulse' 
                              : 'bg-zinc-950 border-zinc-850 text-zinc-400'
                          }`}>
                            <Clock className="w-3.5 h-3.5" />
                            도착 {remainingMin}분 전 ({res.eta || '도착 즉시'})
                          </span>
                        )}
                      </div>
                    </div>

                    {/* AI Smart Cooking Dispatcher Insight */}
                    {res.orderStatus === 'pending' && (
                      <div className="mt-3.5 p-3 rounded-xl bg-purple-950/20 border border-purple-500/20 text-[10px] font-black text-purple-450 flex items-center gap-1.5 shadow-[0_0_10px_rgba(168,85,247,0.05)]">
                        <Sparkles className="w-3.5 h-3.5 text-purple-400 animate-pulse fill-purple-400" />
                        <span>{prepInsight.prompt}</span>
                      </div>
                    )}

                    {/* Urgent Prep Banner Alert */}
                    {isUrgent && (
                      <div className="mt-3.5 p-2.5 rounded-xl bg-amber-950/20 border border-amber-500/20 text-[10px] font-black text-amber-400 flex items-center gap-1.5 animate-pulse">
                        <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                        🚨 조리 시작 권장 알림 (도착 15분 전입니다. 조리를 즉시 진행해 주세요!)
                      </div>
                    )}

                    {/* Order Details List */}
                    <div className="mt-4 bg-zinc-950/60 border border-zinc-905 rounded-xl p-3.5 space-y-2">
                      <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest block">
                        주문 내역
                      </span>
                      <div className="space-y-1.5">
                        {res.orders?.map((item: OrderItem, idx: number) => (
                          <div key={idx} className="flex justify-between items-center text-xs">
                            <div className="space-y-0.5">
                              <span className="font-bold text-zinc-200">
                                {item.name} <span className="text-orange-450 font-black">x {item.quantity}개</span>
                              </span>
                              {item.selectedOptions && item.selectedOptions.length > 0 && (
                                <p className="text-[9px] text-zinc-500 font-medium">
                                  - 옵션: {item.selectedOptions.map(opt => `${opt.optionName}(${opt.itemName})`).join(', ')}
                                </p>
                              )}
                            </div>
                            <span className="font-mono text-zinc-450">{(item.price * item.quantity).toLocaleString()}원</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Control Buttons for Kitchen workflow */}
                    <div className="mt-4 flex flex-wrap gap-2.5 justify-end pt-3 border-t border-zinc-900">
                      {res.orderStatus === 'pending' && (
                        <button
                          onClick={() => handleUpdateOrderStatus(res.id, 'preparing', res)}
                          className="px-4 py-2 rounded-xl bg-orange-500 text-black font-black text-xs hover:brightness-110 shadow-[0_0_15px_rgba(249,115,22,0.15)] flex items-center gap-1 transition-all"
                        >
                          <Flame className="w-3.5 h-3.5 fill-black" />
                          조리 시작
                        </button>
                      )}
                      
                      {res.orderStatus === 'preparing' && (
                        <button
                          onClick={() => handleUpdateOrderStatus(res.id, 'ready', res)}
                          className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-black font-black text-xs hover:brightness-110 shadow-[0_0_15px_rgba(16,185,129,0.15)] flex items-center gap-1 transition-all animate-bounce"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 stroke-[3px]" />
                          조리 완료 (테이블 세팅)
                        </button>
                      )}

                      {res.orderStatus === 'ready' && (
                        <button
                          onClick={() => handleUpdateOrderStatus(res.id, 'served', res)}
                          className="px-4 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white font-black text-xs hover:bg-zinc-700 flex items-center gap-1 transition-all"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-zinc-400" />
                          서빙 완료 (대시보드로 이전)
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Sidebar: Analytics & Kitchen Stats */}
        <div className="space-y-6">
          
          {/* Section 1: Kitchen Metrics Panel */}
          <div className="p-5 rounded-3xl bg-zinc-900/40 border border-zinc-850 backdrop-blur-md space-y-4">
            <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1.5 pb-2 border-b border-zinc-900">
              <ChefHat className="w-4 h-4 text-purple-400" />
              실시간 주방 지표
            </h3>
            
            <div className="grid grid-cols-2 gap-3.5">
              <div className="p-3 bg-zinc-950 rounded-2xl border border-zinc-900 text-center">
                <span className="text-[10px] text-zinc-550 block font-bold">조리 대기</span>
                <span className="text-xl font-black text-white mt-1 block">
                  {orders.filter(o => o.orderStatus === 'pending').length}
                </span>
              </div>
              <div className="p-3 bg-zinc-950 rounded-2xl border border-zinc-900 text-center">
                <span className="text-[10px] text-zinc-550 block font-bold">진행 중</span>
                <span className="text-xl font-black text-orange-450 mt-1 block">
                  {orders.filter(o => o.orderStatus === 'preparing').length}
                </span>
              </div>
            </div>
            
            <div className="p-3.5 rounded-2xl bg-zinc-950/60 border border-zinc-905 flex justify-between items-center text-xs">
              <span className="text-zinc-500 font-bold">평균 조리 속도 목표</span>
              <span className="font-black text-orange-450 flex items-center gap-0.5">
                <Sparkles className="w-3.5 h-3.5 fill-orange-450 stroke-none" />
                15분 이내
              </span>
            </div>
          </div>

          {/* Section 2: Top Selling Menu Bestseller Panel */}
          <div className="p-5 rounded-3xl bg-zinc-900/40 border border-zinc-850 backdrop-blur-md space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-900">
              <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-orange-500" />
                인기 시그니처 랭킹
              </h3>
              <span className="text-[9px] text-zinc-550 font-bold flex items-center gap-0.5">
                <BellRing className="w-3 h-3" />
                실시간 업데이트
              </span>
            </div>

            {bestsellers.length === 0 ? (
              <p className="text-[10px] text-zinc-550 text-center py-4 font-medium">아직 집계된 선주문 내역이 없습니다.</p>
            ) : (
              <div className="space-y-3">
                {bestsellers.map((item, idx) => (
                  <div 
                    key={idx} 
                    className="p-3 bg-zinc-950/70 border border-zinc-900 rounded-2xl flex items-center justify-between gap-3 relative overflow-hidden"
                  >
                    <div className="flex items-center gap-2.5">
                      {/* Rank Medal */}
                      <span className={`w-6 h-6 rounded-lg text-[10.5px] font-black flex items-center justify-center border ${
                        idx === 0 
                          ? 'bg-amber-950/40 text-amber-400 border-amber-500/30'
                          : idx === 1
                            ? 'bg-zinc-850/60 text-zinc-300 border-zinc-800'
                            : 'bg-orange-950/20 text-orange-450 border-orange-900/20'
                      }`}>
                        {idx + 1}
                      </span>

                      <div>
                        <span className="text-xs font-bold text-white block">{item.name}</span>
                        <span className="text-[9px] text-zinc-550 font-bold block mt-0.5">
                          누적 매출: {item.totalSales.toLocaleString()}원
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-[10.5px] font-black text-orange-450 block">{item.quantity}개</span>
                      <span className="text-[8px] text-zinc-650 font-bold uppercase tracking-wider block mt-0.5">Sold Out</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            <p className="text-[9.5px] text-zinc-550 leading-relaxed font-medium pl-0.5">
              💡 실시간 누적 선주문 수량을 집계하여 가장 회전율이 높은 메뉴 TOP 3를 실시간 노출합니다.
            </p>
          </div>

        </div>

      </div>

    </main>
  );
}
