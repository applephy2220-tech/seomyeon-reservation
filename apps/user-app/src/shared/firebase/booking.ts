import { db } from './clientApp';
import { 
  runTransaction, 
  doc, 
  collection, 
  updateDoc, 
  Timestamp 
} from 'firebase/firestore';
import { Seat, Reservation, Deal, OrderItem } from '../types';
import { triggerNotification } from './notification';

/**
 * 1. Firestore Transaction to safely lock a seat for 5 minutes
 */
export const lockSeatTransaction = async (
  seatId: string, 
  userId: string
): Promise<{ success: boolean; message: string }> => {
  const seatRef = doc(db, 'seats', seatId);
  
  try {
    return await runTransaction(db, async (transaction) => {
      const seatDoc = await transaction.get(seatRef);
      if (!seatDoc.exists()) {
        throw new Error('좌석이 존재하지 않습니다.');
      }
      
      const seatData = seatDoc.data() as Seat;
      const now = new Date();
      
      // Determine if the current lock has expired
      const isLockExpired = 
        seatData.status === 'locked' && 
        seatData.lockExpiresAt && 
        new Date(seatData.lockExpiresAt).getTime() < now.getTime();
      
      // Seat is lockable if status is 'available' OR current lock is expired
      if (seatData.status === 'available' || isLockExpired) {
        const lockedAt = now.toISOString();
        const lockExpiresAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString(); // 5 minutes lock
        
        transaction.update(seatRef, {
          status: 'locked',
          lockedBy: userId,
          lockedAt: lockedAt,
          lockExpiresAt: lockExpiresAt,
          updatedAt: Timestamp.now()
        });
        
        return { success: true, message: '좌석이 임시 선점되었습니다.' };
      } else {
        // Seat is currently in use or already locked by someone else
        return { success: false, message: '이미 다른 사용자가 선택한 자리입니다.' };
      }
    });
  } catch (error: unknown) {
    console.error('lockSeatTransaction failed:', error);
    const err = error as Error;
    return { success: false, message: err.message || '좌석 선점 중 오류가 발생했습니다.' };
  }
};

/**
 * 2. Release a lock on a seat and revert it back to 'available'
 */
export const releaseSeat = async (seatId: string): Promise<void> => {
  const seatRef = doc(db, 'seats', seatId);
  try {
    await updateDoc(seatRef, {
      status: 'available',
      lockedBy: null,
      lockedAt: null,
      lockExpiresAt: null,
      updatedAt: Timestamp.now()
    });
    console.log(`Seat ${seatId} successfully released to available.`);
  } catch (error) {
    console.error(`releaseSeat failed for seat ${seatId}:`, error);
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const sanitizeData = <T extends Record<string, any>>(obj: T): T => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const val = obj[key];
      if (val === undefined) {
        // Convert undefined to null or omit it. Here we omit it to keep the database clean,
        // unless it's a specific field. We will explicitly provide null for required ones.
        continue;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (val !== null && typeof val === 'object' && !((val as any) instanceof Timestamp) && !((val as any) instanceof Date)) {
        result[key] = sanitizeData(val);
      } else {
        result[key] = val;
      }
    }
  }
  return result as T;
};

/**
 * 3. Firestore Transaction to confirm payment and transition seat to 'reserved' status,
 * while creating the reservation document atomically.
 */
