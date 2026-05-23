import { useState, useEffect } from 'react';
import { db } from '../firebase/clientApp';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { Venue } from '../types';

export const useRealtimeVenues = () => {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const venuesCol = collection(db, 'venues');
    
    const unsubscribe = onSnapshot(
      venuesCol,
      (snapshot) => {
        const venuesData: Venue[] = [];
        snapshot.forEach((docSnap) => {
          venuesData.push({ id: docSnap.id, ...docSnap.data() } as Venue);
        });
        setVenues(venuesData);
        setLoading(false);
      },
      (err) => {
        console.error('Real-time venues subscription failed:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return { venues, loading, error };
};

export const useRealtimeVenueDetail = (venueId: string) => {
  const [venue, setVenue] = useState<Venue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!venueId) return;

    const venueRef = doc(db, 'venues', venueId);
    
    const unsubscribe = onSnapshot(
      venueRef,
      (docSnap) => {
        if (docSnap.exists()) {
          setVenue({ id: docSnap.id, ...docSnap.data() } as Venue);
        } else {
          setVenue(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error(`Real-time venue detail ${venueId} subscription failed:`, err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [venueId]);

  return { venue, loading, error };
};
