'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Venue } from '../types';
import { MapPin, Star, Flame } from 'lucide-react';

interface VenueCardProps {
  venue: Venue;
  availableSeatsCount: number;
}

const getCategoryPlaceholder = (category: string) => {
  const c = category || '';
  if (c.includes('맥주') || c.includes('수제맥주') || c.includes('펍')) {
    return {
      gradient: 'from-amber-600/30 via-orange-600/10 to-zinc-950',
      emoji: '🍺',
      label: '수제맥주 & 크래프트 펍'
    };
  }
  if (c.includes('포차') || c.includes('포장마차') || c.includes('감성포차')) {
    return {
      gradient: 'from-rose-600/30 via-pink-600/10 to-zinc-950',
      emoji: '⛺',
      label: '감성 실내포차'
    };
  }
  if (c.includes('이자카야') || c.includes('야키토리') || c.includes('오뎅') || c.includes('밀락오뎅')) {
    return {
      gradient: 'from-red-700/30 via-amber-900/10 to-zinc-950',
      emoji: '🏮',
      label: '정통 이자카야'
    };
  }
  if (c.includes('바') || c.includes('라운지') || c.includes('요리주점') || c.includes('주점')) {
    return {
      gradient: 'from-purple-600/30 via-blue-600/10 to-zinc-950',
      emoji: '🍸',
      label: '네온 다이닝 라운지'
    };
  }
  return {
    gradient: 'from-cyan-600/30 via-purple-600/10 to-zinc-950',
    emoji: '🥂',
    label: '실시간 서면 핫플레이스'
  };
};

export const VenueCard: React.FC<VenueCardProps> = ({ 
  venue, 
  availableSeatsCount 
}) => {
  const { id, name, category, imageUrl, rating, address } = venue;
  const isHot = availableSeatsCount > 0;
  const [imgError, setImgError] = useState(false);
  const placeholder = getCategoryPlaceholder(category);

  return (
    <Link href={`/venue/${id}`} className="block group">
      <div className="relative overflow-hidden rounded-2xl bg-zinc-900/60 border border-zinc-800 backdrop-blur-md transition-all duration-300 hover:border-purple-500/50 hover:shadow-[0_0_20px_rgba(168,85,247,0.15)] active:scale-[0.98]">
        {/* Venue Thumbnail Image with overlay */}
        <div className="relative h-44 w-full overflow-hidden bg-zinc-950">
          {!imageUrl || imgError ? (
            <div className={`w-full h-full bg-gradient-to-tr ${placeholder.gradient} flex flex-col items-center justify-center p-4 relative`}>
              {/* Noise Pattern */}
              <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:16px_16px]"></div>
              
              <div className="w-14 h-14 rounded-full bg-zinc-900/80 border border-zinc-800/80 flex items-center justify-center shadow-lg backdrop-blur-md animate-pulse">
                <span className="text-3xl filter drop-shadow-[0_0_8px_rgba(255,255,255,0.3)]">{placeholder.emoji}</span>
              </div>
              <span className="text-[10px] font-bold text-zinc-500 tracking-wider uppercase mt-2.5">
                {placeholder.label}
              </span>
            </div>
          ) : (
            <img 
              src={imageUrl} 
              alt={name} 
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              onError={() => setImgError(true)}
              loading="lazy"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent"></div>
          
          {/* Category Tag (Top Left) */}
          <span className="absolute left-3 top-3 rounded-md bg-black/60 px-2.5 py-1 text-xs font-semibold text-purple-400 border border-purple-500/20 backdrop-blur-sm">
            {category}
          </span>

          {/* Available Seats Badge (Top Right) */}
          <div className="absolute right-3 top-3 flex items-center gap-1">
            {isHot ? (
              <span className="flex items-center gap-1 rounded-md bg-emerald-950/80 px-2.5 py-1 text-xs font-bold text-emerald-400 border border-emerald-500/30 backdrop-blur-sm animate-pulse">
                <Flame className="w-3.5 h-3.5 fill-emerald-400" />
                빈자리 {availableSeatsCount}개
              </span>
            ) : (
              <span className="rounded-md bg-zinc-950/80 px-2.5 py-1 text-xs font-semibold text-zinc-400 border border-zinc-700/20 backdrop-blur-sm">
                만석
              </span>
            )}
          </div>
        </div>

        {/* Card Metadata */}
        <div className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white tracking-tight group-hover:text-purple-300 transition-colors truncate max-w-[70%]">
              {name}
            </h3>
            
            {/* Rating */}
            <div className="flex items-center gap-1 text-amber-400">
              <Star className="w-3.5 h-3.5 fill-amber-400" />
              <span className="text-xs font-bold">{rating.toFixed(1)}</span>
            </div>
          </div>

          {/* Address */}
          <div className="flex items-center gap-1 text-xs text-zinc-500">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{address}</span>
          </div>

          {/* Footer Call to Action */}
          <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-xs text-zinc-400">
            <span>실시간 정보 100% 매칭</span>
            <span className="text-purple-400 group-hover:translate-x-0.5 transition-transform">
              좌석 예약하기 &rarr;
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
};

export default VenueCard;
