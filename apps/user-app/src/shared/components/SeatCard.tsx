import React from 'react';
import { Seat, SeatStatus } from '../types';
import { LiveSeatStatus } from './LiveSeatStatus';
import { Users, Clock, Flame } from 'lucide-react';

interface SeatCardProps {
  seat: Seat;
  venueName?: string;
  onReserve?: (seat: Seat) => void;
  isReserving?: boolean;
}

export const SeatCard: React.FC<SeatCardProps> = ({
  seat,
  venueName,
  onReserve,
  isReserving = false
}) => {
  const { label, capacity, status, availableUntil } = seat;

  // Format time remaining from ISO string availableUntil
  const formatAvailableTime = (isoString: string) => {
    if (!isoString) return '미지정';
    try {
      const now = new Date();
      const target = new Date(isoString);
      const diffMs = target.getTime() - now.getTime();
      
      if (diffMs <= 0) return '마감 직전';
      
      const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      
      if (diffHrs > 0) {
        return `${diffHrs}시간 ${diffMins}분 남음`;
      }
      return `${diffMins}분 남음`;
    } catch {
      return '시간 제한 없음';
    }
  };

  const getBorderColor = (status: SeatStatus) => {
    switch (status) {
      case 'available':
        return 'border-emerald-500/30 hover:border-emerald-500/60 shadow-[0_0_15px_rgba(16,185,129,0.03)] hover:shadow-[0_0_20px_rgba(16,185,129,0.1)]';
      case 'locked':
        return 'border-amber-500/20 opacity-80';
      case 'reserved':
        return 'border-indigo-500/10 opacity-70';
      case 'occupied':
        return 'border-zinc-800 opacity-60';
      case 'closed':
      default:
        return 'border-red-950/20 opacity-40';
    }
  };

  return (
    <div className={`p-4 rounded-2xl bg-zinc-900/40 border backdrop-blur-md transition-all duration-300 ${getBorderColor(status)}`}>
      <div className="flex justify-between items-start">
        <div className="space-y-1">
          {/* Optional Venue Name Header */}
          {venueName && (
            <span className="text-xs font-semibold text-purple-400 tracking-wide block uppercase">
              {venueName}
            </span>
          )}
          
          {/* Seat Label */}
          <h4 className="text-base font-bold text-white tracking-tight flex items-center flex-wrap gap-1.5">
            {label}
            {status === 'available' && (
              <span className="inline-flex items-center gap-0.5 rounded bg-emerald-950/50 px-1 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/20">
                <Flame className="w-2.5 h-2.5" />
                추천
              </span>
            )}
            {status === 'available' && seat.tag && (
              <span className="inline-flex items-center gap-0.5 rounded bg-purple-950/60 border border-purple-500/30 px-1.5 py-0.5 text-[9px] font-black text-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.15)] animate-pulse">
                ✨ {seat.tag}
              </span>
            )}
          </h4>
        </div>

        {/* Real-time Status Badge */}
        <LiveSeatStatus status={status} size="sm" />
      </div>

      {/* Info Grid */}
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs border-t border-zinc-800/50 pt-3">
        {/* Capacity */}
        <div className="flex items-center gap-1.5 text-zinc-400">
          <Users className="w-4 h-4 text-zinc-500" />
          <span>수용 {capacity}인</span>
        </div>

        {/* Remaining Time */}
        <div className="flex items-center gap-1.5 text-zinc-400">
          <Clock className="w-4 h-4 text-zinc-500" />
          <span className="truncate">{formatAvailableTime(availableUntil)}</span>
        </div>
      </div>

      {/* Dynamic CTA Button */}
      {status === 'available' && onReserve && (
        <button
          onClick={() => onReserve(seat)}
          disabled={isReserving}
          className="mt-4 w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2.5 text-xs font-bold text-black hover:brightness-110 hover:shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all duration-300 active:scale-[0.98] disabled:opacity-50"
        >
          {isReserving ? '예약 대기 중...' : '지금 바로 예약하기'}
        </button>
      )}

      {status === 'locked' && (
        <button
          disabled
          className="mt-4 w-full rounded-xl bg-zinc-800 px-4 py-2.5 text-xs font-semibold text-zinc-500 cursor-not-allowed border border-zinc-700/30"
        >
          다른 사용자가 검토 중
        </button>
      )}

      {status === 'reserved' && (
        <button
          disabled
          className="mt-4 w-full rounded-xl bg-indigo-950/20 px-4 py-2.5 text-xs font-semibold text-indigo-500/50 cursor-not-allowed border border-indigo-500/10"
        >
          예약 마감된 좌석
        </button>
      )}

      {status === 'occupied' && (
        <button
          disabled
          className="mt-4 w-full rounded-xl bg-zinc-950/60 px-4 py-2.5 text-xs font-medium text-zinc-600 cursor-not-allowed border border-zinc-800"
        >
          이용 중
        </button>
      )}

      {status === 'closed' && (
        <button
          disabled
          className="mt-4 w-full rounded-xl bg-red-950/10 px-4 py-2.5 text-xs font-medium text-red-900 cursor-not-allowed border border-red-950/20"
        >
          이용 불가
        </button>
      )}
    </div>
  );
};

export default SeatCard;
