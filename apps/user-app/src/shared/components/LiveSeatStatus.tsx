import React from 'react';
import { SeatStatus } from '../types';

interface LiveSeatStatusProps {
  status: SeatStatus;
  size?: 'sm' | 'md';
}

export const LiveSeatStatus: React.FC<LiveSeatStatusProps> = ({ 
  status, 
  size = 'md' 
}) => {
  const getStatusDetails = (status: SeatStatus) => {
    switch (status) {
      case 'available':
        return {
          label: '실시간 빈자리',
          bgClass: 'bg-emerald-950/60 text-emerald-400 border-emerald-500/30',
          dotClass: 'bg-emerald-400 shadow-[0_0_8px_#10b981]',
          pulse: true,
        };
      case 'locked':
        return {
          label: '결제 진행 중',
          bgClass: 'bg-amber-950/60 text-amber-400 border-amber-500/30',
          dotClass: 'bg-amber-400 shadow-[0_0_8px_#f59e0b]',
          pulse: true,
        };
      case 'reserved':
        return {
          label: '예약 완료',
          bgClass: 'bg-indigo-950/40 text-indigo-400 border-indigo-500/20',
          dotClass: 'bg-indigo-400',
          pulse: false,
        };
      case 'occupied':
        return {
          label: '이용 중',
          bgClass: 'bg-zinc-800/60 text-zinc-400 border-zinc-700/20',
          dotClass: 'bg-zinc-500',
          pulse: false,
        };
      case 'closed':
      default:
        return {
          label: '마감',
          bgClass: 'bg-red-950/20 text-red-500/70 border-red-950/40',
          dotClass: 'bg-red-900',
          pulse: false,
        };
    }
  };

  const { label, bgClass, dotClass, pulse } = getStatusDetails(status);
  
  const textSz = size === 'sm' ? 'text-xs' : 'text-sm font-medium';
  const dotSz = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2';
  const padding = size === 'sm' ? 'px-2 py-0.5' : 'px-3 py-1';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border ${padding} ${textSz} ${bgClass} transition-all duration-300`}>
      <span className="relative flex">
        {pulse && (
          <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${dotClass}`}></span>
        )}
        <span className={`relative inline-flex rounded-full ${dotSz} ${dotClass}`}></span>
      </span>
      {label}
    </span>
  );
};

export default LiveSeatStatus;
