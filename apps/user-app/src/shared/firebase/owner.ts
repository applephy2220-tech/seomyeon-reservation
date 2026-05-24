import { db } from './clientApp';
import { 
  doc, 
  updateDoc, 
  Timestamp, 
  runTransaction, 
  collection, 
  query, 
  where, 
  getDocs, 
  limit 
} from 'firebase/firestore';
import { SeatStatus, Reservation } from '../types';

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
    }

    await updateDoc(seatRef, updateData);
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
    return await runTransaction(db, async (transaction) => {
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

      // Atomic Mutations:
      // A. Transition reservation status to 'used'
      transaction.update(resRef, {
        status: 'used',
        updatedAt: Timestamp.now()
      });

      // B. Revert associated seat status back to 'available' and sever reference pointers
      transaction.update(seatRef, {
        status: 'available',
        currentReservationId: null,
        lockedBy: null,
        lockedAt: null,
        lockExpiresAt: null,
        updatedAt: Timestamp.now()
      });

      return {
        success: true,
        message: `테이블 [${resData.seatLabel}] 체크인이 승인되었습니다! 즉시 좌석이 해제되어 이용 가능 상태로 개방됩니다.`,
        reservationId: resId
      };
    });
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
 * 3. Owner Action: Automatically transition a reservation to 'noshow_expired' and free up the seat.
 * Atomically checks status before modifying to prevent race conditions.
 */
export const cancelReservationAsNoShow = async (
  reservationId: string,
  seatId: string
): Promise<void> => {
  const resRef = doc(db, 'reservations', reservationId);
  const seatRef = doc(db, 'seats', seatId);

  try {
    await runTransaction(db, async (transaction) => {
      const resSnap = await transaction.get(resRef);
      if (!resSnap.exists()) return;

      const resData = resSnap.data() as Reservation;
      if (resData.status !== 'confirmed') {
        // Already updated by another client or action!
        return;
      }

      // Atomically update reservation to 'noshow_expired'
      transaction.update(resRef, {
        status: 'noshow_expired',
        updatedAt: Timestamp.now()
      });

      // Revert associated seat to available
      transaction.update(seatRef, {
        status: 'available',
        currentReservationId: null,
        lockedBy: null,
        lockedAt: null,
        lockExpiresAt: null,
        updatedAt: Timestamp.now()
      });
    });
    console.log(`Reservation ${reservationId} successfully canceled as no-show.`);
  } catch (error) {
    console.error(`cancelReservationAsNoShow failed for reservation ${reservationId}:`, error);
    throw error;
  }
};

