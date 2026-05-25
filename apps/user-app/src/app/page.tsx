'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRealtimeVenues } from '@shared/hooks/useRealtimeVenues';
import { useRealtimeSeats } from '@shared/hooks/useRealtimeSeats';
import { useRealtimeDeals } from '@shared/firebase/deals';
import { VenueCard } from '@shared/components/VenueCard';
import { SeatCard } from '@shared/components/SeatCard';
import { LoadingSpinner } from '@shared/components/LoadingSpinner';
import { BottomNavigation } from '@shared/components/BottomNavigation';
import { Seat } from '@shared/types';
import { lockSeatTransaction } from '@shared/firebase/booking';
import { 
  Flame, 
  Search, 
  Sparkles, 
  MapPin, 
  Database,
  ArrowRight,
  TrendingUp,
  CheckCircle2,
  SlidersHorizontal,
  Zap,
  Timer
} from 'lucide-react';

const DealCountdown = ({ validUntil }: { validUntil: string }) => {
  const [timeLeft, setTimeLeft] = React.useState('');

  React.useEffect(() => {
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
      setTimeLeft(`${mins}:${secs.toString().padStart(2, '0')}`);
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [validUntil]);

  return (
    <span className="flex items-center gap-1 text-[10px] font-black text-orange-400 bg-orange-950/50 border border-orange-500/20 px-2 py-0.5 rounded shadow-[0_0_6px_rgba(249,115,22,0.2)]">
      <Timer className="w-3 h-3 text-orange-500 animate-pulse" />
      {timeLeft}
    </span>
  );
};

export default function HomePage() {
  const router = useRouter();
  // 1. Subscribe to real-time collections
  const { venues, loading: venuesLoading } = useRealtimeVenues();
  const { seats: availableSeats, loading: seatsLoading } = useRealtimeSeats({ onlyAvailable: true });
  const { deals: activeDeals } = useRealtimeDeals({ onlyActive: true });

  // UI State
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('전체');
  const [reserveLoadingId, setReserveLoadingId] = useState<string | null>(null);
  const [successDialog, setSuccessDialog] = useState<{ label: string } | null>(null);

  // Fast Category filters
  const CATEGORIES = ['전체', '이자카야', '감성포차', '수제맥주', '요리주점'];

  // 2. Real-time Reservation lock from Home board
  const handleFastReserve = async (seat: Seat) => {
    setReserveLoadingId(seat.id);
    try {
      // Execute transactional lock logic for 'demo-user'
      const result = await lockSeatTransaction(seat.id, 'demo-user');
      
      if (result.success) {
        // Redirect to reservation detail page on success
        router.push(`/reservation/${seat.id}`);
      } else {
        // Show failure warning if already locked/reserved
        alert(result.message || '이미 다른 사용자가 선택한 자리입니다.');
      }
    } catch (err) {
      console.error('Error reserving seat:', err);
      alert('예약 선점 과정에서 오류가 발생했습니다.');
    } finally {
      setReserveLoadingId(null);
    }
  };

  // 3. Dynamic Filtering Logic
  const filteredVenues = venues.filter((venue) => {
    const matchesSearch = venue.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          venue.category.includes(searchTerm);
    const matchesCategory = activeCategory === '전체' || venue.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  // Helper: map seat to its venue name
  const getVenueName = (venueId: string) => {
    const matched = venues.find(v => v.id === venueId);
    return matched ? matched.name : '서면 술집';
  };

  // Helper: map seat to its active deal benefit
  const getDealBenefitForSeat = (seatId: string) => {
    const matched = activeDeals.find(d => d.seatId === seatId);
    return matched ? matched.benefitValue : undefined;
  };

  // Helper: calculate empty vacancy dynamically for a venue
  const getAvailableSeatsCount = (venueId: string) => {
    return availableSeats.filter(s => s.venueId === venueId).length;
  };

  const isDatabaseEmpty = !venuesLoading && venues.length === 0;
  const isLoading = venuesLoading || seatsLoading;

  return (
    <main className="min-h-screen bg-[#0B0B0C] text-white pb-32 max-w-md mx-auto relative shadow-2xl border-x border-zinc-900">
      
      {/* Background Neon Ambient Orbs */}
      <div className="absolute top-[-50px] right-[-50px] w-64 h-64 rounded-full bg-cyan-500/10 blur-[90px] pointer-events-none"></div>
      <div className="absolute top-[250px] left-[-100px] w-72 h-72 rounded-full bg-purple-500/10 blur-[100px] pointer-events-none"></div>

      {/* 1. Header Banner */}
      <header className="px-6 pt-8 pb-4 flex justify-between items-center relative z-10">
        <div>
          <span className="text-[10px] font-bold tracking-widest text-cyan-400 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-500/20">
            BUSAN SEOMYEON LIVE
          </span>
          <h1 className="text-xl font-black text-white tracking-tight mt-1 flex items-center gap-1">
            서면빈자리 <TrendingUp className="w-4 h-4 text-purple-400" />
          </h1>
        </div>
        
        {/* Quick Map Indicator button */}
        <Link href="/login" className="flex items-center gap-1.5 rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2 text-xs font-semibold hover:border-purple-500/40 transition-colors">
          <MapPin className="w-3.5 h-3.5 text-purple-400" />
          <span>서면역</span>
        </Link>
      </header>

      {/* 2. Hero Interactive Banner */}
      <section className="px-6 py-4 relative z-10">
        <div className="p-6 rounded-2xl bg-gradient-to-tr from-purple-950/40 via-zinc-900/60 to-cyan-950/20 border border-zinc-800/80 backdrop-blur-md relative overflow-hidden">
          {/* Subtle neon light ray */}
          <div className="absolute -top-10 -right-10 w-24 h-24 bg-purple-500/20 blur-[30px] rounded-full"></div>
          
          <div className="space-y-1">
            <span className="text-xs text-purple-400 font-bold tracking-tight">현장 100% 실시간</span>
            <h2 className="text-xl font-extrabold text-white tracking-tight leading-snug">
              “지금 바로 입장 가능한 술집”
            </h2>
            <p className="text-xs text-zinc-500 leading-normal pt-1">
              더미 데이터가 아닌 실시간 Firestore 연동 테이블. <br />
              원하는 자리를 터치해 즉시 임시 선점하세요.
            </p>
          </div>

          <div className="mt-4 flex items-center gap-3 bg-black/40 border border-zinc-800/40 rounded-xl p-3 text-xs">
            <div className="flex -space-x-1.5 overflow-hidden">
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-[9px] font-bold text-emerald-400">P</span>
              <span className="w-5 h-5 rounded-full bg-purple-500/20 border border-purple-400/40 flex items-center justify-center text-[9px] font-bold text-purple-400">V</span>
            </div>
            <span className="text-zinc-400">
              현재 서면구역에 총 <b className="text-cyan-400">{availableSeats.length}개</b>의 빈자리가 있습니다!
            </span>
          </div>
        </div>
      </section>

      {/* 3. Empty DB Notification Helper */}
      {isDatabaseEmpty && (
        <section className="px-6 py-2 animate-fadeIn relative z-10">
          <div className="p-5 rounded-2xl bg-zinc-950/60 border border-amber-500/20 backdrop-blur-md space-y-4">
            <div className="flex gap-3">
              <Database className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5 animate-bounce" />
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-white">데이터베이스가 비어있습니다!</h4>
                <p className="text-[10px] text-zinc-500 leading-relaxed">
                  원활한 실시간 체험을 위해 로그인 탭에서 클릭 한 번으로 서면 술집과 실시간 좌석 데이터를 간편하게 생성할 수 있습니다.
                </p>
              </div>
            </div>
            <Link 
              href="/login" 
              className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-amber-550/20 border border-amber-500/30 text-[11px] font-bold text-amber-400 py-2.5 hover:bg-amber-950/20 transition-all"
            >
              <span>데모 데이터 생성하러 가기</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </section>
      )}

      {/* Emergency Deals Section */}
      {activeDeals.length > 0 && (
        <section className="px-6 mt-4 relative z-10 animate-fadeIn">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-black tracking-widest text-orange-400 uppercase flex items-center gap-1.5 animate-pulse">
              <Zap className="w-4 h-4 text-orange-500 animate-bounce" />
              🔥 지금 뜬 서면 긴급딜! ({activeDeals.length})
            </h3>
            <span className="text-[9px] font-bold text-zinc-550 uppercase">TIME LIMITED</span>
          </div>

          <div className="flex gap-4 overflow-x-auto pb-3 scrollbar-none snap-x snap-mandatory">
            {activeDeals.map((deal) => {
              const matchedVenue = venues.find(v => v.id === deal.venueId);
              const matchedSeat = availableSeats.find(s => s.id === deal.seatId);
              
              if (!matchedSeat) return null;

              const timeRemainingMs = new Date(deal.validUntil).getTime() - Date.now();
              const isUrgent = timeRemainingMs > 0 && timeRemainingMs < 10 * 60 * 1000;

              return (
                <div 
                  key={deal.id} 
                  onClick={() => router.push(`/venue/${deal.venueId}`)}
                  className={`w-[300px] flex-shrink-0 snap-start p-4 rounded-2xl border relative overflow-hidden flex flex-col justify-between cursor-pointer transition-all duration-300 ${
                    isUrgent 
                      ? 'bg-gradient-to-tr from-red-950/20 via-zinc-950/95 to-orange-950/10 border-red-500/70 shadow-[0_0_20px_rgba(239,68,68,0.25)] hover:border-red-500 hover:shadow-[0_0_25px_rgba(239,68,68,0.4)]' 
                      : 'bg-gradient-to-tr from-orange-950/25 via-zinc-950/95 to-amber-950/10 border-orange-550/30 shadow-[0_0_15px_rgba(249,115,22,0.15)] hover:border-orange-500/60'
                  }`}
                >
                  <div className="absolute top-[-30px] right-[-30px] w-24 h-24 bg-orange-500/10 blur-[25px] rounded-full pointer-events-none"></div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-extrabold text-orange-400 uppercase tracking-widest bg-orange-950/60 px-2 py-0.5 rounded border border-orange-500/20">
                        {matchedVenue?.category || '핫플레이스'} • {matchedVenue?.name || '서면 술집'}
                      </span>
                      <div className="flex items-center gap-1">
                        {isUrgent && (
                          <span className="inline-flex items-center rounded bg-red-950/80 border border-red-500/40 px-1.5 py-0.5 text-[8px] font-black text-red-400 animate-pulse shadow-[0_0_6px_rgba(239,68,68,0.2)]">
                            🚨 마감 임박
                          </span>
                        )}
                        <DealCountdown validUntil={deal.validUntil} />
                      </div>
                    </div>

                    <h4 className="text-sm font-extrabold text-white tracking-tight mt-1">{deal.title}</h4>
                    <p className="text-[10px] text-zinc-400 leading-normal line-clamp-2">{deal.description}</p>
                    
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <div className="inline-flex items-center gap-0.5 text-[10px] font-black text-amber-300 bg-amber-950/30 border border-amber-500/20 px-2 py-0.5 rounded-lg">
                        <span>🎁 {deal.benefitValue}</span>
                      </div>
                      <div className="inline-flex items-center gap-0.5 text-[10px] font-black text-orange-400 bg-orange-950/30 border border-orange-500/20 px-2 py-0.5 rounded-lg animate-pulse">
                        <span>⚡ 남은 수량: {deal.remainingSlots}자리</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/venue/${deal.venueId}`);
                    }}
                    className="mt-4 w-full py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:brightness-110 text-xs font-black text-black rounded-xl transition-all shadow-[0_0_12px_rgba(249,115,22,0.25)] flex items-center justify-center gap-1 active:scale-[0.97]"
                  >
                    <span>매장 상세 보기 & 딜 선점하기</span>
                    <ArrowRight className="w-3.5 h-3.5 stroke-[3]" />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 4. Live Seat Board (Horizontal scroll grid) */}
      {!isLoading && availableSeats.length > 0 && (
        <section id="seats-section" className="mt-4 relative z-10 scroll-mt-4">
          <div className="px-6 flex items-center justify-between">
            <h3 className="text-xs font-black tracking-widest text-zinc-400 uppercase flex items-center gap-1">
              <Flame className="w-4 h-4 text-emerald-400 animate-pulse" />
              실시간 초긴급 빈자리 목록
            </h3>
            <span className="text-[10px] text-zinc-500">실시간 매칭</span>
          </div>

          <div className="mt-3 flex gap-4 overflow-x-auto px-6 pb-4 scrollbar-none snap-x snap-mandatory">
            {availableSeats.map((seat) => (
              <div key={seat.id} className="w-[280px] flex-shrink-0 snap-start">
                <SeatCard
                  seat={seat}
                  venueName={getVenueName(seat.venueId)}
                  onReserve={handleFastReserve}
                  isReserving={reserveLoadingId === seat.id}
                  dealBenefitValue={getDealBenefitForSeat(seat.id)}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 5. Venues Explorer Section */}
      <section className="mt-6 px-6 relative z-10 space-y-4">
        {/* Search Bar */}
        <div className="relative">
          <input
            type="text"
            placeholder="술집 이름, 안주명, 카테고리 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-zinc-950/80 border border-zinc-900 rounded-xl py-3 pl-10 pr-10 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500/50 transition-colors shadow-inner"
          />
          <Search className="w-4 h-4 text-zinc-600 absolute left-3.5 top-3.5" />
          <button className="absolute right-3 top-3 p-1 rounded-md hover:bg-zinc-800 text-zinc-500">
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Category Filters */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all duration-200 border ${
                activeCategory === cat
                  ? 'bg-purple-950/40 text-purple-400 border-purple-500/40 shadow-[0_0_10px_rgba(168,85,247,0.1)]'
                  : 'bg-zinc-900/40 text-zinc-500 border-zinc-800/60 hover:text-zinc-300'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Venues Card List */}
        <div className="space-y-4 pt-2">
          <h3 className="text-xs font-black tracking-widest text-zinc-400 uppercase">
            {activeCategory} 술집 디렉토리 ({filteredVenues.length})
          </h3>

          {isLoading ? (
            <div className="py-12">
              <LoadingSpinner />
            </div>
          ) : filteredVenues.length > 0 ? (
            <div className="grid grid-cols-1 gap-4">
              {filteredVenues.map((venue) => (
                <VenueCard
                  key={venue.id}
                  venue={venue}
                  availableSeatsCount={getAvailableSeatsCount(venue.id)}
                />
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-zinc-600 space-y-2 border border-dashed border-zinc-900 rounded-2xl">
              <Sparkles className="w-6 h-6 text-zinc-850 mx-auto" />
              <p className="text-xs font-bold">검색 매칭 결과가 없습니다.</p>
              <p className="text-[10px]">다른 키워드나 태그를 선택해보세요.</p>
            </div>
          )}
        </div>
      </section>

      {/* Interactive Mock Modal */}
      {successDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-xs p-6 rounded-2xl bg-zinc-900 border border-emerald-500/30 text-center space-y-4 shadow-[0_0_30px_rgba(16,185,129,0.15)]">
            <div className="w-12 h-12 rounded-full bg-emerald-950 flex items-center justify-center mx-auto border border-emerald-500/20 animate-bounce">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            </div>
            
            <div className="space-y-1">
              <h4 className="text-base font-bold text-white">[{successDialog.label}] 선점 완료</h4>
              <p className="text-[11px] text-zinc-400 leading-relaxed pt-1">
                좌석이 임시로 잠겼습니다! <br />
                실시간 연동을 증명하기 위해 다른 브라우저 창이나 기기에서도 해당 좌석이 <b>[결제 진행 중]</b> 상태로 표시됩니다!
              </p>
            </div>

            <button 
              onClick={() => setSuccessDialog(null)}
              className="w-full rounded-xl bg-emerald-500 py-2.5 text-xs font-bold text-black hover:brightness-110 transition-all"
            >
              확인
            </button>
          </div>
        </div>
      )}

      {/* Bottom PWA Spacer & Navigation */}
      <BottomNavigation availableCount={availableSeats.length} />
    </main>
  );
}
