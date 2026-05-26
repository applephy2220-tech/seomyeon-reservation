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
  currentReservationId?: string | null; // ID of the confirmed reservation
  tag?: string; // Glowing recommendation tags
  activeDealId?: string | null; // Currently active linked deal ID
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  phoneNumber: string;
  createdAt: unknown;
  role?: 'user' | 'owner' | 'admin';
  status?: 'active' | 'pending' | 'approved' | 'rejected' | 'banned';
}

export interface Reservation {
  id: string;
  userId: string;
  venueId: string;
  seatId: string;
  venueName: string;
  seatLabel: string;
  status: 'confirmed' | 'used' | 'visited' | 'completed' | 'canceled' | 'noshow_expired';
  visitTime: string;
  expiresAt: string;
  paymentAmount: number;
  visitCode: string; // 4-digit random number (e.g. "8219")
  createdAt: unknown;
  dealId?: string | null; // Relational link to the applied deal
  visitedAt?: string;
  completedAt?: string;
  paymentStatus?: 'paid' | 'mock_paid' | 'refunded' | 'forfeited' | 'completed';
  paymentKey?: string;
  orderId?: string | null;
  preOrderId?: string | null;
  // 선주문/선결제 확장 필드
  orders?: OrderItem[];
  orderStatus?: 'pending' | 'preparing' | 'ready' | 'served' | 'none';
  eta?: string; // 예: "15분 뒤 도착"
  cookingStartedAt?: string;
  cookingDuration?: number; // 조리 예상 소요시간 (기본값 15분)
}

export interface Deal {
  id: string;
  venueId: string;
  seatId: string;
  title: string;
  description: string;
  benefitType: 'service' | 'discount' | 'time_limit';
  benefitValue: string;
  validUntil: string; // ISO Date String
  status: 'active' | 'expired' | 'cancelled' | 'sold_out';
  createdAt: unknown; // Firestore Timestamp or ISO String
  totalSlots: number;
  usedSlots: number;
  remainingSlots: number;
  linkedSeatIds?: string[];
  clicks?: number; // Cumulative campaign view counts (mockable)
}

// ==========================================
// 선주문 / 선결제 / 메뉴 아키텍처 타입
// ==========================================
export interface MenuOptionItem {
  name: string;
  price: number;
}

export interface MenuOption {
  id: string;
  name: string;
  type: 'select' | 'checkbox';
  items: MenuOptionItem[];
  required?: boolean;
}

export interface MenuItem {
  id: string;
  venueId: string;
  name: string;
  price: number;
  description: string;
  imageUrl: string;
  category: string; // 예: 안주류, 탕류, 주류 등
  options: MenuOption[];
  status: 'available' | 'sold_out';
  isPopular: boolean;
  createdAt: unknown;
}

export interface SelectedOption {
  optionName: string;
  itemName: string;
  price: number;
}

export interface OrderItem {
  menuId: string;
  name: string;
  price: number; // 기본단가 + 옵션 합산
  quantity: number;
  selectedOptions: SelectedOption[];
}

export interface AiRecommendation {
  id: string;
  type: 'deal_trigger' | 'cooking_timing' | 'no_show_warning' | 'turnover_insight' | 'bestseller_recommendation';
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  actionLabel?: string;
  actionPayload?: unknown; // Config parameters for quick execution (e.g., deal preset params)
  createdAt: unknown;
}

export interface VenueStats {
  venueId: string;
  averageTurnoverRate: number; // in turns/seat/day
  noShowProbability: number;   // 0.0 to 1.0
  optimalPrepMinutes: number;   // average cooking duration based on traffic
  peakHours: string[];
  lastCalculatedAt: unknown;
}
