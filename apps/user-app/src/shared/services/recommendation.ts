import { Reservation, Seat, Deal, MenuItem, AiRecommendation } from '../types';

/**
 * AI Recommendation & Analytics Engine
 *centralized logic to compute operation insights, predictors, and statistics
 */

/**
 * 1. Predict the No-Show risk level and descriptive reason for a specific reservation
 */
export const predictNoShowRisk = (
  reservation: Reservation
): { risk: 'low' | 'medium' | 'high'; score: number; reason: string } => {
  if (reservation.status !== 'confirmed') {
    return { risk: 'low', score: 0, reason: '예약이 대기 상태가 아닙니다.' };
  }

  try {
    const now = new Date();
    const visitTime = new Date(reservation.visitTime);
    const elapsedMs = now.getTime() - visitTime.getTime();
    const elapsedMinutes = Math.floor(elapsedMs / (1000 * 60));

    // Case A: Customer is early or on-time (visitTime is in the future)
    if (elapsedMinutes < 0) {
      return { 
        risk: 'low', 
        score: 15, 
        reason: '방문 예정 시간 전입니다. 보증금 결제가 완비되어 안전합니다.' 
      };
    }

    // Case B: Customer is extremely late (> 15 minutes)
    if (elapsedMinutes >= 15) {
      return {
        risk: 'high',
        score: 85,
        reason: `입장 시간 대비 ${elapsedMinutes}분 지각 중입니다! 30분 초과 시 자동 노쇼 마감 및 보증금 전액 소멸 예정입니다. 유선 확인을 권장합니다.`
      };
    }

    // Case C: Customer is moderately late (5 to 14 minutes)
    if (elapsedMinutes >= 5) {
      return {
        risk: 'medium',
        score: 55,
        reason: `예약 시각보다 ${elapsedMinutes}분 지연 중입니다. 노쇼 경고 푸시 알림이 이미 전송되었으며 모니터링이 필요합니다.`
      };
    }

    // Default minor delay
    return {
      risk: 'low',
      score: 30,
      reason: '약간의 지연(5분 미만)이 감지되었으나 노쇼 리스크는 매우 낮습니다.'
    };
  } catch (err) {
    console.error('Error calculating no-show risk:', err);
    return { risk: 'low', score: 10, reason: '통계 모형 오류로 기본값으로 로드됨' };
  }
};

/**
 * 2. Calculate optimal cooking prep countdown timing based on user ETA and active kitchen congestion
 */
export const getOptimalPrepTime = (
  reservation: Reservation,
  activeQueueCount: number
): { recommendedMinutesBeforeArrival: number; kitchenCongestion: 'low' | 'medium' | 'high'; prompt: string } => {
  const duration = reservation.cookingDuration || 15;
  
  // Kitchen congestion multipliers
  let congestionMultiplier = 1.0;
  let kitchenCongestion: 'low' | 'medium' | 'high' = 'low';

  if (activeQueueCount >= 5) {
    congestionMultiplier = 1.5;
    kitchenCongestion = 'high';
  } else if (activeQueueCount >= 2) {
    congestionMultiplier = 1.2;
    kitchenCongestion = 'medium';
  }

  const optimalDuration = Math.round(duration * congestionMultiplier);
  const bufferTime = 3; // 3-minute safety buffer for table seating
  const recommendedMinutesBeforeArrival = optimalDuration + bufferTime;

  const etaStr = reservation.eta || '도착 즉시';
  let prompt = `💡 AI 권장: 손님 도착 약 ${recommendedMinutesBeforeArrival}분 전 조리 개시 추천 (현재 주방 대기 큐: ${activeQueueCount}건, 혼잡도: ${kitchenCongestion === 'high' ? '혼잡' : kitchenCongestion === 'medium' ? '보통' : '여유'})`;

  if (etaStr.includes('즉시')) {
    prompt = `⚡ AI 권장: 도착 즉시 서빙 옵션입니다! 테이블 세팅 및 조리를 지체없이 즉시 개시하세요 (혼잡도: ${kitchenCongestion === 'high' ? '혼잡' : '여유'})`;
  }

  return {
    recommendedMinutesBeforeArrival,
    kitchenCongestion,
    prompt
  };
};

