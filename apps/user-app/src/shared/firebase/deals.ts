import { db } from './clientApp';
import { 
  doc, 
  collection, 
  query, 
  where, 
  runTransaction, 
  onSnapshot, 
  Timestamp 
} from 'firebase/firestore';
import { useState, useEffect, useRef } from 'react';
import { Deal } from '../types';

/**
 * 1. Transaction to atomically create a Deal and bind it to the Seat
 */
export const createDealTransaction = async (
  dealData: Omit<Deal, 'id' | 'status' | 'createdAt' | 'usedSlots' | 'remainingSlots' | 'totalSlots'> & { totalSlots?: number }
): Promise<{ success: boolean; dealId?: string; message: string }> => {
  const dealsCol = collection(db, 'deals');
  const newDealDocRef = doc(dealsCol);
  const dealId = newDealDocRef.id;
  const seatRef = doc(db, 'seats', dealData.seatId);

  try {
    return await runTransaction(db, async (transaction) => {
      const seatSnap = await transaction.get(seatRef);
      if (!seatSnap.exists()) {
        throw new Error('좌석이 데이터베이스에 존재하지 않습니다.');
      }

      const seatData = seatSnap.data();
      if (seatData.status !== 'available') {
        throw new Error('이 좌석은 현재 이용 가능(available) 상태가 아니므로 긴급딜을 등록할 수 없습니다.');
      }

      const totalSlots = dealData.totalSlots || 1;
      const newDeal: Deal = {
        id: dealId,
        venueId: dealData.venueId,
        seatId: dealData.seatId,
        title: dealData.title,
        description: dealData.description,
        benefitType: dealData.benefitType,
        benefitValue: dealData.benefitValue,
        validUntil: dealData.validUntil,
        status: 'active',
        createdAt: Timestamp.now(),
        totalSlots,
        usedSlots: 0,
        remainingSlots: totalSlots,
        linkedSeatIds: dealData.linkedSeatIds || [dealData.seatId]
      };

      // Atomic Mutations:
      // A. Create the Deal record
      transaction.set(newDealDocRef, newDeal);

      // B. Update the Seat with activeDealId
      transaction.update(seatRef, {
        activeDealId: dealId,
        updatedAt: Timestamp.now()
      });

      return {
        success: true,
        dealId,
        message: `테이블 [${seatData.label}]에 긴급딜이 성공적으로 발행되었습니다!`
      };
    });
  } catch (error: unknown) {
    console.error('createDealTransaction failed:', error);
    const err = error as Error;
    return {
      success: false,
      message: err.message || '긴급딜 등록 중 예상치 못한 오류가 발생했습니다.'
    };
  }
};

/**
 * 2. Transaction to cancel an active deal and clean the Seat reference
 */
export const cancelDealTransaction = async (
  dealId: string,
  seatId: string
): Promise<{ success: boolean; message: string }> => {
  const dealRef = doc(db, 'deals', dealId);
  const seatRef = doc(db, 'seats', seatId);

  try {
    return await runTransaction(db, async (transaction) => {
      const dealSnap = await transaction.get(dealRef);
      if (!dealSnap.exists()) {
        throw new Error('긴급딜 내역을 찾을 수 없습니다.');
      }

      const dealData = dealSnap.data() as Deal;
      if (dealData.status !== 'active') {
        return { success: false, message: '이미 만료되었거나 취소된 긴급딜입니다.' };
      }

      // Atomic Mutations:
      // A. Update Deal status to 'cancelled'
      transaction.update(dealRef, {
        status: 'cancelled',
        updatedAt: Timestamp.now()
      });

      // B. Clean Seat activeDealId reference
      transaction.update(seatRef, {
        activeDealId: null,
        updatedAt: Timestamp.now()
      });

      return {
        success: true,
        message: '긴급딜이 성공적으로 취소 회수되었습니다.'
      };
    });
  } catch (error: unknown) {
    console.error('cancelDealTransaction failed:', error);
    const err = error as Error;
    return {
      success: false,
      message: err.message || '긴급딜 취소 처리 중 오류가 발생했습니다.'
    };
  }
};

/**
 * 3. Self-healing Deal expiry atomic write helper
 */
