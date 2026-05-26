import { db } from './clientApp';
import { 
  doc, 
  Timestamp, 
  runTransaction, 
  collection, 
  query, 
  where, 
  getDocs, 
  limit 
} from 'firebase/firestore';
import { SeatStatus, Reservation, Seat } from '../types';
import { triggerNotification } from './notification';

/**
 * 1. Owner Action: Directly change a seat's status
 */
export const changeSeatStatus = async (
  seatId: string, 
  status: SeatStatus,
  availableUntil?: string,
  tag?: string
): Promise<void> => {
  const seatRef = doc(db, 'seats', seatId);
  try {
    await runTransaction(db, async (transaction) => {
      const seatDoc = await transaction.get(seatRef);
      if (!seatDoc.exists()) {
        throw new Error('좌석이 존재하지 않습니다.');
      }

      const seatData = seatDoc.data() as Seat;
      const updateData: Record<string, unknown> = {
        status,
        updatedAt: Timestamp.now()
      };

      // If reverting to available, closed, or occupied, clear active lock metadata
      if (status === 'available' || status === 'closed' || status === 'occupied') {
        updateData.lockedBy = null;
        updateData.lockedAt = null;
        updateData.lockExpiresAt = null;
      }

      // If freeing up the seat, sever active reservation association pointers
      if (status === 'available' || status === 'closed') {
        updateData.currentReservationId = null;
      }

      // Advanced Owner control: set custom duration and glowing tag if opening up
      if (status === 'available') {
        if (availableUntil) {
          updateData.availableUntil = availableUntil;
        }
        if (tag) {
          updateData.tag = tag;
        } else {
          updateData.tag = null; // Clear if not selected
        }
      } else {
        // If setting to occupied or closed, always clear the tag!
        updateData.tag = null;

        // If setting to occupied or closed, and there is an active deal, cancel the deal atomically!
        if (seatData.activeDealId) {
          const dealRef = doc(db, 'deals', seatData.activeDealId);
          transaction.update(dealRef, {
            status: 'cancelled',
            updatedAt: Timestamp.now()
          });
          updateData.activeDealId = null;
        }
      }

      transaction.update(seatRef, updateData);
    });

    console.log(`Seat ${seatId} successfully updated to status: ${status}`);
  } catch (error) {
    console.error(`changeSeatStatus failed for seat ${seatId}:`, error);
    throw error;
  }
};

/**
 * 2. Owner Action: Validate guest check-in PIN and atomically free the seat.
 * Executes pre-query lookup and locks documents in an atomic Firestore transaction.
 */
export const verifyVisitCodeTransaction = async (
  venueId: string,
  visitCode: string
): Promise<{ success: boolean; message: string; reservationId?: string }> => {
  const reservationsCol = collection(db, 'reservations');
  const q = query(
    reservationsCol,
    where('venueId', '==', venueId),
    where('visitCode', '==', visitCode),
    where('status', '==', 'confirmed'),
    limit(1)
  );

  try {
    // 1. Fetch matching confirmed reservation ID before transaction boundaries
    const querySnap = await getDocs(q);
    if (querySnap.empty) {
      return { 
        success: false, 
        message: '유효한 예약 확인 코드가 아닙니다. (이미 사용되었거나 서면에 대기 세션이 없습니다)' 
      };
    }

    const matchedDoc = querySnap.docs[0];
    const resId = matchedDoc.id;
    const resData = matchedDoc.data() as Reservation;

    const resRef = doc(db, 'reservations', resId);
    const seatRef = doc(db, 'seats', resData.seatId);

    // 2. Perform transactional atomic update
    const result = await runTransaction(db, async (transaction) => {
      const activeResSnap = await transaction.get(resRef);
      if (!activeResSnap.exists()) {
        throw new Error('예약 내역이 데이터베이스에 존재하지 않습니다.');
      }

      const currentRes = activeResSnap.data() as Reservation;
      if (currentRes.status !== 'confirmed') {
        return { 
          success: false, 
          message: '이미 방문 처리가 끝났거나 취소된 예약입니다.' 
        };
      }

      const nowStr = new Date().toISOString();

      // Atomic Mutations:
      // A. Transition reservation status to 'visited' (occupied)
      transaction.update(resRef, {
        status: 'visited',
        visitedAt: nowStr,
        updatedAt: Timestamp.now()
      });

      // B. Transition associated seat status to 'occupied'
      transaction.update(seatRef, {
        status: 'occupied',
        lockedBy: null,
        lockedAt: null,
        lockExpiresAt: null,
        updatedAt: Timestamp.now()
      });

      return {
        success: true,
        message: `테이블 [${resData.seatLabel}] 체크인이 완료되었습니다! 테이블 상태가 '손님 이용 중'으로 변경되었습니다.`,
        reservationId: resId
      };
    });

    // Dispatch check-in event alerts
    if (result.success) {
      // A. Guest Toast Alert
      triggerNotification(
        resData.userId,
        '🍷 매장 입장 완료 (이용 중)',
        `[야키토리 시선 서면점] 체크인이 승인되었습니다. 테이블 [${resData.seatLabel}] 에서 편안한 시간 보내세요!`,
        '/profile'
      );
      // B. Owner Panel Alert
      triggerNotification(
        'demo-owner',
        '👤 고객 체크인 성공',
        `테이블 [${resData.seatLabel}] 예약 손님이 매장에 도착해 자리를 이용 중입니다.`,
        '/owner/dashboard'
      );
    }

    return result;

  } catch (error: unknown) {
    console.error('verifyVisitCodeTransaction failed:', error);
    const err = error as Error;
    return { 
      success: false, 
      message: err.message || '방문 확인 승인 진행 중 예상치 못한 오류가 발생했습니다.' 
    };
  }
};

