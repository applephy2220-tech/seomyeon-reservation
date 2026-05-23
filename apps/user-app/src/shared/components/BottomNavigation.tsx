'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Beer, User } from 'lucide-react';

interface BottomNavigationProps {
  availableCount?: number;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({ 
  availableCount = 0 
}) => {
  const pathname = usePathname();

  const navItems = [
    {
      label: '홈',
      href: '/',
      icon: Home,
      isActive: pathname === '/'
    },
    {
      label: '실시간 빈자리',
      href: '/#seats-section',
      icon: Beer,
      isActive: pathname.includes('/venue') || pathname === '/#seats-section',
      badge: availableCount > 0 ? availableCount : undefined
    },
    {
      label: '내 예약',
      href: '/profile',
      isActive: pathname === '/profile',
      icon: User
    }
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-zinc-950/80 border-t border-zinc-900 backdrop-blur-xl px-6 py-2 pb-6 max-w-md mx-auto shadow-[0_-10px_25px_rgba(0,0,0,0.5)]">
      <nav className="flex justify-around items-center">
        {navItems.map((item, idx) => {
          const Icon = item.icon;
          return (
            <Link 
              key={idx} 
              href={item.href}
              className="relative flex flex-col items-center justify-center py-1.5 px-3 group text-center"
            >
              {/* Active neon highlight bubble on icon */}
              <div className={`p-1 rounded-xl transition-all duration-300 ${
                item.isActive 
                  ? 'text-cyan-400 bg-cyan-950/30' 
                  : 'text-zinc-500 group-hover:text-zinc-300'
              }`}>
                <Icon className="w-5 h-5 transition-transform duration-300 active:scale-75" />
              </div>

              {/* Dynamic Badge */}
              {item.badge !== undefined && (
                <span className="absolute top-1.5 right-2 flex h-4 w-4 items-center justify-center rounded-full bg-cyan-500 text-[9px] font-bold text-black shadow-[0_0_8px_rgba(6,182,212,0.6)] animate-bounce">
                  {item.badge}
                </span>
              )}

              {/* Label */}
              <span className={`text-[10px] mt-1 font-semibold tracking-tight transition-colors duration-300 ${
                item.isActive ? 'text-cyan-400' : 'text-zinc-500 group-hover:text-zinc-300'
              }`}>
                {item.label}
              </span>

              {/* Glowing Underline Indicator */}
              {item.isActive && (
                <span className="absolute bottom-0 w-8 h-0.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#06b6d4]"></span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
};

export default BottomNavigation;