export const expireDealTransaction = async (
  dealId: string,
  seatId: string
): Promise<void> => {
  const dealRef = doc(db, 'deals', dealId);
  const seatRef = doc(db, 'seats', seatId);

  try {
    await runTransaction(db, async (transaction) => {
      const dealSnap = await transaction.get(dealRef);
      if (!dealSnap.exists()) return;

      const dealData = dealSnap.data() as Deal;
      if (dealData.status !== 'active') return;

      // Update Deal status to 'expired'
      transaction.update(dealRef, {
        status: 'expired',
        updatedAt: Timestamp.now()
      });

      // Clean Seat activeDealId reference
      transaction.update(seatRef, {
        activeDealId: null,
        updatedAt: Timestamp.now()
      });
    });
    console.log(`Deal ${dealId} has successfully been expired and seat unbound.`);
  } catch (error) {
    console.error(`expireDealTransaction failed for deal ${dealId}:`, error);
  }
};

interface UseRealtimeDealsOptions {
  venueId?: string;
  onlyActive?: boolean;
}

/**
 * 4. Subscribes to Seomyeon Emergency Deals in real-time
 */
export const useRealtimeDeals = (options: UseRealtimeDealsOptions = {}) => {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const { venueId, onlyActive } = options;

  useEffect(() => {
    setLoading(true);
    const dealsCol = collection(db, 'deals');

    // Build constraints
    const constraints = [];
    if (venueId) {
      constraints.push(where('venueId', '==', venueId));
    }
    if (onlyActive) {
      constraints.push(where('status', '==', 'active'));
    }

    const q = constraints.length > 0 ? query(dealsCol, ...constraints) : query(dealsCol);

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const dealsData: Deal[] = [];
        const now = new Date();

        snapshot.forEach((docSnap) => {
          const deal = { id: docSnap.id, ...docSnap.data() } as Deal;

          // Client-side Self-Healing Expiry Check
          const isExpired = 
            deal.status === 'active' && 
            deal.validUntil && 
            new Date(deal.validUntil).getTime() < now.getTime();

          if (isExpired) {
            deal.status = 'expired';
            // Asynchronously heal database
            expireDealTransaction(deal.id, deal.seatId).catch(err => 
              console.error('Self-healing expire deal failed:', err)
            );
          }

          dealsData.push(deal);
        });

        // Filter active only on client-side if onlyActive was specified
        let filteredDeals = dealsData;
        if (onlyActive) {
          filteredDeals = dealsData.filter(d => d.status === 'active' && d.remainingSlots > 0);
        }

        // Sort by creation time descending (newest first)
        filteredDeals.sort((a, b) => {
          const tA = a.createdAt ? (a.createdAt as unknown as { seconds?: number }).seconds || new Date(a.createdAt as string).getTime() : 0;
          const tB = b.createdAt ? (b.createdAt as unknown as { seconds?: number }).seconds || new Date(b.createdAt as string).getTime() : 0;
          return tB - tA;
        });

        setDeals(filteredDeals);
        setLoading(false);
      },
      (err) => {
        console.error('Real-time deals subscription failed:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [venueId, onlyActive]);

  // Keep a mutable ref to active deals so we can self-heal inside interval
  const dealsRef = useRef<Deal[]>(deals);
  useEffect(() => {
    dealsRef.current = deals;
  }, [deals]);

  const expiringDealIdsRef = useRef<Set<string>>(new Set());

  // Periodical interval check (every 5 seconds) to ensure self-healing completes cleanly
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const currentDeals = dealsRef.current;

      currentDeals.forEach((deal) => {
        const isExpired = 
          deal.status === 'active' && 
          deal.validUntil && 
          new Date(deal.validUntil).getTime() < now.getTime();

        if (isExpired) {
          if (expiringDealIdsRef.current.has(deal.id)) return;

          console.log(`Interval Self-healing: Deal ${deal.id} is expired. Expiring...`);
          expiringDealIdsRef.current.add(deal.id);

          expireDealTransaction(deal.id, deal.seatId)
            .then(() => {
              expiringDealIdsRef.current.delete(deal.id);
            })
            .catch((err) => {
              console.error('Interval expire deal transaction failed:', err);
              expiringDealIdsRef.current.delete(deal.id);
            });
        }
      });
    }, 5000);

    return () => clearInterval(timer);
  }, []);

  return { deals, loading, error };
};
