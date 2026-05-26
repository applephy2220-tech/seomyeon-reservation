'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@shared/hooks/useAuth';
import { db } from '@shared/firebase/clientApp';
import { 
  collection, 
  onSnapshot, 
  doc, 
  updateDoc, 
  setDoc, 
  writeBatch 
} from 'firebase/firestore';
import { 
  ShieldAlert, 
  Users, 
  Store, 
  Calendar, 
  AlertOctagon, 
  DollarSign, 
  TrendingUp, 
  CheckCircle, 
  XCircle, 
  Activity, 
  FileText, 
  RefreshCw, 
  Zap, 
  LogOut,
  ChevronRight,
  Eye,
  EyeOff,
  Flame,
  AlertTriangle,
  Lock,
  Sparkles
} from 'lucide-react';
import { getGlobalPlatformAnalytics } from '@shared/services/recommendation';

// TypeScript definitions matching extended role system
interface AdminUserProfile {
  uid: string;
  email: string;
  displayName: string;
  phoneNumber: string;
  createdAt: unknown;
  role?: 'user' | 'owner' | 'admin';
  status?: 'active' | 'pending' | 'approved' | 'rejected' | 'banned';
}

interface AdminVenue {
  id: string;
  name: string;
  category: string;
  description: string;
  imageUrl: string;
  address: string;
  rating: number;
  totalSeatsCount: number;
  status?: 'active' | 'inactive';
  hidden?: boolean;
}

interface AdminReservation {
  id: string;
  userId: string;
  venueId: string;
  seatId: string;
  venueName: string;
  seatLabel: string;
  status: 'confirmed' | 'used' | 'visited' | 'completed' | 'canceled' | 'noshow_expired';
  visitTime: string;
  expiresAt: string;
  paymentAmount: number;
  visitCode: string;
  createdAt: unknown;
  dealId?: string | null;
  paymentStatus?: 'paid' | 'refunded' | 'forfeited' | 'completed';
}

interface AdminDeal {
  id: string;
  venueId: string;
  seatId: string;
  title: string;
  description: string;
  benefitValue: string;
  validUntil: string;
  status: 'active' | 'expired' | 'cancelled' | 'sold_out';
  createdAt: unknown;
  totalSlots: number;
  usedSlots: number;
  remainingSlots: number;
  clicks?: number;
}

interface AdminReport {
  id: string;
  reporterId: string;
  reporterName: string;
  targetType: 'venue' | 'deal' | 'user';
  targetId: string;
  targetName: string;
  reason: string;
  description: string;
  status: 'pending' | 'resolved' | 'dismissed';
  createdAt: string;
}

