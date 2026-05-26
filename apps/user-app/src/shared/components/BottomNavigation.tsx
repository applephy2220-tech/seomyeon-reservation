'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Flame, Ticket, User } from 'lucide-react';

interface BottomNavigationProps {
  availableCount?: number;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({ 
  availableCount = 0 
}) => {
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState<'home' | 'deals' | 'reservations' | 'profile'>('home');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const updateActiveTab = () => {
      const searchParams = new URLSearchParams(window.location.search);
      const tabParam = searchParams.get('tab');
      const hash = window.location.hash;

      if (pathname === '/') {
        if (hash === '#deals-section' || hash === '#deals') {
          setActiveTab('deals');
        } else {
          setActiveTab('home');
        }
      } else if (pathname === '/profile') {
        if (tabParam === 'info') {
          setActiveTab('profile');
        } else {
          setActiveTab('reservations');
        }
      }
    };

    updateActiveTab();
    
    // Listen to hash changes and client state popstates
    window.addEventListener('hashchange', updateActiveTab);
    window.addEventListener('popstate', updateActiveTab);
    
    return () => {
      window.removeEventListener('hashchange', updateActiveTab);
      window.removeEventListener('popstate', updateActiveTab);
    };
  }, [pathname]);

  const navItems = [
    {
      key: 'home',
      label: '홈',
      href: '/',
      icon: Home,
      isActive: activeTab === 'home'
    },
    {
      key: 'deals',
      label: '긴급딜',
      href: '/#deals-section',
      icon: Flame,
      isActive: activeTab === 'deals'
    },
    {
      key: 'reservations',
      label: '예약내역',
      href: '/profile?tab=active',
      icon: Ticket,
      isActive: activeTab === 'reservations',
      badge: availableCount > 0 ? availableCount : undefined
    },
    {
      key: 'profile',
      label: '프로필',
      href: '/profile?tab=info',
      icon: User,
      isActive: activeTab === 'profile'
    }
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-zinc-950/80 border-t border-zinc-900 backdrop-blur-xl px-6 pt-2.5 pb-[calc(1.2rem+env(safe-area-inset-bottom))] max-w-md mx-auto shadow-[0_-10px_25px_rgba(0,0,0,0.5)]">
      <nav className="flex justify-around items-center">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link 
              key={item.key} 
              href={item.href}
              className="relative flex flex-col items-center justify-center py-1.5 px-3 group text-center"
            >
              {/* Active neon highlight bubble on icon */}
              <div className={`p-1 rounded-xl transition-all duration-300 ${
                item.isActive 
                  ? 'text-cyan-400 bg-cyan-950/30 shadow-[0_0_12px_rgba(6,182,212,0.15)]' 
                  : 'text-zinc-500 group-hover:text-zinc-300'
              }`}>
                <Icon className={`w-5 h-5 transition-transform duration-300 active:scale-75 ${
                  item.key === 'deals' && item.isActive ? 'text-orange-500' : ''
                }`} />
              </div>

              {/* Dynamic Badge */}
              {item.badge !== undefined && (
                <span className="absolute top-1.5 right-2 flex h-4 w-4 items-center justify-center rounded-full bg-cyan-500 text-[9px] font-bold text-black shadow-[0_0_8px_rgba(6,182,212,0.6)] animate-bounce">
                  {item.badge}
                </span>
              )}

              {/* Label */}
              <span className={`text-[10px] mt-1 font-semibold tracking-tight transition-colors duration-300 ${
                item.isActive 
                  ? (item.key === 'deals' ? 'text-orange-400' : 'text-cyan-400') 
                  : 'text-zinc-500 group-hover:text-zinc-300'
              }`}>
                {item.label}
              </span>

              {/* Glowing Underline Indicator */}
              {item.isActive && (
                <span className={`absolute bottom-0 w-8 h-0.5 rounded-full shadow-[0_0_8px_currentColor] ${
                  item.key === 'deals' ? 'bg-orange-400 text-orange-400' : 'bg-cyan-400 text-cyan-400'
                }`}></span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
};

export default BottomNavigation;
