import { useState, useEffect, useRef } from 'react';
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

  // Destructure primitives to keep dependency checks stable and clean
  const { venueId, onlyAvailable } = options;

  useEffect(() => {
    setLoading(true);
    const seatsCol = collection(db, 'seats');
    
    // Dynamically build firestore query constraints
    const constraints = [];
    if (venueId) {
      constraints.push(where('venueId', '==', venueId));
    }
    
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

        // Filter based on onlyAvailable on the client-side
        let filteredSeats = seatsData;
        if (onlyAvailable) {
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
  }, [venueId, onlyAvailable]);

  // Keep a mutable ref to the latest seats so our interval can check expiration
  // without re-creating the interval when seats state updates.
  const seatsRef = useRef<Seat[]>(seats);
  useEffect(() => {
    seatsRef.current = seats;
  }, [seats]);

  // Keep track of locked seats currently in the process of being released
  const releasingSeatIdsRef = useRef<Set<string>>(new Set());

  // Periodic interval client-side cleanup check (every 5 seconds) 
  // to ensure active countdown items trigger UI changes even if Firestore doesn't stream updates
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const currentSeats = seatsRef.current;

      currentSeats.forEach((seat) => {
        const isLockExpired = 
          seat.status === 'locked' && 
          seat.lockExpiresAt && 
          new Date(seat.lockExpiresAt).getTime() < now.getTime();

        if (isLockExpired) {
          // If already releasing, skip to avoid duplicate database requests
          if (releasingSeatIdsRef.current.has(seat.id)) return;

          console.log(`Self-healing lock check: Seat ${seat.id} is expired. Releasing...`);
          releasingSeatIdsRef.current.add(seat.id);

          // Decouple side effects from React render/state updater loop!
          // releaseSeat will write to Firestore, which naturally triggers onSnapshot and updates the state.
          releaseSeat(seat.id)
            .then(() => {
              // Successfully updated, clean up ref
              releasingSeatIdsRef.current.delete(seat.id);
            })
            .catch((err) => {
              console.error('Interval auto release failed:', err);
              releasingSeatIdsRef.current.delete(seat.id);
            });
        }
      });
    }, 5000);

    return () => clearInterval(timer);
  }, []);

  return { seats, loading, error };
};

export default useRealtimeSeats;
