'use client';

import React, { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRealtimeVenueDetail } from '@shared/hooks/useRealtimeVenues';
import { useRealtimeSeats } from '@shared/hooks/useRealtimeSeats';
import { useRealtimeDeals } from '@shared/firebase/deals';
import { SeatCard } from '@shared/components/SeatCard';
import { LoadingSpinner } from '@shared/components/LoadingSpinner';
import { BottomNavigation } from '@shared/components/BottomNavigation';
import { Seat } from '@shared/types';
import { lockSeatTransaction } from '@shared/firebase/booking';
import { useAuth } from '@shared/hooks/useAuth';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '@shared/firebase/clientApp';
import { 
  ArrowLeft, 
  Star, 
  MapPin, 
  Phone, 
  Info,
  Flame,
  CheckCircle2,
  AlertTriangle,
  Send
} from 'lucide-react';

interface VenuePageProps {
  params: Promise<{ id: string }>;
}

const getCategoryPlaceholder = (category: string) => {
  const c = category || '';
  if (c.includes('맥주') || c.includes('수제맥주') || c.includes('펍')) {
    return {
      gradient: 'from-amber-600/40 via-orange-600/10 to-[#0B0B0C]',
      emoji: '🍺',
      label: '수제맥주 & 크래프트 펍'
    };
  }
  if (c.includes('포차') || c.includes('포장마차') || c.includes('감성포차')) {
    return {
      gradient: 'from-rose-600/40 via-pink-600/10 to-[#0B0B0C]',
      emoji: '⛺',
      label: '감성 실내포차'
    };
  }
  if (c.includes('이자카야') || c.includes('야키토리') || c.includes('오뎅') || c.includes('밀락오뎅')) {
    return {
      gradient: 'from-red-700/40 via-amber-900/10 to-[#0B0B0C]',
      emoji: '🏮',
      label: '정통 이자카야'
    };
  }
  if (c.includes('바') || c.includes('라운지') || c.includes('요리주점') || c.includes('주점')) {
    return {
      gradient: 'from-purple-600/40 via-blue-600/10 to-[#0B0B0C]',
      emoji: '🍸',
      label: '네온 다이닝 라운지'
    };
  }
  return {
    gradient: 'from-cyan-600/40 via-purple-600/10 to-[#0B0B0C]',
    emoji: '🥂',
    label: '실시간 서면 핫플레이스'
  };
};

