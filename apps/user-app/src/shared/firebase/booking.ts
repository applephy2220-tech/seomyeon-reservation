import { db } from './clientApp';
import { 
  runTransaction, 
  doc, 
  collection, 
  updateDoc, 
  Timestamp 
} from 'firebase/firestore';
import { Seat, Reservation, Deal } from '../types';

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
  dealId?: string | null
): Promise<{ success: boolean; reservationId?: string; message: string }> => {
  const seatRef = doc(db, 'seats', seatId);
  const reservationsCol = collection(db, 'reservations');
  const newReservationDocRef = doc(reservationsCol);
  const reservationId = newReservationDocRef.id;

  try {
    return await runTransaction(db, async (transaction) => {
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

      // Generate a 4-digit random visit verification code
      const visitCode = Math.floor(1000 + Math.random() * 9000).toString();
      
      // Visit details (defaulting today)
      const visitTime = now.toISOString();
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours expiry

      const reservationData: Reservation = {
        id: reservationId,
        userId,
        venueId,
        seatId,
        venueName,
        seatLabel,
        status: 'confirmed',
        visitTime,
        expiresAt,
        paymentAmount: 5000,
        visitCode,
        createdAt: Timestamp.now(),
        dealId: dealId || null
      };

      // B. Create the reservation record
      transaction.set(newReservationDocRef, reservationData);

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
  } catch (error: unknown) {
    console.error('confirmMockPaymentTransaction failed:', error);
    const err = error as Error;
    return { success: false, message: err.message || '결제 진행 중 오류가 발생했습니다.' };
  }
};
