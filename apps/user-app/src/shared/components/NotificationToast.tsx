'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@shared/firebase/clientApp';
import { collection, query, where, onSnapshot, doc, updateDoc, limit, orderBy } from 'firebase/firestore';
import { getAndSaveFcmToken } from '@shared/firebase/notification';
import { X, Sparkles, Calendar, CheckCircle2, AlertTriangle } from 'lucide-react';

interface ToastItem {
  id: string;
  title: string;
  body: string;
  clickAction: string;
  createdAt: unknown;
}

interface NotificationToastProps {
  userId: string;
  role: 'user' | 'owner';
}

export const NotificationToast: React.FC<NotificationToastProps> = ({ userId, role }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const router = useRouter();

  // 1. Initialize FCM Permission & Obtain Token on Mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Non-blocking token generation to allow native FCM background pushes
    const initPush = async () => {
      try {
        await getAndSaveFcmToken(userId, role);
      } catch (err) {
        console.warn('[Notification SW] FCM registration bypassed:', err);
      }
    };
    
    // Wait 3 seconds after boot to not block main thread paint
    const timer = setTimeout(initPush, 3000);
    return () => clearTimeout(timer);
  }, [userId, role]);

  // 2. Subscribe to real-time 'inapp_notifications' for instant foreground neon toasts
  useEffect(() => {
    if (!userId) return;

    const inappCol = collection(db, 'inapp_notifications');
    
    // Listen to recent unread notifications for this target user
    const q = query(
      inappCol,
      where('userId', '==', userId),
      where('read', '==', false),
      orderBy('createdAt', 'desc'),
      limit(5)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const activeToasts: ToastItem[] = [];
      
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        activeToasts.push({
          id: docSnap.id,
          title: data.title,
          body: data.body,
          clickAction: data.clickAction || '/',
          createdAt: data.createdAt
        });
      });

      // Filter out duplicate or stale notifications locally if needed
      setToasts(prev => {
        // Find newly arrived notifications that are not in the previous state to trigger sound/effects
        const newArrivals = activeToasts.filter(a => !prev.some(p => p.id === a.id));
        if (newArrivals.length > 0) {
          playNotificationSound();
        }
        return activeToasts;
      });
    }, (err) => {
      // Bypassed query index warnings quietly
      console.warn('[NotificationToast] Subscription indexed query wait:', err);
    });

    return () => unsubscribe();
  }, [userId]);

  const playNotificationSound = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      
      const audioCtx = new AudioContextClass();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
      osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.15);
      
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    } catch {
      // Safe fallback if browser security blocks audio context triggers
    }
  };

  const handleToastClick = async (toast: ToastItem) => {
    try {
      // Mark as read in Firestore
      const docRef = doc(db, 'inapp_notifications', toast.id);
      await updateDoc(docRef, { read: true });
      
      // Close the toast
      setToasts(prev => prev.filter(t => t.id !== toast.id));
      
      // Navigate to action URL
      router.push(toast.clickAction);
    } catch (err) {
      console.error('Toast redirect failed:', err);
    }
  };

  const handleCloseClick = async (e: React.MouseEvent, toastId: string) => {
    e.stopPropagation();
    try {
      const docRef = doc(db, 'inapp_notifications', toastId);
      await updateDoc(docRef, { read: true });
      setToasts(prev => prev.filter(t => t.id !== toastId));
    } catch (err) {
      console.error('Toast close failed:', err);
    }
  };

  const getToastIconAndColor = (title: string) => {
    if (title.includes('긴급딜')) {
      return {
        icon: <Sparkles className="w-4 h-4 text-orange-400" />,
        borderColor: 'border-orange-500/40 shadow-[0_0_15px_rgba(249,115,22,0.15)]',
        badgeColor: 'text-orange-400 bg-orange-950/30 border border-orange-500/30'
      };
    }
    if (title.includes('예약') || title.includes('입장')) {
      return {
        icon: <Calendar className="w-4 h-4 text-purple-400" />,
        borderColor: 'border-purple-500/40 shadow-[0_0_15px_rgba(168,85,247,0.15)]',
        badgeColor: 'text-purple-400 bg-purple-950/30 border border-purple-500/30'
      };
    }
    if (title.includes('이용 종료') || title.includes('완료')) {
      return {
        icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
        borderColor: 'border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.15)]',
        badgeColor: 'text-emerald-400 bg-emerald-950/30 border border-emerald-500/30'
      };
    }
    return {
      icon: <AlertTriangle className="w-4 h-4 text-red-400" />,
      borderColor: 'border-red-500/40 shadow-[0_0_15px_rgba(239,68,68,0.15)]',
      badgeColor: 'text-red-400 bg-red-950/30 border border-red-500/30'
    };
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-6 right-6 z-[9999] w-full max-w-sm flex flex-col gap-3 pointer-events-none">
      {toasts.map((toast) => {
        const theme = getToastIconAndColor(toast.title);
        return (
          <div
            key={toast.id}
            onClick={() => handleToastClick(toast)}
            className={`w-full p-4.5 rounded-2xl bg-zinc-950/90 border backdrop-blur-md text-white flex gap-3.5 relative cursor-pointer pointer-events-auto transform transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] animate-slideIn ${theme.borderColor}`}
          >
            {/* Blinking Neon Node Dot */}
            <span className="absolute left-1.5 top-1.5 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
            </span>

            {/* Visual Icon Badge */}
            <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
              {theme.icon}
            </div>

            {/* Message Body */}
            <div className="space-y-1 pr-6 flex-1">
              <div className="flex items-center gap-2">
                <h5 className="text-xs font-black tracking-tight text-white">{toast.title}</h5>
                <span className={`text-[8px] font-black uppercase px-1.5 rounded tracking-widest ${theme.badgeColor}`}>
                  LIVE
                </span>
              </div>
              <p className="text-[10px] leading-relaxed text-zinc-400 font-medium">{toast.body}</p>
            </div>

            {/* Close Button */}
            <button
              onClick={(e) => handleCloseClick(e, toast.id)}
              className="absolute right-4.5 top-4.5 p-1 rounded bg-zinc-900/60 border border-zinc-850 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
