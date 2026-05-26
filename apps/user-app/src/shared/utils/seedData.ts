import { db } from '../firebase/clientApp';
import { collection, writeBatch, doc, getDocs, Timestamp } from 'firebase/firestore';
import { Venue, Seat, MenuItem } from '../types';

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

// Helper to generate mock menu structures dynamically
const getMockMenusForVenue = (venueName: string, venueId: string): Omit<MenuItem, 'id' | 'createdAt'>[] => {
  if (venueName.includes('옥상포차')) {
    return [
      {
        venueId,
        name: '🔥 모듬 조개탕',
        price: 24000,
        description: '당일 공수한 신선한 홍합, 가리비, 백합조개가 냄비 가득! 얼큰하고 시원한 국물이 일품인 감성 포차 1위 메뉴.',
        imageUrl: 'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?q=80&w=300&auto=format&fit=crop',
        category: '탕류',
        options: [
          { id: 'opt-1', name: '사리 추가', type: 'select', items: [{ name: '추가 없음', price: 0 }, { name: '우동사리 추가', price: 2000 }, { name: '칼국수사리 추가', price: 2000 }] },
          { id: 'opt-2', name: '맵기 강도', type: 'select', items: [{ name: '보통맛', price: 0 }, { name: '얼큰한 매운맛', price: 0 }, { name: '눈물 쏙 지옥맛', price: 500 }] }
        ],
        status: 'available',
        isPopular: true
      },
      {
        venueId,
        name: '꼬치 삼겹살 구이',
        price: 18000,
        description: '통삼겹살을 특제 갈릭 숯불 소스에 발라 대파와 함께 구워낸 풍미 가득한 모듬 꼬치 요리.',
        imageUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?q=80&w=300&auto=format&fit=crop',
        category: '안주류',
        options: [
          { id: 'opt-3', name: '토핑 토글', type: 'checkbox', items: [{ name: '마늘칩 솔솔 추가', price: 1000 }, { name: '구운 대파 추가', price: 500 }] }
        ],
        status: 'available',
        isPopular: false
      },
      {
        venueId,
        name: '톡톡 스파클링 별빛 청하',
        price: 6000,
        description: '청하에 화이트 와인과 탄산을 더해 달콤하고 가벼운 스파클링 전통주.',
        imageUrl: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?q=80&w=300&auto=format&fit=crop',
        category: '주류',
        options: [],
        status: 'available',
        isPopular: true
      }
    ];
  }
  if (venueName.includes('야키토리 시선')) {
    return [
      {
        venueId,
        name: '🍢 프리미엄 야키토리 7종',
        price: 21000,
        description: '참숯에서 노릇노릇 구워낸 닭다리살, 대파, 날개, 염통 등 엄선한 7가지 시그니처 숯불 야키토리.',
        imageUrl: 'https://images.unsplash.com/photo-1529042410759-befb1204b468?q=80&w=300&auto=format&fit=crop',
        category: '안주류',
        options: [
          { id: 'opt-4', name: '소스 선택', type: 'select', items: [{ name: '비법 타레(간장) 소스', price: 0 }, { name: '전통 히말라야 핑크소금 시오', price: 0 }] }
        ],
        status: 'available',
        isPopular: true
      },
      {
        venueId,
        name: '🔥 얼큰 차돌 라멘',
        price: 11000,
        description: '돈골 육수의 묵직함에 차돌박이의 고소함과 얼큰한 비법 다대기를 얹어 끓여낸 정통 해장 라멘.',
        imageUrl: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?q=80&w=300&auto=format&fit=crop',
        category: '탕류',
        options: [
          { id: 'opt-5', name: '토핑 추가', type: 'checkbox', items: [{ name: '부드러운 차슈 추가(2장)', price: 3000 }, { name: '반숙 아지타마고 추가', price: 1500 }] }
        ],
        status: 'available',
        isPopular: true
      },
      {
        venueId,
        name: '시그니처 하이볼',
        price: 8000,
        description: '산토리 위스키 베이스에 상큼한 레몬 슬라이스와 토닉워터를 최적의 비율로 믹싱한 베스트 음료.',
        imageUrl: 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?q=80&w=300&auto=format&fit=crop',
        category: '주류',
        options: [],
        status: 'available',
        isPopular: false
      }
    ];
  }
  if (venueName.includes('맥주창고')) {
    return [
      {
        venueId,
        name: '🍗 크리스피 버팔로 윙 & 칩스',
        price: 17000,
        description: '매콤짭짤한 버팔로 시즈닝을 입혀 바삭하게 튀겨낸 닭날개와 갈릭 포테이토 칩스.',
        imageUrl: 'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?q=80&w=300&auto=format&fit=crop',
        category: '안주류',
        options: [
          { id: 'opt-6', name: '디핑 소스 선택', type: 'select', items: [{ name: '스파이시 오리지널 버팔로 소스', price: 0 }, { name: '크리미 어니언 갈릭 소스', price: 0 }, { name: '소스 반반 제공', price: 500 }] }
        ],
        status: 'available',
        isPopular: true
      },
      {
        venueId,
        name: '바삭 고소 먹태 구이',
        price: 14500,
        description: '오븐에 구워내 비린내를 완전히 잡고 극상의 바삭함을 살려낸 황금빛 먹태포와 특제 소스.',
        imageUrl: 'https://images.unsplash.com/photo-1598515214211-89d3e73ae83b?q=80&w=300&auto=format&fit=crop',
        category: '안주류',
        options: [
          { id: 'opt-7', name: '소스 추가', type: 'checkbox', items: [{ name: '청양마요 간장소스 추가', price: 500 }] }
        ],
        status: 'available',
        isPopular: false
      },
      {
        venueId,
        name: '시트러스 IPA 수제맥주',
        price: 7000,
        description: '열대 과일의 화사한 홉 아로마와 부드러운 씁쓸함이 완벽하게 조화를 이루는 로컬 브루어리 대표 IPA.',
        imageUrl: 'https://images.unsplash.com/photo-1608270586620-248524c67de9?q=80&w=300&auto=format&fit=crop',
        category: '주류',
        options: [],
        status: 'available',
        isPopular: true
      }
    ];
  }
  if (venueName.includes('네온 시티')) {
    return [
      {
        venueId,
        name: '🍝 네온 로제 크림 파스타',
        price: 19000,
        description: '매콤하고 꾸덕한 시그니처 네온 핑크 로제 크림소스와 큼직한 칵테일 새우, 베이컨이 가득한 요리주점 1위 메뉴.',
        imageUrl: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?q=80&w=300&auto=format&fit=crop',
        category: '안주류',
        options: [
          { id: 'opt-8', name: '토핑 추가', type: 'checkbox', items: [{ name: '블랙타이거 쉬림프(4마리) 추가', price: 4000 }, { name: '훈제 베이컨 슬라이스 추가', price: 3000 }] }
        ],
        status: 'available',
        isPopular: true
      },
      {
        venueId,
        name: '🥖 마늘 감바스 알 아히요',
        price: 18000,
        description: '올리브유에 마늘 and 올리브, 새우를 듬뿍 넣고 끓여내어 바삭한 바게트 빵과 곁들여 먹는 지중해식 별미.',
        imageUrl: 'https://images.unsplash.com/photo-1543339494-b4cd4f7ba686?q=80&w=300&auto=format&fit=crop',
        category: '안주류',
        options: [
          { id: 'opt-9', name: '추가 사리', type: 'select', items: [{ name: '선택 안함', price: 0 }, { name: '바게트 빵 추가(4조각)', price: 2000 }, { name: '파스타 링귀니면 추가(조리 시)', price: 3000 }] }
        ],
        status: 'available',
        isPopular: false
      },
      {
        venueId,
        name: '🌌 사이버 블루 네온 칵테일',
        price: 9000,
        description: '푸른 우주의 신비로운 그라데이션 빛깔과 상큼한 레몬 버블 팝이 특징인 퓨전 알코올 라운지 드링크.',
        imageUrl: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?q=80&w=300&auto=format&fit=crop',
        category: '주류',
        options: [],
        status: 'available',
        isPopular: true
      }
    ];
  }
  // Default: 밀락오뎅
  return [
    {
      venueId,
      name: '🍢 모듬 명품 오뎅탕',
      price: 16000,
      description: '밀가루를 일절 넣지 않고 생선살 90% 이상으로 빚은 부산 수제 최고급 어묵들과 뜨끈한 가쓰오 국물 요리.',
      imageUrl: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?q=80&w=300&auto=format&fit=crop',
      category: '탕류',
      options: [
        { id: 'opt-10', name: '사리 사천오뎅', type: 'select', items: [{ name: '선택 안함', price: 0 }, { name: '조각 우동사리 추가', price: 2000 }, { name: '수제 곤약꼬치 추가(2개)', price: 2000 }] }
      ],
      status: 'available',
      isPopular: true
    },
    {
      venueId,
      name: '철판 오꼬노미야끼',
      price: 15000,
      description: '양배추와 삼겹살, 각종 해산물을 철판에 구워 데리야끼 소스와 가쓰오부시를 듬뿍 뿌린 일본 정통 길거리 대표 안주.',
      imageUrl: 'https://images.unsplash.com/photo-1626804475315-9644b37a2fe4?q=80&w=300&auto=format&fit=crop',
      category: '안주류',
      options: [
        { id: 'opt-11', name: '치즈 옵션', type: 'checkbox', items: [{ name: '고소한 모짜렐라 치즈 폭탄 추가', price: 2000 }] }
      ],
      status: 'available',
      isPopular: true
    },
    {
      venueId,
      name: '대포 정종 도쿠리',
      price: 7000,
      description: '오뎅과 함께 즐기면 몸을 따뜻하게 녹여주는 전통 일본식 데운 청주 한 잔(도쿠리 병 제공).',
      imageUrl: 'https://images.unsplash.com/photo-1609167921178-e28328f498c4?q=80&w=300&auto=format&fit=crop',
      category: '주류',
      options: [],
      status: 'available',
      isPopular: false
    }
  ];
};

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
    
    // Process Venues, associated Seats and Menus
    for (const vData of MOCK_VENUES) {
      // Create random doc ID for Venue
      const venueDocRef = doc(collection(db, 'venues'));
      const venueId = venueDocRef.id;
      
      batch.set(venueDocRef, {
        id: venueId,
        ...vData
      });

      // Seeding Signature Menus for this venue
      const signatureMenus = getMockMenusForVenue(vData.name, venueId);
      for (const mItem of signatureMenus) {
        const menuDocRef = doc(collection(db, 'menus'));
        batch.set(menuDocRef, {
          id: menuDocRef.id,
          ...mItem,
          createdAt: Timestamp.now()
        });
      }

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
    return { success: true, message: '서면 술집 5곳과 메뉴판, 실시간 좌석 데이터가 정상적으로 Firestore에 세팅되었습니다!' };
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error('Error seeding data:', error);
    return { success: false, message: `시딩 실패: ${err.message || error}` };
  }
};