export default function AdminConsolePage() {
  const { user, profile, loading: authLoading, loginOrRegister, logout } = useAuth();
  const router = useRouter();

  // Selected Active Tab
  const [activeTab, setActiveTab] = useState<'dashboard' | 'venues' | 'users' | 'owners' | 'reports' | 'abuse' | 'ai'>('dashboard');

  // Real-time collections state
  const [users, setUsers] = useState<AdminUserProfile[]>([]);
  const [venues, setVenues] = useState<AdminVenue[]>([]);
  const [reservations, setReservations] = useState<AdminReservation[]>([]);
  const [deals, setDeals] = useState<AdminDeal[]>([]);
  const [reports, setReports] = useState<AdminReport[]>([]);
  
  // Loading & Action State
  const [dataLoading, setDataLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [demoLoginLoading, setDemoLoginLoading] = useState(false);
  const [seedingLoading, setSeedingLoading] = useState(false);

  // Action State
  const [selectedUserForLogs, setSelectedUserForLogs] = useState<AdminUserProfile | null>(null);

  const globalAiStats = React.useMemo(() => {
    const mappedRes = reservations.map(r => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = r as any;
      return {
        ...r,
        orders: raw.orders || [],
        orderStatus: raw.orderStatus || undefined,
        eta: raw.eta || undefined,
        cookingDuration: raw.cookingDuration || 15
      };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return getGlobalPlatformAnalytics(mappedRes as any);
  }, [reservations]);

  // 1. Hook into dynamic admin auth check and session cookie pinning
  useEffect(() => {
    if (authLoading) return;

    const isAdminUser = user?.uid === 'demo-admin' || profile?.role === 'admin';
    if (isAdminUser) {
      // Set Next.js middleware protection session cookie
      document.cookie = 'admin_session=true; path=/; max-age=86400;';
    }
  }, [user, profile, authLoading]);

  // 2. Real-time collections sync via Firestore onSnapshot
  useEffect(() => {
    const isAdminUser = user?.uid === 'demo-admin' || profile?.role === 'admin';
    if (!isAdminUser) {
      setDataLoading(false);
      return;
    }

    setDataLoading(true);

    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const uList: AdminUserProfile[] = [];
      snap.forEach((doc) => uList.push(doc.data() as AdminUserProfile));
      setUsers(uList);
    });

    const unsubVenues = onSnapshot(collection(db, 'venues'), (snap) => {
      const vList: AdminVenue[] = [];
      snap.forEach((doc) => vList.push(doc.data() as AdminVenue));
      setVenues(vList);
    });

    const unsubReservations = onSnapshot(collection(db, 'reservations'), (snap) => {
      const rList: AdminReservation[] = [];
      snap.forEach((doc) => rList.push(doc.data() as AdminReservation));
      setReservations(rList);
    });

    const unsubDeals = onSnapshot(collection(db, 'deals'), (snap) => {
      const dList: AdminDeal[] = [];
      snap.forEach((doc) => dList.push(doc.data() as AdminDeal));
      setDeals(dList);
    });

    const unsubReports = onSnapshot(collection(db, 'reports'), (snap) => {
      const repList: AdminReport[] = [];
      snap.forEach((doc) => {
        const data = doc.data();
        repList.push({ id: doc.id, ...data } as AdminReport);
      });
      // Sort reports by latest first
      repList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setReports(repList);
    });

    setDataLoading(false);

    return () => {
      unsubUsers();
      unsubVenues();
      unsubReservations();
      unsubDeals();
      unsubReports();
    };
  }, [user, profile]);

  // Safe Date checks helper
  const isToday = (dateVal: unknown) => {
    if (!dateVal) return false;
    let d: Date;
    // Handle Firestore Timestamp
    if (dateVal && typeof dateVal === 'object' && 'toDate' in dateVal && typeof (dateVal as { toDate: () => Date }).toDate === 'function') {
      d = (dateVal as { toDate: () => Date }).toDate();
    } else {
      d = new Date(dateVal as string | number);
    }
    const today = new Date();
    return d.getDate() === today.getDate() &&
           d.getMonth() === today.getMonth() &&
           d.getFullYear() === today.getFullYear();
  };

  // 3. Stats Aggregation
  const totalUsersCount = users.filter(u => u.role !== 'owner' && u.role !== 'admin').length;
  const totalOwnersCount = users.filter(u => u.role === 'owner').length;
  
  const todayReservations = reservations.filter(r => isToday(r.createdAt));
  const todayReservationsCount = todayReservations.length;
  const todayNoShowsCount = todayReservations.filter(r => r.status === 'noshow_expired').length;
  
  const totalDealsUsedCount = reservations.filter(r => r.dealId && r.status !== 'canceled').length;
  
  const totalPaymentsAmount = reservations
    .filter(r => r.status === 'confirmed' || r.status === 'visited' || r.status === 'completed')
    .reduce((sum, r) => sum + (Number(r.paymentAmount) || 0), 0);

  // 4. One-click Demo Admin Credentials Login Setup
  const handleDemoAdminLogin = async () => {
    setDemoLoginLoading(true);
    try {
      // 1. Sign in or register administrative email
      const loggedUser = await loginOrRegister('admin@seomyeon.now', 'admin1234', '총괄관리자');
      if (loggedUser) {
        // 2. Set role=admin inside Firestore user profiles
        const userDocRef = doc(db, 'users', loggedUser.uid);
        await setDoc(userDocRef, {
          uid: loggedUser.uid,
          email: 'admin@seomyeon.now',
          displayName: '총괄관리자',
          phoneNumber: '010-9999-8888',
          role: 'admin',
          status: 'active',
          createdAt: new Date().toISOString()
        }, { merge: true });

        // 3. Set administrative bypass cookie
        document.cookie = 'admin_session=true; path=/; max-age=86400;';
        alert('어드민 계정으로 성공적으로 회원가입/로그인 완료되었습니다!');
        window.location.reload();
      }
    } catch (err) {
      console.error('Demo admin login error:', err);
      alert('데모 어드민 계정 셋업에 실패했습니다. 로그를 확인하세요.');
    } finally {
      setDemoLoginLoading(false);
    }
  };

  // 5. Seeding Demo Admin Stats & Anomalies (Abuse Cases)
  const handleSeedAdminDemoData = async () => {
    if (confirm('전체 플랫폼 통계, 대기 중인 업주, 모의 어뷰징 딜 및 신고 기록을 시딩하시겠습니까?')) {
      setSeedingLoading(true);
      try {
        const batch = writeBatch(db);

        // A. Seed pending/approved/rejected owners
        const pendingOwnerRef = doc(db, 'users', 'demo-owner-pending');
        batch.set(pendingOwnerRef, {
          uid: 'demo-owner-pending',
          email: 'busan-pub@naver.com',
          displayName: '서면맥주홀 사장님',
          phoneNumber: '010-2222-3333',
          role: 'owner',
          status: 'pending',
          createdAt: new Date().toISOString()
        });

        const rejectedOwnerRef = doc(db, 'users', 'demo-owner-rejected');
        batch.set(rejectedOwnerRef, {
          uid: 'demo-owner-rejected',
          email: 'bad-pub@daum.net',
          displayName: '악덕포차 사장님',
          phoneNumber: '010-4444-5555',
          role: 'owner',
          status: 'rejected',
          createdAt: new Date().toISOString()
        });

        // B. Seed generic active & banned users
        const bannedUserRef = doc(db, 'users', 'demo-user-banned');
        batch.set(bannedUserRef, {
          uid: 'demo-user-banned',
          email: 'spammer@gmail.com',
          displayName: '어뷰저김철수',
          phoneNumber: '010-7777-6666',
          role: 'user',
          status: 'banned',
          createdAt: new Date().toISOString()
        });

        // C. Seed mock reservations for today's statistics
        const resConfirmedRef = doc(db, 'reservations', 'demo-res-1');
        batch.set(resConfirmedRef, {
          id: 'demo-res-1',
          userId: 'demo-user',
          venueId: 'demo-venue-1',
          seatId: 'demo-seat-1',
          venueName: '옥상포차 서면본점',
          seatLabel: '창가 01',
          status: 'confirmed',
          visitTime: '20:00',
          expiresAt: new Date(Date.now() + 600000).toISOString(),
          paymentAmount: 5000,
          visitCode: '7238',
          paymentStatus: 'paid',
          createdAt: new Date().toISOString()
        });

        const resNoShowRef = doc(db, 'reservations', 'demo-res-2');
        batch.set(resNoShowRef, {
          id: 'demo-res-2',
          userId: 'demo-user-banned',
          venueId: 'demo-venue-2',
          seatId: 'demo-seat-2',
          venueName: '야키토리 시선 서면점',
          seatLabel: '홀 02',
          status: 'noshow_expired',
          visitTime: '18:00',
          expiresAt: new Date(Date.now() - 3600000).toISOString(),
          paymentAmount: 5000,
          visitCode: '1092',
          paymentStatus: 'forfeited',
          createdAt: new Date().toISOString()
        });

        // D. Seed anomalous deal (clicks: 250, conversion: 100%) for abuse monitor
        const abuseDealRef = doc(db, 'deals', 'demo-deal-abuse');
        batch.set(abuseDealRef, {
          id: 'demo-deal-abuse',
          venueId: 'demo-venue-1',
          seatId: 'demo-seat-1',
          title: '🔥 [어뷰징 의심] 1분 한정 공짜 안주 딜',
          description: '짧은 시간 동안 비이상적인 속도로 클릭 수와 예약량이 집중된 어뷰징 테스트 딜입니다.',
          benefitValue: '안주 전체 무료 제공',
          validUntil: new Date(Date.now() + 1800000).toISOString(),
          status: 'active',
          totalSlots: 10,
          usedSlots: 10,
          remainingSlots: 0,
          clicks: 342,
          createdAt: new Date().toISOString()
        });

        // E. Seed generic reports inside 'reports' collection
        const reportRef1 = doc(db, 'reports', 'demo-report-1');
        batch.set(reportRef1, {
          id: 'demo-report-1',
          reporterId: 'demo-user',
          reporterName: '서면 나들이객',
          targetType: 'venue',
          targetId: 'demo-venue-1',
          targetName: '옥상포차 서면본점',
          reason: '허위 정보',
          description: '루프탑 사진이 실제 모습과 다르고 야외 영업 테이블이 허가받지 않은 곳에 설치되어 있는 것 같습니다.',
          status: 'pending',
          createdAt: new Date().toISOString()
        });

        await batch.commit();
        alert('테스트 어드민용 대시보드 데이터 시딩이 완전히 완료되었습니다!');
      } catch (err) {
        console.error('Seeding error:', err);
        alert('시딩 중 오류가 발생했습니다.');
      } finally {
        setSeedingLoading(false);
      }
    }
  };

  // 6. Action handlers: Venue status toggles
  const handleUpdateVenueStatus = async (venueId: string, currentStatus?: string) => {
    const nextStatus = currentStatus === 'inactive' ? 'active' : 'inactive';
    setActionLoading(`venue-status-${venueId}`);
    try {
      await updateDoc(doc(db, 'venues', venueId), { status: nextStatus });
    } catch (err) {
      console.error(err);
      alert('매장 활성화 토글 변경에 실패했습니다.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateVenueHidden = async (venueId: string, currentHidden?: boolean) => {
    setActionLoading(`venue-hidden-${venueId}`);
    try {
      await updateDoc(doc(db, 'venues', venueId), { hidden: !currentHidden });
    } catch (err) {
      console.error(err);
      alert('매장 숨김 설정 변경에 실패했습니다.');
    } finally {
      setActionLoading(null);
    }
  };

  // 7. Action handlers: User bans
  const handleUpdateUserStatus = async (userId: string, currentStatus?: string) => {
    const nextStatus = currentStatus === 'banned' ? 'active' : 'banned';
    setActionLoading(`user-${userId}`);
    try {
      await updateDoc(doc(db, 'users', userId), { status: nextStatus });
    } catch (err) {
      console.error(err);
      alert('사용자 차단 상태 업데이트에 실패했습니다.');
    } finally {
      setActionLoading(null);
    }
  };

  // 8. Action handlers: Owner approval decisions
  const handleApproveOwner = async (ownerId: string, decision: 'approved' | 'rejected') => {
    setActionLoading(`owner-${ownerId}`);
    try {
      await updateDoc(doc(db, 'users', ownerId), { status: decision });
    } catch (err) {
      console.error(err);
      alert(`업주 심사 결과(${decision}) 반영에 실패했습니다.`);
    } finally {
      setActionLoading(null);
    }
  };

  // 9. Action handlers: Resolve reports
  const handleResolveReport = async (reportId: string, resolution: 'resolved' | 'dismissed') => {
    setActionLoading(`report-${reportId}`);
    try {
      await updateDoc(doc(db, 'reports', reportId), { status: resolution });
    } catch (err) {
      console.error(err);
      alert('신고 처리에 실패했습니다.');
    } finally {
      setActionLoading(null);
    }
  };

  // 10. Action handlers: Abuse deal emergency close
  const handleForceCloseDeal = async (dealId: string) => {
    if (confirm('어뷰징 의심 캠페인을 강제로 즉시 강제 마감(expired) 처리하시겠습니까?')) {
      setActionLoading(`deal-${dealId}`);
      try {
        await updateDoc(doc(db, 'deals', dealId), { status: 'expired' });
        alert('해당 긴급딜이 강제로 정지 및 만료되었습니다.');
      } catch (err) {
        console.error(err);
        alert('긴급딜 강제 중지에 실패했습니다.');
      } finally {
        setActionLoading(null);
      }
    }
  };

  // Authentication gate logic check
  const isAdmin = user?.uid === 'demo-admin' || profile?.role === 'admin';

  if (authLoading) {
    return (
      <main className="min-h-screen bg-[#0B0B0C] text-white flex flex-col items-center justify-center p-6 text-center">
        <Activity className="w-10 h-10 text-cyan-400 animate-spin" />
        <p className="text-xs text-zinc-500 mt-4 font-bold tracking-widest animate-pulse">
          운영 관리 체계 권한 확인 중...
        </p>
      </main>
    );
  }

  if (!isAdmin) {
    // -------------------------------------------------------------
    // ADMIN ACCESS DENIED OVERLAY & MOCK SETUP PANEL
    // -------------------------------------------------------------
    return (
      <main className="min-h-screen bg-[#070708] text-white flex flex-col justify-center items-center p-6 max-w-md mx-auto border-x border-zinc-900 shadow-2xl relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-red-900/10 via-zinc-950/90 to-black pointer-events-none"></div>
        <div className="absolute top-[-50px] w-64 h-64 bg-red-500/10 blur-[80px] rounded-full pointer-events-none"></div>

        <div className="w-full space-y-8 relative z-10 text-center animate-fadeIn">
          {/* Logo Alert Shield */}
          <div className="w-20 h-20 rounded-3xl bg-red-950/50 border border-red-500/40 shadow-[0_0_30px_rgba(239,68,68,0.25)] flex items-center justify-center mx-auto animate-pulse">
            <ShieldAlert className="w-10 h-10 text-red-400" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-black tracking-tight text-white uppercase">
              Admin Access Denied
            </h1>
            <p className="text-xs text-zinc-500 leading-relaxed max-w-xs mx-auto">
              이 공간은 부산 서면빈자리 플랫폼 총괄 관리자(Admin) 전용 콘솔 영역입니다. 허가되지 않은 일반 손님은 접근할 수 없습니다.
            </p>
          </div>

          {/* Locked Box Accent */}
          <div className="p-5 rounded-2xl bg-zinc-950 border border-zinc-900 text-left space-y-4">
            <div className="flex gap-3">
              <Lock className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-white">테스트 어드민 계정 설명</h4>
                <p className="text-[10px] text-zinc-550 leading-relaxed">
                  아래 버튼을 터치하여 테스트 이메일 <b className="text-amber-400">admin@seomyeon.now</b> 계정을 생성 및 로그인 처리하면, Firestore Rules와 즉시 연동되는 어드민 권한 프로필이 실시간 생성됩니다.
                </p>
              </div>
            </div>

            <button
              onClick={handleDemoAdminLogin}
              disabled={demoLoginLoading}
              className="w-full flex items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-red-550 via-orange-550 to-amber-500 py-3 text-xs font-black text-black shadow-[0_0_15px_rgba(239,68,68,0.3)] transition-all hover:brightness-110 active:scale-95 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4 fill-current text-black animate-spin" />
              <span>{demoLoginLoading ? '어드민 권한 승인 중...' : '클릭 한번으로 어드민 계정 생성 & 로그인'}</span>
            </button>
          </div>

          <button
            onClick={() => router.push('/login')}
            className="text-[11px] font-bold text-zinc-550 hover:text-white transition-colors"
          >
            &larr; 일반 계정 로그인 화면으로
          </button>
        </div>
      </main>
    );
  }

  // -------------------------------------------------------------
  // ADMIN DASHBOARD CONSOLE (MAIN VIEW)
  // -------------------------------------------------------------
  return (
    <main className="min-h-screen bg-[#070708] text-white pb-32 max-w-md mx-auto relative shadow-2xl border-x border-zinc-900 flex flex-col">
      {/* Radiant Glowing Accent Line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-red-500 via-purple-500 to-cyan-400 shadow-[0_0_10px_rgba(168,85,247,0.8)] z-50"></div>

      {/* Dynamic Ambient Neon Lights */}
      <div className="absolute top-[80px] right-[-30px] w-64 h-64 bg-cyan-500/5 blur-[90px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-[200px] left-[-30px] w-64 h-64 bg-purple-500/5 blur-[90px] rounded-full pointer-events-none"></div>

      {/* Top Title Bar */}
      <header className="px-6 pt-7 pb-4 flex justify-between items-center border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md relative z-10">
        <div>
          <span className="inline-flex items-center gap-1.5 text-[9px] font-black tracking-widest text-red-400 bg-red-950/40 px-2 py-0.5 rounded border border-red-500/25">
            <Activity className="w-3 h-3 text-red-500 animate-pulse" />
            OPERATIONS HQ
          </span>
          <h1 className="text-lg font-black tracking-tight text-white mt-1">
            서면나우 통합 관리 콘솔
          </h1>
        </div>

        <button 
          onClick={logout}
          className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-red-400 transition-colors"
          title="로그아웃"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </header>

      {/* Main Tab Switch Grid */}
      <nav className="grid grid-cols-4 gap-1 p-1 bg-zinc-950 border-b border-zinc-900 text-[8.5px] font-black sticky top-0 z-40 backdrop-blur-md">
        <button
          onClick={() => { setActiveTab('dashboard'); }}
          className={`py-2 rounded-lg transition-all ${
            activeTab === 'dashboard'
              ? 'bg-red-950/40 border border-red-500/30 text-red-400'
              : 'bg-zinc-900/40 border border-transparent text-zinc-550 hover:text-zinc-300'
          }`}
        >
          대시보드
        </button>
        <button
          onClick={() => { setActiveTab('venues'); }}
          className={`py-2 rounded-lg transition-all ${
            activeTab === 'venues'
              ? 'bg-purple-950/40 border border-purple-500/30 text-purple-400'
              : 'bg-zinc-900/40 border border-transparent text-zinc-550 hover:text-zinc-300'
          }`}
        >
          매장 관리
        </button>
        <button
          onClick={() => { setActiveTab('users'); setSelectedUserForLogs(null); }}
          className={`py-2 rounded-lg transition-all ${
            activeTab === 'users'
              ? 'bg-cyan-950/40 border border-cyan-500/30 text-cyan-400'
              : 'bg-zinc-900/40 border border-transparent text-zinc-550 hover:text-zinc-300'
          }`}
        >
          사용자
        </button>
        <button
          onClick={() => { setActiveTab('owners'); }}
          className={`py-2 rounded-lg transition-all ${
            activeTab === 'owners'
              ? 'bg-amber-950/40 border border-amber-500/30 text-amber-400'
              : 'bg-zinc-900/40 border border-transparent text-zinc-550 hover:text-zinc-300'
          }`}
        >
          업주 승인
        </button>
        <button
          onClick={() => { setActiveTab('reports'); }}
          className={`py-2 rounded-lg transition-all ${
            activeTab === 'reports'
              ? 'bg-rose-950/40 border border-rose-500/30 text-rose-450'
              : 'bg-zinc-900/40 border border-transparent text-zinc-550 hover:text-zinc-300'
          }`}
        >
          신고 ({reports.filter(r => r.status === 'pending').length})
        </button>
        <button
          onClick={() => { setActiveTab('abuse'); }}
          className={`py-2 rounded-lg transition-all flex items-center justify-center gap-1 ${
            activeTab === 'abuse'
              ? 'bg-orange-950/40 border border-orange-550/30 text-orange-400'
              : 'bg-zinc-900/40 border border-transparent text-zinc-550 hover:text-zinc-300'
          }`}
        >
          딜 모니터
        </button>
        <button
          onClick={() => { setActiveTab('ai'); }}
          className={`py-2 rounded-lg transition-all flex items-center justify-center gap-0.5 ${
            activeTab === 'ai'
              ? 'bg-purple-950/40 border border-purple-500/30 text-purple-400'
              : 'bg-zinc-900/40 border border-transparent text-zinc-550 hover:text-zinc-300'
          }`}
        >
          AI 분석실
        </button>
      </nav>

      {/* Inner Content Area */}
      <section className="flex-1 px-5 pt-5 pb-16 relative z-10 overflow-y-auto">
        {dataLoading ? (
          <div className="py-24 text-center space-y-4">
            <Activity className="w-8 h-8 text-cyan-400 animate-spin mx-auto" />
            <p className="text-xs text-zinc-500">실시간 데이터 셋 싱크 조율 중...</p>
          </div>
        ) : (
          <div className="space-y-6">
            
            {/* -------------------------------------------------------------
                TAB 1: STATS DASHBOARD
                ------------------------------------------------------------- */}
            {activeTab === 'dashboard' && (
              <div className="space-y-6 animate-fadeIn">
                {/* Demo Control Center Banner */}
                <div className="p-4.5 rounded-2xl bg-zinc-950/60 border border-zinc-900 space-y-3">
                  <div className="flex gap-2">
                    <TrendingUp className="w-4.5 h-4.5 text-cyan-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <h3 className="text-xs font-bold text-white">어드민 시나리오 제어 센터</h3>
                      <p className="text-[10px] text-zinc-550 leading-relaxed mt-0.5">
                        비이상적인 전환 속도를 가진 모의 어뷰징 긴급딜과 미결 신고건, 심사 대기 중인 업주 데이터를 즉시 생성하여 콘솔 기능을 간편하게 테스트할 수 있습니다.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleSeedAdminDemoData}
                    disabled={seedingLoading}
                    className="w-full py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-[11px] font-bold text-cyan-400 hover:bg-zinc-800 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${seedingLoading ? 'animate-spin' : ''}`} />
                    <span>{seedingLoading ? '모의 데이터 생성 중...' : '테스트용 데모 데이터 & 어뷰징 시딩'}</span>
                  </button>
                </div>

                {/* Dashboard KPI Card Grid */}
                <div className="grid grid-cols-2 gap-3.5">
                  <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-900/60 flex flex-col justify-between h-24 hover:border-zinc-800 transition-colors">
                    <div className="flex justify-between items-center text-zinc-500">
                      <span className="text-[10px] font-bold uppercase tracking-wider">전체 사용자</span>
                      <Users className="w-4 h-4 text-cyan-500" />
                    </div>
                    <div>
                      <h4 className="text-xl font-black text-white">{totalUsersCount}명</h4>
                      <p className="text-[9px] text-zinc-650">일반 회원 집계</p>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-900/60 flex flex-col justify-between h-24 hover:border-zinc-800 transition-colors">
                    <div className="flex justify-between items-center text-zinc-500">
                      <span className="text-[10px] font-bold uppercase tracking-wider">전체 업주</span>
                      <Store className="w-4 h-4 text-purple-500" />
                    </div>
                    <div>
                      <h4 className="text-xl font-black text-white">{totalOwnersCount}명</h4>
                      <p className="text-[9px] text-zinc-650">파트너십 업주 수</p>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-900/60 flex flex-col justify-between h-24 hover:border-zinc-800 transition-colors">
                    <div className="flex justify-between items-center text-zinc-500">
                      <span className="text-[10px] font-bold uppercase tracking-wider">오늘 예약 수</span>
                      <Calendar className="w-4 h-4 text-emerald-500" />
                    </div>
                    <div>
                      <h4 className="text-xl font-black text-white">{todayReservationsCount}건</h4>
                      <p className="text-[9px] text-zinc-650">금일 전체 예약 요청</p>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-900/60 flex flex-col justify-between h-24 hover:border-zinc-800 transition-colors">
                    <div className="flex justify-between items-center text-zinc-500">
                      <span className="text-[10px] font-bold uppercase tracking-wider">오늘 노쇼 수</span>
                      <AlertOctagon className="w-4 h-4 text-red-500" />
                    </div>
                    <div>
                      <h4 className="text-xl font-black text-red-400">{todayNoShowsCount}건</h4>
                      <p className="text-[9px] text-zinc-650">금일 미방문 만료 건수</p>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-900/60 flex flex-col justify-between h-24 hover:border-zinc-800 transition-colors">
                    <div className="flex justify-between items-center text-zinc-500">
                      <span className="text-[10px] font-bold uppercase tracking-wider">긴급딜 사용</span>
                      <Zap className="w-4 h-4 text-orange-500 animate-pulse" />
                    </div>
                    <div>
                      <h4 className="text-xl font-black text-white">{totalDealsUsedCount}회</h4>
                      <p className="text-[9px] text-zinc-650">딜 예약 전환 전체 횟수</p>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-900/60 flex flex-col justify-between h-24 hover:border-zinc-800 transition-colors">
                    <div className="flex justify-between items-center text-zinc-500">
                      <span className="text-[10px] font-bold uppercase tracking-wider">총 결제금액</span>
                      <DollarSign className="w-4 h-4 text-yellow-500" />
                    </div>
                    <div>
                      <h4 className="text-base font-black text-yellow-450">
                        {totalPaymentsAmount.toLocaleString()}원
                      </h4>
                      <p className="text-[9px] text-zinc-650">예약 보증금 누적 거래액</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* -------------------------------------------------------------
                TAB 2: VENUE CONTROL (매장 관리)
                ------------------------------------------------------------- */}
            {activeTab === 'venues' && (
              <div className="space-y-4 animate-fadeIn">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-purple-400 uppercase tracking-widest">
                    전체 매장 목록 ({venues.length})
                  </h3>
                </div>

                <div className="space-y-3">
                  {venues.map((venue) => {
                    const isInactive = venue.status === 'inactive';
                    const isHidden = venue.hidden === true;
                    
                    return (
                      <div 
                        key={venue.id} 
                        className={`p-4.5 rounded-2xl bg-zinc-950 border transition-all ${
                          isInactive 
                            ? 'border-red-950 opacity-60' 
                            : 'border-zinc-900 hover:border-purple-500/20'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-[9px] font-bold text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded">
                              {venue.category}
                            </span>
                            <h4 className="text-sm font-bold text-white mt-1.5 flex items-center gap-1.5">
                              {venue.name}
                              {isHidden && (
                                <span className="inline-flex items-center rounded bg-zinc-900 text-[8px] font-bold text-zinc-500 px-1 py-0.5 border border-zinc-850">
                                  숨김 처리됨
                                </span>
                              )}
                            </h4>
                            <p className="text-[10px] text-zinc-500 line-clamp-1 mt-1 font-medium">{venue.description}</p>
                          </div>
                        </div>

                        <div className="flex gap-2 mt-4 border-t border-zinc-900/60 pt-3">
                          {/* Active / Inactive Toggle */}
                          <button
                            onClick={() => handleUpdateVenueStatus(venue.id, venue.status)}
                            disabled={actionLoading === `venue-status-${venue.id}`}
                            className={`flex-1 py-2 rounded-xl text-[10px] font-extrabold flex items-center justify-center gap-1 transition-all ${
                              isInactive 
                                ? 'bg-emerald-950/30 border border-emerald-500/20 text-emerald-400' 
                                : 'bg-red-950/30 border border-red-500/20 text-red-400'
                            }`}
                          >
                            {isInactive ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                            <span>{isInactive ? '영업 재개 (활성)' : '영업 중지 (비활성)'}</span>
                          </button>

                          {/* Hide / Show Toggle */}
                          <button
                            onClick={() => handleUpdateVenueHidden(venue.id, venue.hidden)}
                            disabled={actionLoading === `venue-hidden-${venue.id}`}
                            className="px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-[10px] font-extrabold text-zinc-400 hover:text-white transition-all flex items-center justify-center gap-1"
                          >
                            {isHidden ? <Eye className="w-3 h-3 text-zinc-400" /> : <EyeOff className="w-3 h-3 text-zinc-550" />}
                            <span>{isHidden ? '노출' : '숨김'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {venues.length === 0 && (
                    <div className="py-12 text-center text-zinc-650 border border-dashed border-zinc-900 rounded-2xl">
                      <Store className="w-6 h-6 mx-auto mb-2 text-zinc-800" />
                      <p className="text-xs font-bold">등록된 매장이 없습니다.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* -------------------------------------------------------------
                TAB 3: USER LOG (사용자 관리 및 예약 기록)
                ------------------------------------------------------------- */}
            {activeTab === 'users' && (
              <div className="space-y-5 animate-fadeIn">
                <div className="space-y-1.5">
                  <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-widest">
                    전체 사용자 목록 ({users.filter(u => u.role !== 'admin').length})
                  </h3>
                  <p className="text-[10px] text-zinc-550">사용자를 터치하면 상세 실시간 예약 장부 로그를 감시할 수 있습니다.</p>
                </div>

                {/* User List */}
                <div className="space-y-2.5">
                  {users.filter(u => u.role !== 'admin').map((uProfile) => {
                    const isBanned = uProfile.status === 'banned';
                    const isSelected = selectedUserForLogs?.uid === uProfile.uid;
                    const uRole = uProfile.role || 'user';
                    
                    return (
                      <div 
                        key={uProfile.uid}
                        onClick={() => setSelectedUserForLogs(uProfile)}
                        className={`p-4 rounded-2xl bg-zinc-950 border transition-all cursor-pointer ${
                          isSelected 
                            ? 'border-cyan-500 shadow-[0_0_12px_rgba(6,182,212,0.1)]' 
                            : isBanned 
                              ? 'border-red-950 opacity-60' 
                              : 'border-zinc-900 hover:border-zinc-800'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs ${
                              uRole === 'owner' 
                                ? 'bg-purple-950/50 border border-purple-500/20 text-purple-400' 
                                : 'bg-cyan-950/50 border border-cyan-500/20 text-cyan-400'
                            }`}>
                              {uProfile.displayName?.charAt(0) || 'U'}
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                                {uProfile.displayName}
                                <span className={`text-[8px] px-1 py-0.2 rounded border font-semibold ${
                                  uRole === 'owner' 
                                    ? 'bg-purple-950 border-purple-500/20 text-purple-400' 
                                    : 'bg-zinc-900 border-zinc-800 text-zinc-400'
                                }`}>
                                  {uRole === 'owner' ? '업주' : '일반'}
                                </span>
                              </h4>
                              <p className="text-[9px] text-zinc-550 mt-0.5">{uProfile.email}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => handleUpdateUserStatus(uProfile.uid, uProfile.status)}
                              disabled={actionLoading === `user-${uProfile.uid}`}
                              className={`px-3 py-1.5 rounded-lg text-[9px] font-black tracking-tight border transition-colors ${
                                isBanned
                                  ? 'bg-emerald-950/30 border-emerald-500/20 text-emerald-400 hover:bg-emerald-950/50'
                                  : 'bg-red-950/30 border-red-500/20 text-red-400 hover:bg-red-950/50'
                              }`}
                            >
                              {isBanned ? '차단 해제' : '영업방해 차단'}
                            </button>
                            <ChevronRight className={`w-3.5 h-3.5 text-zinc-700 transition-transform ${isSelected ? 'rotate-90 text-cyan-400' : ''}`} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Selected User Logs Timeline View */}
                {selectedUserForLogs && (
                  <div className="p-5 rounded-2xl bg-zinc-950 border border-cyan-900/30 space-y-4 animate-slideDown">
                    <div className="flex items-center gap-2 border-b border-zinc-900 pb-2.5">
                      <FileText className="w-4 h-4 text-cyan-400" />
                      <h4 className="text-xs font-black text-white">
                        [{selectedUserForLogs.displayName}] 실시간 예약 및 노쇼 로그
                      </h4>
                    </div>

                    <div className="space-y-3.5 max-h-60 overflow-y-auto scrollbar-none pr-1">
                      {reservations.filter(r => r.userId === selectedUserForLogs.uid).length > 0 ? (
                        reservations
                          .filter(r => r.userId === selectedUserForLogs.uid)
                          .map((res) => {
                            const isCanceled = res.status === 'canceled';
                            const isNoShow = res.status === 'noshow_expired';
                            const isCompleted = res.status === 'completed' || res.status === 'visited';

                            return (
                              <div key={res.id} className="text-[10px] bg-[#0C0C0E] p-3 rounded-xl border border-zinc-900 space-y-1 relative">
                                <div className="flex justify-between items-center">
                                  <span className="font-extrabold text-white text-[11px]">{res.venueName}</span>
                                  <span className={`px-2 py-0.5 rounded-md font-extrabold border text-[8px] ${
                                    isCanceled 
                                      ? 'bg-zinc-900 border-zinc-800 text-zinc-550' 
                                      : isNoShow 
                                        ? 'bg-red-950/60 border-red-500/20 text-red-400 animate-pulse'
                                        : isCompleted 
                                          ? 'bg-emerald-950/40 border-emerald-500/20 text-emerald-400'
                                          : 'bg-cyan-950/40 border-cyan-500/20 text-cyan-400'
                                  }`}>
                                    {res.status === 'confirmed' ? '예약확정 (결제완료)' : 
                                     res.status === 'visited' ? '현장 입장함' : 
                                     res.status === 'completed' ? '퇴장 완료' : 
                                     res.status === 'canceled' ? '고객 직접취소' : 
                                     res.status === 'noshow_expired' ? '⚠️ 노쇼(보증금몰수)' : '기타'}
                                  </span>
                                </div>
                                <div className="text-zinc-500 space-y-0.5 mt-1 font-medium">
                                  <p>좌석: {res.seatLabel} ({res.visitTime} 방문예정)</p>
                                  <p>보증금 금액: {res.paymentAmount.toLocaleString()}원</p>
                                  <p className="text-[9px] text-zinc-650">식별키: {res.id}</p>
                                </div>
                              </div>
                            );
                          })
                      ) : (
                        <p className="text-center text-[10px] text-zinc-650 py-4">해당 사용자의 예약 거래 장부 기록이 비어있습니다.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* -------------------------------------------------------------
                TAB 4: OWNER APPROVALS (업주 심사제어)
                ------------------------------------------------------------- */}
            {activeTab === 'owners' && (
              <div className="space-y-4 animate-fadeIn">
                <h3 className="text-xs font-bold text-amber-400 uppercase tracking-widest">
                  신규 업주 심사 승인 대기열 ({users.filter(u => u.role === 'owner' && u.status === 'pending').length})
                </h3>

                <div className="space-y-3">
                  {users.filter(u => u.role === 'owner').map((owner) => {
                    const isPending = owner.status === 'pending';
                    const isApproved = owner.status === 'approved';
                    const isRejected = owner.status === 'rejected';

                    return (
                      <div 
                        key={owner.uid} 
                        className={`p-4.5 rounded-2xl bg-zinc-950 border transition-all ${
                          isPending 
                            ? 'border-amber-500/30 bg-amber-950/5' 
                            : 'border-zinc-900 opacity-60'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${
                              isApproved 
                                ? 'bg-emerald-950 border-emerald-500/20 text-emerald-400' 
                                : isRejected 
                                  ? 'bg-red-950 border-red-500/20 text-red-400'
                                  : 'bg-amber-950 border-amber-500/25 text-amber-400 animate-pulse'
                            }`}>
                              {isApproved ? '승인 완료' : isRejected ? '거절됨' : '서류 심사 중'}
                            </span>
                            <h4 className="text-sm font-bold text-white mt-2">{owner.displayName}</h4>
                            <p className="text-[10px] text-zinc-550 mt-0.5 font-medium">{owner.email}</p>
                            <p className="text-[10px] text-zinc-550 font-medium">연락처: {owner.phoneNumber || '미등록'}</p>
                          </div>
                        </div>

                        {isPending && (
                          <div className="flex gap-2 mt-4 border-t border-zinc-900/60 pt-3">
                            <button
                              onClick={() => handleApproveOwner(owner.uid, 'approved')}
                              disabled={actionLoading === `owner-${owner.uid}`}
                              className="flex-1 py-2 rounded-xl bg-gradient-to-r from-emerald-650 to-teal-550 text-black text-[10px] font-black transition-all hover:brightness-110 active:scale-97 flex items-center justify-center gap-1"
                            >
                              <CheckCircle className="w-3.5 h-3.5 text-black" />
                              <span>입점 승인</span>
                            </button>
                            <button
                              onClick={() => handleApproveOwner(owner.uid, 'rejected')}
                              disabled={actionLoading === `owner-${owner.uid}`}
                              className="px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 text-[10px] font-black hover:text-red-400 transition-all flex items-center justify-center gap-1"
                            >
                              <XCircle className="w-3.5 h-3.5 text-zinc-550" />
                              <span>반려</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {users.filter(u => u.role === 'owner').length === 0 && (
                    <p className="text-center text-xs text-zinc-650 py-12">입점 신청 기록을 가진 업주 회원이 없습니다.</p>
                  )}
                </div>
              </div>
            )}

            {/* -------------------------------------------------------------
                TAB 5: REPORT CENTER (신고 센터)
                ------------------------------------------------------------- */}
            {activeTab === 'reports' && (
              <div className="space-y-4 animate-fadeIn">
                <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest">
                  신고 민원 관리 대기열 ({reports.filter(r => r.status === 'pending').length})
                </h3>

                <div className="space-y-3">
                  {reports.map((report) => {
                    const isPending = report.status === 'pending';
                    const isResolved = report.status === 'resolved';
                    const isDismissed = report.status === 'dismissed';

                    return (
                      <div 
                        key={report.id} 
                        className={`p-4.5 rounded-2xl bg-zinc-950 border transition-all ${
                          isPending 
                            ? 'border-red-900 bg-red-950/5' 
                            : 'border-zinc-900 opacity-60'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${
                                isResolved
                                  ? 'bg-emerald-950 border-emerald-500/20 text-emerald-400'
                                  : isDismissed
                                    ? 'bg-zinc-900 border-zinc-850 text-zinc-500'
                                    : 'bg-red-950 border-red-500/25 text-red-400'
                              }`}>
                                {isResolved ? '조치 완료' : isDismissed ? '기각됨' : '조치 대기'}
                              </span>
                              <span className="text-[9px] font-bold text-zinc-550">
                                {report.createdAt ? new Date(report.createdAt).toLocaleDateString() : ''}
                              </span>
                            </div>
                            
                            <h4 className="text-[11px] text-zinc-400 font-bold mt-1.5">
                              피신고 매장: <b className="text-white text-xs">{report.targetName}</b>
                            </h4>
                            
                            <div className="bg-[#0C0C0E] p-3 rounded-xl border border-zinc-900/60 text-[10px] space-y-1.5 mt-2">
                              <p className="text-zinc-450 leading-relaxed font-medium">
                                <b className="text-red-400">사유: {report.reason}</b> <br />
                                {report.description}
                              </p>
                              <div className="border-t border-zinc-900 pt-1.5 text-[9px] text-zinc-600 flex justify-between">
                                <span>신고자: {report.reporterName}</span>
                                <span>민원코드: {report.id}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {isPending && (
                          <div className="flex gap-2 mt-4 border-t border-zinc-900/60 pt-3">
                            <button
                              onClick={() => handleResolveReport(report.id, 'resolved')}
                              disabled={actionLoading === `report-${report.id}`}
                              className="flex-1 py-2 rounded-xl bg-gradient-to-r from-red-600 to-orange-650 text-white text-[10px] font-black transition-all hover:brightness-110 active:scale-97 flex items-center justify-center gap-1"
                            >
                              <CheckCircle className="w-3.5 h-3.5 text-white" />
                              <span>조치 반영</span>
                            </button>
                            <button
                              onClick={() => handleResolveReport(report.id, 'dismissed')}
                              disabled={actionLoading === `report-${report.id}`}
                              className="px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-500 text-[10px] font-black hover:text-zinc-300 transition-all flex items-center justify-center gap-1"
                            >
                              <span>기각</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {reports.length === 0 && (
                    <p className="text-center text-xs text-zinc-650 py-12">접수된 허위 정보 민원 신고 내역이 없습니다.</p>
                  )}
                </div>
              </div>
            )}

            {/* -------------------------------------------------------------
                TAB 6: ABUSE MONITOR (긴급딜 이상 어뷰징 모니터링)
                ------------------------------------------------------------- */}
            {activeTab === 'abuse' && (
              <div className="space-y-4 animate-fadeIn">
                <div className="space-y-1.5">
                  <h3 className="text-xs font-bold text-orange-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Flame className="w-4 h-4 text-orange-500 animate-bounce" />
                    실시간 긴급딜 이상 탐지 모니터
                  </h3>
                  <p className="text-[10px] text-zinc-550 leading-relaxed">
                    클릭 수가 200회를 초과하거나, 판매 수량이 90% 이상 채워진 긴급딜의 비정상 마케팅/매크로 어뷰징 시도를 실시간 알고리즘으로 추적합니다.
                  </p>
                </div>

                <div className="space-y-3">
                  {deals.map((deal) => {
                    const clickCount = deal.clicks || 0;
                    const conversionRate = deal.totalSlots > 0 ? (deal.usedSlots / deal.totalSlots) * 100 : 0;
                    
                    // Abuse detection math: click > 200 OR conversion >= 90%
                    const isAbuseSuspected = clickCount > 200 || conversionRate >= 90;
                    const isDealActive = deal.status === 'active';

                    return (
                      <div 
                        key={deal.id} 
                        className={`p-4.5 rounded-2xl bg-zinc-950 border transition-all ${
                          isAbuseSuspected && isDealActive
                            ? 'border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.15)] bg-red-950/5' 
                            : 'border-zinc-900 opacity-60'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div className="space-y-2 w-full">
                            <div className="flex justify-between items-start w-full">
                              <span className="text-[9px] font-bold text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded">
                                {deal.benefitValue}
                              </span>
                              
                              {isAbuseSuspected && isDealActive && (
                                <span className="inline-flex items-center gap-0.5 rounded bg-red-950 border border-red-500/30 px-1.5 py-0.5 text-[8.5px] font-black text-red-400 animate-pulse">
                                  <AlertTriangle className="w-3 h-3 text-red-500 animate-bounce" />
                                  ⚠️ 어뷰징 의심
                                </span>
                              )}
                            </div>

                            <h4 className="text-xs font-bold text-white leading-snug">{deal.title}</h4>
                            <p className="text-[10px] text-zinc-500 font-medium leading-relaxed">{deal.description}</p>
                            
                            {/* Real-time stats conversion counters */}
                            <div className="grid grid-cols-2 gap-2 pt-2 text-[10px]">
                              <div className="p-2 rounded-lg bg-[#0C0C0E] border border-zinc-900 text-center">
                                <span className="text-zinc-650 block text-[9px] font-semibold">캠페인 클릭 수</span>
                                <b className={`text-xs ${clickCount > 200 ? 'text-red-400 font-black' : 'text-white'}`}>
                                  {clickCount}회
                                </b>
                              </div>
                              <div className="p-2 rounded-lg bg-[#0C0C0E] border border-zinc-900 text-center">
                                <span className="text-zinc-650 block text-[9px] font-semibold">딜 예약 소진율</span>
                                <b className={`text-xs ${conversionRate >= 90 ? 'text-red-400 font-black' : 'text-emerald-400'}`}>
                                  {conversionRate.toFixed(0)}% ({deal.usedSlots}/{deal.totalSlots})
                                </b>
                              </div>
                            </div>
                          </div>
                        </div>

                        {isDealActive && (
                          <div className="mt-4 border-t border-zinc-900/60 pt-3 flex gap-2">
                            <button
                              onClick={() => handleForceCloseDeal(deal.id)}
                              disabled={actionLoading === `deal-${deal.id}`}
                              className="w-full py-2.5 rounded-xl bg-red-950 border border-red-500/20 text-[10px] font-black text-red-400 hover:bg-red-950/50 transition-all flex items-center justify-center gap-1 active:scale-97"
                            >
                              <AlertOctagon className="w-3.5 h-3.5 text-red-500" />
                              <span>어뷰징 딜 강제 종료 (수동 기각)</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {deals.length === 0 && (
                    <p className="text-center text-xs text-zinc-650 py-12">현재 활성화된 긴급딜 캠페인이 없습니다.</p>
                  )}
                </div>
              </div>
            )}

            {/* -------------------------------------------------------------
                TAB 7: AI PLATFORM ANALYTICS
                ------------------------------------------------------------- */}
            {activeTab === 'ai' && (
              <div className="space-y-6 animate-fadeIn">
                {/* AI Executive Summary Header */}
                <div className="p-5 rounded-2xl bg-gradient-to-tr from-purple-950/10 to-zinc-900/50 border border-purple-500/20 shadow-[0_0_20px_rgba(168,85,247,0.04)] space-y-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-400 animate-pulse fill-purple-400" />
                    <h4 className="text-[10px] font-black tracking-widest text-purple-400 uppercase">
                      AI 플랫폼 분석보고서 (Intelligent Report)
                    </h4>
                  </div>
                  <p className="text-[9.5px] text-zinc-500 leading-normal font-medium">
                    본 분석실은 플랫폼 전반에 수집된 실시간 테이블 예약/선주문 결제 데이터 및 업주 긴급딜의 소진 추이를 자가진단 연산하는 인공지능 플랫폼 네비게이터입니다.
                  </p>
                </div>

                {/* Platform core KPIs */}
                <div className="grid grid-cols-2 gap-3.5">
                  <div className="p-4 bg-zinc-900/50 border border-zinc-850 rounded-2xl">
                    <span className="text-[9px] font-black text-zinc-550 uppercase tracking-widest block">평균 좌석 회전율</span>
                    <span className="text-xl font-black text-purple-400 font-mono block mt-1">{globalAiStats.averageTurnoverIndex}</span>
                    <p className="text-[8px] text-zinc-600 mt-1 font-semibold">완료 예약 / 총 가용 석수</p>
                  </div>
                  
                  <div className="p-4 bg-zinc-900/50 border border-zinc-850 rounded-2xl">
                    <span className="text-[9px] font-black text-zinc-550 uppercase tracking-widest block">긴급딜 전환 효율</span>
                    <span className="text-xl font-black text-orange-450 font-mono block mt-1">{globalAiStats.dealEfficiencyRate}%</span>
                    <p className="text-[8px] text-zinc-600 mt-1 font-semibold">예약 유입 / 클릭 지수</p>
                  </div>
                </div>

                {/* 5-Day Historical Conversions Charts */}
                <div className="p-5 bg-zinc-950/80 border border-zinc-900 rounded-3xl space-y-3.5">
                  <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block">
                    📈 플랫폼 최근 5일 예약 및 전환 추이
                  </span>
                  
                  <div className="space-y-3 pt-2">
                    {globalAiStats.conversionsByDay.map((data, idx) => {
                      const percentage = Math.round((data.conversions / data.reservations) * 100);
                      return (
                        <div key={idx} className="space-y-1.5">
                          <div className="flex justify-between items-center text-[10px] font-mono">
                            <span className="text-zinc-400 font-bold">{data.day}</span>
                            <span className="text-zinc-500 font-bold">
                              매칭 예약 <b className="text-white">{data.reservations}건</b> / 긴급딜 <b className="text-orange-400">{data.conversions}건</b> ({percentage}%)
                            </span>
                          </div>
                          
                          <div className="w-full bg-zinc-900 h-2 rounded-full overflow-hidden border border-zinc-905">
                            <div 
                              className="bg-gradient-to-r from-purple-500 to-orange-500 h-2 rounded-full shadow-[0_0_8px_rgba(168,85,247,0.4)] transition-all duration-500"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Owner Performance rankings Scorecards */}
                <div className="p-5 bg-zinc-950/80 border border-zinc-900 rounded-3xl space-y-3.5">
                  <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest block">
                    👑 요식업주 조리 및 예약 대응 지표 랭킹
                  </span>

                  <div className="space-y-3.5">
                    {globalAiStats.activeOwnersRank.map((owner, idx) => (
                      <div 
                        key={idx} 
                        className="flex justify-between items-center bg-zinc-900/30 p-3 rounded-2xl border border-zinc-905"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className={`w-5.5 h-5.5 rounded-lg text-[9.5px] font-black flex items-center justify-center border ${
                            idx === 0 
                              ? 'bg-amber-950/40 text-amber-400 border-amber-500/25'
                              : 'bg-zinc-850/60 text-zinc-300 border-zinc-800'
                          }`}>
                            {idx + 1}
                          </span>
                          <div>
                            <span className="text-[11px] font-bold text-white block">{owner.name}</span>
                            <span className="text-[8.5px] text-zinc-550 font-bold block mt-0.5">
                              평균 조리 개시 속도: {owner.responseSpeedSec}초
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-xs font-black text-purple-400">{owner.score}점</span>
                          <span className="text-[8px] text-zinc-650 block font-semibold mt-0.5">AI 지수</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

          </div>
        )}
      </section>
    </main>
  );
}