export const confirmMockPaymentTransaction = async (
  seatId: string,
  venueId: string,
  venueName: string,
  seatLabel: string,
  userId: string,
  dealId?: string | null,
  paymentKey: string = 'mock-key-' + Date.now(),
  orders: OrderItem[] = [],
  eta: string = '',
  customAmount: number = 5000
): Promise<{ success: boolean; reservationId?: string; message: string }> => {
  const seatRef = doc(db, 'seats', seatId);
  const reservationsCol = collection(db, 'reservations');
  const newReservationDocRef = doc(reservationsCol);
  const reservationId = newReservationDocRef.id;
  
  // Outer scope declaration of visitCode to trigger notifications after transaction finishes
  const visitCode = Math.floor(1000 + Math.random() * 9000).toString();

  try {
    const result = await runTransaction(db, async (transaction) => {
      const seatDoc = await transaction.get(seatRef);
      if (!seatDoc.exists()) {
        throw new Error('좌석 정보를 찾을 수 없습니다.');
      }

      const seatData = seatDoc.data() as Seat;
      const now = new Date();

      // Check if current user owns the lock and it hasn't expired yet
      const isLockValid = 
        seatData.status === 'locked' && 
        seatData.lockedBy === userId &&
        seatData.lockExpiresAt &&
        new Date(seatData.lockExpiresAt).getTime() >= now.getTime();

      if (!isLockValid) {
        throw new Error('예약 선점 세션이 만료되었거나 올바르지 않습니다.');
      }

      // If a deal is attached, verify and update the deal document atomically
      if (dealId) {
        const dealRef = doc(db, 'deals', dealId);
        const dealDoc = await transaction.get(dealRef);
        if (!dealDoc.exists()) {
          throw new Error('연동된 긴급딜 정보를 찾을 수 없습니다.');
        }
        const dealData = dealDoc.data() as Deal;
        if (dealData.status !== 'active' || (dealData.remainingSlots !== undefined && dealData.remainingSlots <= 0)) {
          throw new Error('이 긴급딜은 이미 판매 완료되었거나 만료되었습니다.');
        }

        const newUsedSlots = (dealData.usedSlots || 0) + 1;
        const newRemainingSlots = Math.max(0, (dealData.totalSlots || 1) - newUsedSlots);
        const isNowSoldOut = newRemainingSlots <= 0;

        // Update Deal slots and set sold_out status atomically
        transaction.update(dealRef, {
          usedSlots: newUsedSlots,
          remainingSlots: newRemainingSlots,
          status: isNowSoldOut ? 'sold_out' : 'active',
          updatedAt: Timestamp.now()
        });
      }

      // Visit details (defaulting today)
      const visitTime = now.toISOString();
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours expiry

      // Calculate safe payment status based on whether it is mock payment or real Toss
      const isMockPayment = paymentKey.startsWith('mock-key-');
      const paymentStatus = isMockPayment ? 'mock_paid' : 'paid';

      const reservationData: Reservation = {
        id: reservationId,
        userId,
        venueId,
        seatId,
        venueName,
        seatLabel,
        status: 'confirmed',
        paymentStatus,
        paymentKey,
        visitTime,
        expiresAt,
        paymentAmount: customAmount,
        visitCode: visitCode || Math.floor(1000 + Math.random() * 9000).toString(),
        createdAt: Timestamp.now(),
        dealId: dealId || null,
        orderId: null,
        preOrderId: null,
        // 선주문 연동 추가
        orders: orders && orders.length > 0 ? orders : [],
        orderStatus: orders && orders.length > 0 ? 'pending' : 'none',
        eta: eta || '',
        cookingDuration: 15
      };

      // B. Create the reservation record with sanitized data (no undefined fields)
      transaction.set(newReservationDocRef, sanitizeData(reservationData));

      // C. Update the seat status, current reservation ID, and activeDealId link
      transaction.update(seatRef, {
        status: 'reserved',
        currentReservationId: reservationId,
        activeDealId: null,
        lockedBy: null,
        lockedAt: null,
        lockExpiresAt: null,
        updatedAt: Timestamp.now()
      });

      return { 
        success: true, 
        reservationId, 
        message: '예약 및 결제가 정상적으로 확정되었습니다.' 
      };
    });

    // Dispatch hybrid real-time notifications on successful payment transaction
    if (result.success) {
      const hasOrder = orders && orders.length > 0;
      const orderCount = hasOrder ? orders.reduce((sum, item) => sum + item.quantity, 0) : 0;
      
      // A. Alert Guest
      triggerNotification(
        userId,
        hasOrder ? '🎉 예약 및 선주문 접수 완료!' : '🎉 예약 확정 완료!',
        hasOrder 
          ? `[${venueName} ${seatLabel}] 예약과 동시에 안주 ${orderCount}개 선주문 결제가 완료되었습니다. 도착 시 즉시 제공됩니다!`
          : `[${venueName} ${seatLabel}] 예약이 성공적으로 확정되었습니다. 디지털 티켓(방문코드: ${visitCode})을 확인해 주세요.`,
        `/reservation-success?id=${reservationId}`
      );
      
      // B. Alert Venue Owner
      triggerNotification(
        'demo-owner',
        hasOrder ? '🔔 신규 예약 및 주방 선주문 발생!' : '🔔 신규 예약 접수!',
        hasOrder
          ? `[${seatLabel}] 테이블에 메뉴 ${orderCount}개 선주문이 접수되었습니다! 주방 조비를 확인해 주세요. (도착 ETA: ${eta || '즉시'})`
          : `[${seatLabel}] 새로운 예약 신청이 접수되었습니다! (방문코드: ${visitCode})`,
        `/owner/dashboard`
      );
      
      // C. If deal was applied, alert Owner about deal checkout success
      if (dealId) {
        triggerNotification(
          'demo-owner',
          '🔥 긴급딜 예약 성사!',
          `[${seatLabel}] 테이블에 발행된 긴급딜 혜택 적용 예약이 성사되었습니다.`,
          `/owner/dashboard`
        );
      }
    }

    return result;

  } catch (error: unknown) {
    console.error('confirmMockPaymentTransaction failed:', error);
    const err = error as Error;
    return { success: false, message: err.message || '결제 진행 중 오류가 발생했습니다.' };
  }
};
