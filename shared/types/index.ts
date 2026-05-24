// Shared Domain Type Declarations

export type SeatStatus = 'available' | 'locked' | 'reserved' | 'occupied' | 'closed';

export interface Venue {
  id: string;
  name: string;
  category: string;
  description: string;
  imageUrl: string;
  address: string;
  rating: number;
  totalSeatsCount: number;
}

export interface Seat {
  id: string;
  venueId: string;
  label: string;
  capacity: number;
  status: SeatStatus;
  availableUntil: string; // ISO String representation of the available time limit
  updatedAt: unknown; // Firestore Timestamp or string
  lockedAt?: string; // ISO String when the seat was locked
  lockExpiresAt?: string; // ISO String when the lock expires (lockedAt + 5 min)
  lockedBy?: string; // UID of the user who locked it
  currentReservationId?: string; // ID of the confirmed reservation
  tag?: string; // Glowing recommendation tags
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  phoneNumber: string;
  createdAt: unknown;
}

export interface Reservation {
  id: string;
  userId: string;
  venueId: string;
  seatId: string;
  venueName: string;
  seatLabel: string;
  status: 'confirmed' | 'used' | 'canceled' | 'noshow_expired';
  visitTime: string;
  expiresAt: string;
  paymentAmount: number;
  visitCode: string; // 4-digit random number (e.g. "8219")
  createdAt: unknown;
}