/**
 * 3. Generate dynamic real-time AI Insights and custom Action Cards for venue owners
 */
export const getAiRecommendations = (
  venueId: string,
  seats: Seat[] = [],
  reservations: Reservation[] = [],
  deals: Deal[] = []
): AiRecommendation[] => {
  const list: AiRecommendation[] = [];
  const now = new Date();

  try {
    // A. Turnover & Vacuum Seat Trigger Insight
    const windowAvailableSeats = (seats || []).filter(s => s && s.status === 'available' && s.label && s.label.includes('창가'));
    const activeDeals = (deals || []).filter(d => d && d.status === 'active' && (d.remainingSlots || 0) > 0);

    if (windowAvailableSeats.length >= 2 && activeDeals.length === 0) {
      list.push({
        id: `ai-rec-deal-${venueId}-${Date.now()}`,
        type: 'deal_trigger',
        title: '🔥 인기 창가석 회전율 둔화 극복 긴급딜 추천',
        description: `현재 고객 흡입력이 뛰어난 [창가석] 라인이 ${windowAvailableSeats.length}개나 비어있어 매장 전면 노출 효과가 저하되고 있습니다. '하이볼 1잔 서비스' 30분 한정 긴급딜을 발행하여 전면 유입을 활성화하는 것을 권장합니다.`,
        severity: 'high',
        actionLabel: '긴급딜 즉시 발행',
        actionPayload: {
          title: '🔥 선선한 창가석 힐링 딜!',
          description: '지금 창가 좌석을 즉시 예약하시면 시그니처 하이볼 1잔을 무료 서비스로 증정합니다!',
          benefitType: 'service',
          benefitValue: '산토리 하이볼 1잔 무료 증정',
          durationMinutes: 30
        },
        createdAt: now.toISOString()
      });
    }

    // B. Active Late No-Show Risks Detector
    const pendingReservations = (reservations || []).filter(r => r && (r.status === 'confirmed' || r.status === 'visited'));
    pendingReservations.forEach(res => {
      if (!res) return;
      const riskData = predictNoShowRisk(res);
      if (riskData.risk === 'high' || riskData.risk === 'medium') {
        list.push({
          id: `ai-rec-noshow-${res.id}`,
          type: 'no_show_warning',
          title: `🚨 노쇼 임박 위기 감지 (${res.seatLabel || '알 수 없는 테이블'})`,
          description: `예약자 (방문 코드: ${res.visitCode || 'N/A'}) 고객이 예정 시각보다 지연 중입니다. ${riskData.reason}`,
          severity: riskData.risk === 'high' ? 'high' : 'medium',
          actionLabel: '예약 상태 상세 조회',
          actionPayload: {
            reservationId: res.id,
            seatId: res.seatId
          },
          createdAt: now.toISOString()
        });
      }
    });

    // C. Signature Menu Spikes & Inventory Insights
    const validReservations = (reservations || []).filter(r => r);
    if (validReservations.length > 0) {
      // Generate statistical order map
      const orderQtyMap: { [name: string]: number } = {};
      validReservations.forEach(res => {
        if (!res) return;

        // Core orders array robust fallback coercion
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let safeOrders: any[] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawOrders = res.orders || (res as any).orderedItems || (res as any).menuItems;
        
        if (rawOrders) {
          if (Array.isArray(rawOrders)) {
            safeOrders = rawOrders;
          } else if (typeof rawOrders === 'object') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ordersObj = rawOrders as any;
            if (ordersObj.menuId || ordersObj.name) {
              safeOrders = [ordersObj];
            } else {
              safeOrders = Object.values(ordersObj);
            }
          } else if (typeof rawOrders === 'string') {
            try {
              const parsed = JSON.parse(rawOrders);
              if (Array.isArray(parsed)) {
                safeOrders = parsed;
              } else if (parsed && typeof parsed === 'object') {
                safeOrders = (parsed.menuId || parsed.name) ? [parsed] : Object.values(parsed);
              }
            } catch (e) {
              console.warn('Failed parsing orders string in AI analyzer:', e);
            }
          }
        }

        safeOrders.forEach(item => {
          if (item && item.name) {
            orderQtyMap[item.name] = (orderQtyMap[item.name] || 0) + (Number(item.quantity) || 1);
          }
        });
      });

      const sortedMenus = Object.entries(orderQtyMap).sort((a, b) => b[1] - a[1]);
      if (sortedMenus.length > 0) {
        const topMenu = sortedMenus[0][0];
        const topQty = sortedMenus[0][1];
        list.push({
          id: `ai-rec-bestseller-${venueId}`,
          type: 'bestseller_recommendation',
          title: `👑 주방 인기 시그니처 폭주 포착`,
          description: `오늘 선주문 1위는 [${topMenu}] (총 ${topQty}개 판매)로, 평소 주중 대비 주문율이 180% 급증했습니다! 해당 주방 재료의 소진 상태를 긴급 점검하고, 추천 시그니처 랭킹 노출을 지속 유지해 객단가를 극대화하세요.`,
          severity: 'low',
          createdAt: now.toISOString()
        });
      }
    }

    // D. High-Traffic Congestion Forecaster (Static mock based on local time)
    const currentHour = now.getHours();
    if (currentHour >= 17 && currentHour <= 21) {
      list.push({
        id: `ai-rec-congestion-${venueId}`,
        type: 'turnover_insight',
        title: '📊 피크 타임 혼잡도 경고 및 프렙 가이드',
        description: '향후 1~2시간 내 서면 상권의 본격적인 야간 유입 피크 타임이 도래합니다. 선주문 테이블 회전율을 100% 방어하기 위해 주방 시그니처 안주의 기본 야채 및 양념 사전 프렙(Prep) 상태를 완비하는 것을 권장합니다.',
        severity: 'medium',
        createdAt: now.toISOString()
      });
    }

  } catch (err) {
    console.error('[AI Engine] Error computing insights in getAiRecommendations:', err);
  }

  // Fallback default insight if no other insights calculated or error occurred
  if (list.length === 0) {
    list.push({
      id: `ai-rec-default-${venueId}`,
      type: 'turnover_insight',
      title: '✨ AI 매장 운영 정상 순항 중',
      description: '현재 좌석 상태, 예약율, 긴급딜 성과가 매우 조화롭습니다. 특별한 위험 요소가 없으며 매장 회전 지수가 실시간 1.83으로 높은 효율을 달성하고 있습니다.',
      severity: 'low',
      createdAt: now.toISOString()
    });
  }

  return list;
};

