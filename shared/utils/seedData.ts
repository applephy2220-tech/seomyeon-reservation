import { db } from '../firebase/clientApp';
import { collection, writeBatch, doc, getDocs, Timestamp } from 'firebase/firestore';
import { Venue, Seat } from '../types';

// Mock list of highly stylized, modern Seomyeon pubs and lounges
const MOCK_VENUES: Omit<Venue, 'id'>[] = [
  {
    name: '옥상포차 서면본점',
    category: '감성포차',
    description: '서면 전포사잇길 최고의 전망을 자랑하는 루프탑 감성 포차. 신선한 모듬 해산물과 얼큰한 나가사키 짬뽕이 시그니처입니다.',
    imageUrl: 'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?q=80&w=600&auto=format&fit=crop',
    address: '부산 부산진구 동천로 85 4층',
    rating: 4.8,
    totalSeatsCount: 8,
  },
  {
    name: '야키토리 시선 서면점',
    category: '이자카야',
    description: '전통 참숯으로 구워내는 프리미엄 야키토리 전문점. 일본 현지 느낌의 따뜻한 조명과 프라이빗한 좌석을 제공합니다.',
    imageUrl: 'https://images.unsplash.com/photo-1563245372-f21724e3856d?q=80&w=600&auto=format&fit=crop',
    address: '부산 부산진구 중앙대로680번가길 38',
    rating: 4.9,
    totalSeatsCount: 6,
  },
  {
    name: '만취길 맥주창고',
    category: '수제맥주',
    description: '전 세계 크래프트 맥주와 빈티지 락 감성이 결합된 힙한 공간. 대형 스크린으로 스포츠 중계와 실시간 음악 신청이 가능합니다.',
    imageUrl: 'https://images.unsplash.com/photo-1571613316887-6f8d5cbf7ef7?q=80&w=600&auto=format&fit=crop',
    address: '부산 부산진구 서전로10번길 21',
    rating: 4.6,
    totalSeatsCount: 10,
  },
  {
    name: '네온 시티 라운지',
    category: '요리주점',
    description: '서면 중심가에서 즐기는 사이버펑크 감성의 다이닝 바. 독창적인 칵테일과 퓨전 안주, 화려한 미디어아트 월이 특징입니다.',
    imageUrl: 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?q=80&w=600&auto=format&fit=crop',
    address: '부산 부산진구 신천대로62번길 42',
    rating: 4.7,
    totalSeatsCount: 8,
  },
  {
    name: '밀락오뎅 서면점',
    category: '이자카야',
    description: '추운 겨울날 뜨끈한 국물에 정종 한 잔을 기울일 수 있는 조용한 심야 오뎅바. 바(Bar) 형태의 연인석 위주 좌석 구조.',
    imageUrl: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?q=80&w=600&auto=format&fit=crop',
    address: '부산 부산진구 중앙대로692번길 16',
    rating: 4.5,
    totalSeatsCount: 6,
  }
];

// Helper to calculate availableUntil offset in minutes
const getFutureTimeString = (offsetMinutes: number): string => {
  const date = new Date();
  date.setMinutes(date.getMinutes() + offsetMinutes);
  return date.toISOString();
};

export const seedFirestoreData = async (): Promise<{ success: boolean; message: string }> => {
  try {
    // 1. Prevent duplicate seed check
    const venuesCol = collection(db, 'venues');
    const existingSnap = await getDocs(venuesCol);
    if (!existingSnap.empty) {
      return { success: false, message: '데이터베이스가 이미 세팅되어 있어 중복 시딩을 건너뛰었습니다.' };
    }

    const batch = writeBatch(db);
    
    // Process Venues and associated Seats
    for (const vData of MOCK_VENUES) {
      // Create random doc ID for Venue
      const venueDocRef = doc(collection(db, 'venues'));
      const venueId = venueDocRef.id;
      
      batch.set(venueDocRef, {
        id: venueId,
        ...vData
      });

      // Generate realistic seats for this venue
      const seatCount = vData.totalSeatsCount;
      const seatLabels = ['창가', '홀', '테라스', '단체석', '연인바'];
      
      for (let i = 1; i <= seatCount; i++) {
        const seatDocRef = doc(collection(db, 'seats'));
        
        // Distribute statuses: mostly occupied, closed, or locked, with 2-3 available per venue
        let status: Seat['status'] = 'occupied';
        let availableUntil = getFutureTimeString(0);
        
        if (i === 1 || i === 3) {
          status = 'available';
          availableUntil = getFutureTimeString(120 + Math.floor(Math.random() * 180)); // 2-5 hours available
        } else if (i === 2) {
          status = 'locked'; // Temporarily locked during reservation click flow
          availableUntil = getFutureTimeString(10);
        } else if (i === 5) {
          status = 'reserved';
        } else if (i === 6) {
          status = 'closed';
        }

        const labelCategory = seatLabels[i % seatLabels.length];
        const capacity = labelCategory === '단체석' ? 6 : labelCategory === '연인바' ? 2 : (2 + Math.floor(Math.random() * 3));

        const seatData: Omit<Seat, 'id'> = {
          venueId,
          label: `${labelCategory} ${String(i).padStart(2, '0')}`,
          capacity,
          status,
          availableUntil,
          updatedAt: Timestamp.now()
        };

        batch.set(seatDocRef, {
          id: seatDocRef.id,
          ...seatData
        });
      }
    }

    await batch.commit();
    return { success: true, message: '서면 술집 5곳과 실시간 좌석 데이터가 정상적으로 Firestore에 세팅되었습니다!' };
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error('Error seeding data:', error);
    return { success: false, message: `시딩 실패: ${err.message || error}` };
  }
};