/**
 * 3. Owner Action: Complete guest visit, checkout guest, and free up the seat.
 * Atomically transitions status inside a transaction to prevent race conditions.
 */
export const completeVisitTransaction = async (
  reservationId: string,
  seatId: string
): Promise<{ success: boolean; message: string }> => {
  const resRef = doc(db, 'reservations', reservationId);
  const seatRef = doc(db, 'seats', seatId);

  try {
    const result = await runTransaction(db, async (transaction) => {
      const resSnap = await transaction.get(resRef);
      if (!resSnap.exists()) {
        throw new Error('예약 내역을 찾을 수 없습니다.');
      }

      const resData = resSnap.data() as Reservation;
      if (resData.status !== 'visited') {
        return { success: false, message: '이용 중 상태인 예약 건만 퇴장 처리가 가능합니다.' };
      }

      const nowStr = new Date().toISOString();

      // Atomic Mutations:
      // A. Transition reservation status to 'completed'
      transaction.update(resRef, {
        status: 'completed',
        paymentStatus: 'completed',
        completedAt: nowStr,
        updatedAt: Timestamp.now()
      });

      // B. Revert seat status to 'available' and sever association pointers
      transaction.update(seatRef, {
        status: 'available',
        currentReservationId: null,
        lockedBy: null,
        lockedAt: null,
        lockExpiresAt: null,
        tag: null, // Clear recommendation tags
        updatedAt: Timestamp.now()
      });

      return {
        success: true,
        message: `테이블 [${resData.seatLabel}] 퇴장(방문완료) 처리가 정상적으로 승인되었습니다!`,
        userId: resData.userId,
        seatLabel: resData.seatLabel
      };
    });

    // Dispatch checkout completed greetings
    const completedResult = result as { success: boolean; message: string; userId?: string };
    if (completedResult.success && completedResult.userId) {
      triggerNotification(
        completedResult.userId,
        '✨ 테이블 이용 종료',
        `[야키토리 시선 서면점] 이용이 정상 종료되어 예약 보증금이 전액 환불/반환되었습니다. 즐거운 시간 되셨기를 바랍니다!`,
        '/'
      );
    }

    return result;

  } catch (error: unknown) {
    console.error('completeVisitTransaction failed:', error);
    const err = error as Error;
    return {
      success: false,
      message: err.message || '퇴장 처리 중 예상치 못한 오류가 발생했습니다.'
    };
  }
};

/**
 * 3. Owner Action: Automatically transition a reservation to 'noshow_expired' and free up the seat.
 * Atomically checks status before modifying to prevent race conditions.
 */
export const cancelReservationAsNoShow = async (
  reservationId: string,
  seatId: string
): Promise<void> => {
  const resRef = doc(db, 'reservations', reservationId);
  const seatRef = doc(db, 'seats', seatId);
  
  let targetUserId = '';
  let seatLabel = '';

  try {
    await runTransaction(db, async (transaction) => {
      const resSnap = await transaction.get(resRef);
      if (!resSnap.exists()) return;

      const resData = resSnap.data() as Reservation;
      if (resData.status !== 'confirmed') {
        // Already updated by another client or action!
        return;
      }
      
      targetUserId = resData.userId;
      seatLabel = resData.seatLabel;

      // Atomically update reservation to 'noshow_expired'
      transaction.update(resRef, {
        status: 'noshow_expired',
        paymentStatus: 'forfeited',
        updatedAt: Timestamp.now()
      });

      // Atomically release seat to available
      transaction.update(seatRef, {
        status: 'available',
        currentReservationId: null,
        lockedBy: null,
        lockedAt: null,
        lockExpiresAt: null,
        tag: null, // Clear recommendation tags
        updatedAt: Timestamp.now()
      });
    });

    // Alert Customer about No-Show Cancellation
    if (targetUserId) {
      triggerNotification(
        targetUserId,
        '❌ 노쇼 취소 마감 처리',
        `[야키토리 시선 서면점 ${seatLabel}] 예약 방문시간 30분 경과로 예약이 노쇼 자동 취소 처리되었습니다 (보증금 귀속).`,
        '/profile'
      );
      // Alert Owner
      triggerNotification(
        'demo-owner',
        '🚨 노쇼 좌석 자동 회수',
        `[${seatLabel}] 손님의 30분 미입장으로 노쇼 처리되어 좌석이 다시 빈자리로 전환되었습니다.`,
        '/owner/dashboard'
      );
    }

  } catch (error) {
    console.error(`cancelReservationAsNoShow failed for reservation ${reservationId}:`, error);
    throw error;
  }
};