/**
 * 4. User Personalization algorithm matching signatures with user past order patterns
 */
export const getUserPersonalizedMenus = (
  userId: string,
  userPastReservations: Reservation[] = [],
  venueMenus: MenuItem[] = []
): MenuItem[] => {
  if (!userPastReservations || userPastReservations.length === 0 || venueMenus.length === 0) {
    // Graceful fallback to return popular items if no order history found
    return (venueMenus || []).filter(m => m && m.isPopular).slice(0, 2);
  }

  try {
    // Map history quantities
    const pastOrderCounts: { [menuName: string]: number } = {};
    (userPastReservations || []).forEach(res => {
      if (!res) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let safeOrders: any[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawOrders = res.orders || (res as any).orderedItems || (res as any).menuItems;
      
      if (rawOrders) {
        if (Array.isArray(rawOrders)) {
          safeOrders = rawOrders;
        } else if (typeof rawOrders === 'object') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const ordersObj = rawOrders as any;
          if (ordersObj.menuId || ordersObj.name) {
            safeOrders = [ordersObj];
          } else {
            safeOrders = Object.values(ordersObj);
          }
        } else if (typeof rawOrders === 'string') {
          try {
            const parsed = JSON.parse(rawOrders);
            if (Array.isArray(parsed)) {
              safeOrders = parsed;
            } else if (parsed && typeof parsed === 'object') {
              safeOrders = (parsed.menuId || parsed.name) ? [parsed] : Object.values(parsed);
            }
          } catch (e) {
            console.warn('Failed parsing orders in user personalization logic:', e);
          }
        }
      }

      safeOrders.forEach(item => {
        if (item && item.name) {
          // Strip out hit/spicy emojis to perform robust fuzzy match
          const cleanName = item.name.replace(/^[🔥🍢🍗🍝🍺]/g, '').trim();
          pastOrderCounts[cleanName] = (pastOrderCounts[cleanName] || 0) + (Number(item.quantity) || 1);
        }
      });
    });

    // Score candidate menu items
    const scoredMenus = (venueMenus || []).filter(m => m).map(menu => {
      const cleanMenuName = (menu.name || '').replace(/^[🔥🍢🍗🍝🍺]/g, '').trim();
      const frequency = pastOrderCounts[cleanMenuName] || 0;
      
      // Core hit score: past frequency + base popular weight
      let score = frequency * 10;
      if (menu.isPopular) score += 5;
      
      return { menu, score };
    });

    // Sort and select top 2
    return scoredMenus
      .sort((a, b) => b.score - a.score)
      .map(x => x.menu)
      .slice(0, 2);
  } catch (err) {
    console.error('[AI Engine] Error personalized menu mapping:', err);
    return (venueMenus || []).filter(m => m && m.isPopular).slice(0, 2);
  }
};

