import { useState, useEffect } from 'react';
import { db } from '../firebase/clientApp';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Seat } from '../types';
import { releaseSeat } from '../firebase/booking';

interface UseRealtimeSeatsOptions {
  venueId?: string;
  onlyAvailable?: boolean;
}

export const useRealtimeSeats = (options: UseRealtimeSeatsOptions = {}) => {
  const [seats, setSeats] = useState<Seat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setLoading(true);
    const seatsCol = collection(db, 'seats');
    
    // Dynamically build firestore query constraints
    const constraints = [];
    if (options.venueId) {
      constraints.push(where('venueId', '==', options.venueId));
    }
    
    // Note: Instead of doing status == 'available' on the database level, 
    // we query all matching seats (or all seats for a venue) and filter locked/available on client side.
    // This allows active client subscriptions to automatically detect expired locked seats 
    // and trigger self-healing rollbacks!
    const q = constraints.length > 0 ? query(seatsCol, ...constraints) : query(seatsCol);

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const seatsData: Seat[] = [];
        const now = new Date();

        snapshot.forEach((docSnap) => {
          const seat = { id: docSnap.id, ...docSnap.data() } as Seat;
          
          // Self-Healing Calculation on Client Load:
          // If the seat is locked but its lockExpiresAt is in the past, treat it as available
          const isLockExpired = 
            seat.status === 'locked' && 
            seat.lockExpiresAt && 
            new Date(seat.lockExpiresAt).getTime() < now.getTime();
          
          if (isLockExpired) {
            seat.status = 'available';
            // Trigger an asynchronous background cleanup write to heal the DB state!
            releaseSeat(seat.id).catch(err => console.error('Background auto release failed:', err));
          }

          seatsData.push(seat);
        });

        // Filter based on options.onlyAvailable on the client-side
        let filteredSeats = seatsData;
        if (options.onlyAvailable) {
          filteredSeats = seatsData.filter(s => s.status === 'available');
        }
        
        // Sort seats by label to ensure a highly stable layout
        filteredSeats.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }));
        
        setSeats(filteredSeats);
        setLoading(false);
      },
      (err) => {
        console.error('Real-time seats subscription failed:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [options.venueId, options.onlyAvailable]);

  // Periodic interval client-side cleanup check (every 5 seconds) 
  // to ensure active countdown items trigger UI changes even if Firestore doesn't stream updates
  useEffect(() => {
    const timer = setInterval(() => {
      setSeats((prevSeats) => {
        const now = new Date();
        let changed = false;

        const updated = prevSeats.map((seat) => {
          const isLockExpired = 
            seat.status === 'locked' && 
            seat.lockExpiresAt && 
            new Date(seat.lockExpiresAt).getTime() < now.getTime();

          if (isLockExpired) {
            changed = true;
            // Revert status in local state first, and fire async cleanup
            releaseSeat(seat.id).catch(err => console.error('Interval auto release failed:', err));
            return { ...seat, status: 'available' as const };
          }
          return seat;
        });

        return changed ? updated : prevSeats;
      });
    }, 5000);

    return () => clearInterval(timer);
  }, []);

  return { seats, loading, error };
};
export default useRealtimeSeats;