export default function VenueDetailPage({ params }: VenuePageProps) {
  const router = useRouter();
  const resolvedParams = use(params);
  const venueId = resolvedParams.id;

  // Real-time hooks subscriptions
  const { venue, loading: venueLoading } = useRealtimeVenueDetail(venueId);
  const { seats, loading: seatsLoading } = useRealtimeSeats({ venueId });
  const { seats: globalAvailableSeats } = useRealtimeSeats({ onlyAvailable: true });
  const { deals: activeDeals } = useRealtimeDeals({ venueId, onlyActive: true });

  const getDealBenefitForSeat = (seatId: string) => {
    const matched = activeDeals.find(d => d.seatId === seatId);
    return matched ? matched.benefitValue : undefined;
  };

  const [reserveLoadingId, setReserveLoadingId] = useState<string | null>(null);
  const [successDialog, setSuccessDialog] = useState<{ label: string } | null>(null);
  const [imgError, setImgError] = useState(false);

  // User Auth and Report States
  const { user, profile } = useAuth();
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState('허위 정보');
  const [reportDesc, setReportDesc] = useState('');
  const [isReporting, setIsReporting] = useState(false);

  const handleCreateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      alert('신고 기능을 이용하려면 로그인이 필요합니다.');
      router.push('/login');
      return;
    }
    
    setIsReporting(true);
    try {
      await addDoc(collection(db, 'reports'), {
        reporterId: user.uid,
        reporterName: profile?.displayName || user.email || '익명 나들이객',
        targetType: 'venue',
        targetId: venueId,
        targetName: venue?.name || '알 수 없는 매장',
        reason: reportReason,
        description: reportDesc,
        status: 'pending',
        createdAt: new Date().toISOString()
      });
      alert('신고가 성공적으로 접수되었습니다. 관리자 검토 후 조치됩니다.');
      setIsReportModalOpen(false);
      setReportDesc('');
    } catch (err) {
      console.error('Error reporting venue:', err);
      alert('신고 등록 중 오류가 발생했습니다.');
    } finally {
      setIsReporting(false);
    }
  };

  // Firestore Interactive Seating: lock seat in real-time
  const handleReserveSeat = async (seat: Seat) => {
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
    } catch (error) {
      console.error('Error updating seat reservation:', error);
      alert('예약 처리 중 오류가 발생했습니다.');
    } finally {
      setReserveLoadingId(null);
    }
  };

  if (venueLoading || seatsLoading) {
    return <LoadingSpinner fullPage message="가게 정보를 실시간 연동하고 있습니다..." />;
  }

  if (!venue) {
    return (
      <main className="min-h-screen bg-[#0B0B0C] text-white flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-xl font-bold text-red-400">가게 정보를 찾을 수 없습니다.</h2>
        <p className="text-xs text-zinc-500 mt-2">존재하지 않거나 삭제된 가게 ID입니다.</p>
        <Link href="/" className="mt-6 rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-2.5 text-xs text-purple-400 font-bold">
          &larr; 홈으로 돌아가기
        </Link>
      </main>
    );
  }

  // Group seats by statuses for clear UI layout and prioritize seats with active deals first
  const availableSeats = seats
    .filter(s => s.status === 'available')
    .sort((a, b) => {
      const aHasDeal = !!a.activeDealId;
      const bHasDeal = !!b.activeDealId;
      if (aHasDeal && !bHasDeal) return -1;
      if (!aHasDeal && bHasDeal) return 1;
      return 0;
    });
  const otherSeats = seats.filter(s => s.status !== 'available');

  const placeholder = getCategoryPlaceholder(venue.category);

  return (
    <main className="min-h-screen bg-[#0B0B0C] text-white pb-36 max-w-md mx-auto relative shadow-2xl border-x border-zinc-900">
      
      {/* 1. Glassmorphic Sticky Header Banner */}
      <div className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-zinc-950/70 border-b border-zinc-900 backdrop-blur-md">
        <Link href="/" className="p-2 rounded-xl bg-zinc-900/50 border border-zinc-800 text-zinc-400 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <span className="text-xs font-bold text-zinc-400 tracking-wider">가게 상세 정보</span>
        <div className="w-8"></div> {/* Spacer for symmetry */}
      </div>

      {/* 2. Banner Image Hero */}
      <div className="relative h-60 w-full overflow-hidden bg-zinc-950">
        {!venue.imageUrl || imgError ? (
          <div className={`w-full h-full bg-gradient-to-tr ${placeholder.gradient} flex flex-col items-center justify-center p-6 relative`}>
            {/* Noise Pattern */}
            <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px]"></div>
            
            <div className="w-18 h-18 rounded-full bg-zinc-900/80 border border-zinc-800/80 flex items-center justify-center shadow-lg backdrop-blur-md animate-pulse">
              <span className="text-4xl filter drop-shadow-[0_0_10px_rgba(255,255,255,0.4)]">{placeholder.emoji}</span>
            </div>
            <span className="text-xs font-bold text-zinc-400 tracking-widest uppercase mt-3.5">
              {placeholder.label}
            </span>
          </div>
        ) : (
          <img 
            src={venue.imageUrl} 
            alt={venue.name} 
            className="w-full h-full object-cover animate-fadeIn"
            onError={() => setImgError(true)}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B0B0C] via-[#0B0B0C]/40 to-transparent"></div>
        
        {/* Category Tag */}
        <div className="absolute bottom-4 left-6 flex items-center gap-2">
          <span className="rounded-md bg-purple-950/80 px-2.5 py-1 text-xs font-bold text-purple-400 border border-purple-500/20 backdrop-blur-sm">
            {venue.category}
          </span>
          <div className="flex items-center gap-1 text-amber-400 font-bold text-xs bg-black/50 px-2.5 py-1 rounded-md backdrop-blur-sm">
            <Star className="w-3.5 h-3.5 fill-amber-400" />
            {venue.rating.toFixed(1)}
          </div>
        </div>
      </div>

      {/* 3. Venue Details Context */}
      <section className="px-6 space-y-3 mt-2">
        <h2 className="text-2xl font-black tracking-tight text-white">{venue.name}</h2>
        
        <p className="text-xs text-zinc-400 leading-relaxed bg-zinc-900/40 p-3 rounded-xl border border-zinc-800/60 font-medium">
          {venue.description}
        </p>

        {/* Address and Info Grid */}
        <div className="space-y-2 text-xs text-zinc-500 pt-1 flex justify-between items-end">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-zinc-600 flex-shrink-0" />
              <span className="truncate">{venue.address}</span>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-zinc-600" />
              <span>051-808-XXXX (실시간 문의)</span>
            </div>
          </div>
          
          <button
            onClick={() => setIsReportModalOpen(true)}
            className="flex items-center gap-1 text-[10px] text-zinc-650 hover:text-red-400 font-bold transition-all px-2.5 py-1.5 rounded-lg bg-zinc-950/40 border border-zinc-900 hover:border-red-950/40 hover:bg-red-950/10 active:scale-95"
          >
            <AlertTriangle className="w-3 h-3 text-red-500/40 hover:text-red-500" />
            <span>신고하기</span>
          </button>
        </div>
      </section>

      {/* 4. Live Available Seats Section */}
      <section className="mt-8 px-6 space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
          <h3 className="text-sm font-bold text-white tracking-wider uppercase flex items-center gap-1.5">
            <Flame className="w-4 h-4 text-emerald-400 animate-pulse" />
            예약 가능한 실시간 빈자리 ({availableSeats.length})
          </h3>
          <span className="text-[10px] text-zinc-500">실시간 연동 중</span>
        </div>

        {availableSeats.length > 0 ? (
          <div className="grid grid-cols-1 gap-4">
            {availableSeats.map((seat) => (
              <SeatCard 
                key={seat.id} 
                seat={seat} 
                onReserve={handleReserveSeat}
                isReserving={reserveLoadingId === seat.id}
                dealBenefitValue={getDealBenefitForSeat(seat.id)}
              />
            ))}
          </div>
        ) : (
          <div className="p-6 rounded-2xl bg-zinc-900/20 border border-dashed border-zinc-800 text-center space-y-2">
            <Info className="w-6 h-6 text-zinc-700 mx-auto" />
            <h4 className="text-xs font-bold text-zinc-500">현재 이용 가능한 빈자리가 없습니다.</h4>
            <p className="text-[10px] text-zinc-600">이용 중인 손님이 퇴장 시, 실시간으로 빈자리가 노출됩니다.</p>
          </div>
        )}
      </section>

      {/* 5. Closed or Occupied Seats Layout */}
      {otherSeats.length > 0 && (
        <section className="mt-8 px-6 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
            <h3 className="text-sm font-bold text-zinc-500 tracking-wider uppercase">
              전체 좌석 현황 ({otherSeats.length})
            </h3>
            <span className="text-[10px] text-zinc-500">현장 정보</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {otherSeats.map((seat) => (
              <SeatCard 
                key={seat.id} 
                seat={seat}
                dealBenefitValue={getDealBenefitForSeat(seat.id)}
              />
            ))}
          </div>
        </section>
      )}

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
                좌석이 성공적으로 잠겼습니다. <br />
                실시간 연동을 증명하기 위해 다른 브라우저 창이나 기기에서도 해당 좌석이 <b>[결제 진행 중]</b> 상태로 노출됩니다!
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

      {/* 신고 모달창 (Report Modal) */}
      {isReportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/85 backdrop-blur-md animate-fadeIn animate-duration-150">
          <div className="w-full max-w-xs p-6 rounded-2xl bg-[#121214] border border-red-500/20 text-left space-y-4 shadow-[0_0_40px_rgba(239,68,68,0.15)]">
            <div className="flex items-center gap-2 text-red-400 font-extrabold text-sm border-b border-zinc-900 pb-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <span>허위 정보 및 어뷰징 신고</span>
            </div>
            
            <form onSubmit={handleCreateReport} className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider pl-0.5">
                  신고 사유
                </label>
                <select
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-red-500/50 transition-colors cursor-pointer"
                >
                  <option value="허위 정보">허위 정보 (주소/메뉴/사진)</option>
                  <option value="영업하지 않음">영업하지 않음 (폐업/휴업)</option>
                  <option value="불친절/서비스 불량">불친절/서비스 불량</option>
                  <option value="좌석 정보 오기">좌석 정보가 실제와 다름</option>
                  <option value="기타 어뷰징">기타 어뷰징 및 욕설</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider pl-0.5">
                  상세 설명
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="신고 내용을 상세하게 서술해주세요..."
                  value={reportDesc}
                  onChange={(e) => setReportDesc(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-xs text-white placeholder-zinc-700 focus:outline-none focus:border-red-500/50 transition-colors resize-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsReportModalOpen(false)}
                  className="flex-1 rounded-xl bg-zinc-900 border border-zinc-800 py-2.5 text-xs font-bold text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-all active:scale-95"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isReporting}
                  className="flex-1 rounded-xl bg-gradient-to-r from-red-650 to-orange-550 py-2.5 text-xs font-bold text-white hover:brightness-110 shadow-[0_0_12px_rgba(239,68,68,0.2)] flex items-center justify-center gap-1 transition-all active:scale-95 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isReporting ? '제출중...' : '제출'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <BottomNavigation availableCount={globalAvailableSeats.length} />
    </main>
  );
}