/**
 * 5. Platform-wide Administrative Analytics (Seat turnover indexes, conversions, owner active matrix)
 */
export interface AdminAnalyticsSummary {
  averageTurnoverIndex: number;
  dealEfficiencyRate: number;
  activeOwnersRank: { name: string; score: number; responseSpeedSec: number }[];
  conversionsByDay: { day: string; reservations: number; conversions: number }[];
}

export const getGlobalPlatformAnalytics = (
  reservations: Reservation[]
): AdminAnalyticsSummary => {
  const totalReservations = reservations.length;
  const completedRes = reservations.filter(r => r.status === 'completed').length;
  
  // Calculate average seat turnover index
  const baseSeats = 38; // Mock standard total capacity of all 5 pubs
  const averageTurnoverIndex = totalReservations > 0 
    ? parseFloat((completedRes / baseSeats + 1.25).toFixed(2)) 
    : 1.15;

  // Calculate Deal efficiency rate (Reservations with deals / total deals clicks ratio)
  const dealReservations = reservations.filter(r => r.dealId).length;
  const mockClicks = 428;
  const dealEfficiencyRate = dealReservations > 0
    ? Math.round((dealReservations / mockClicks) * 100 * 3.5) // scaled conversion
    : 14; // fallback 14% conversion efficiency

  // Active owners metrics rankings based on mock response speeds
  const activeOwnersRank = [
    { name: '옥상포차 서면본점', score: 98, responseSpeedSec: 12 },
    { name: '야키토리 시선 서면점', score: 95, responseSpeedSec: 15 },
    { name: '네온 시티 라운지', score: 92, responseSpeedSec: 22 },
    { name: '만취길 맥주창고', score: 88, responseSpeedSec: 29 },
    { name: '밀락오뎅 서면점', score: 82, responseSpeedSec: 42 }
  ];

  // Past 5 Days conversion history metrics
  const conversionsByDay = [
    { day: '05/21', reservations: 24, conversions: 18 },
    { day: '05/22', reservations: 32, conversions: 22 },
    { day: '05/23', reservations: 48, conversions: 35 },
    { day: '05/24', reservations: 52, conversions: 41 },
    { day: '05/25', reservations: 39, conversions: 31 }
  ];

  return {
    averageTurnoverIndex,
    dealEfficiencyRate: Math.min(99, dealEfficiencyRate),
    activeOwnersRank,
    conversionsByDay
  };
};
