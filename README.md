# 🌊 부산 서면 실시간 빈자리 예약 플랫폼 MVP (User PWA & Owner Dashboard)

본 프로젝트는 부산 서면 구역 내 술집(이자카야, 감성포차, 수제맥주 등)의 실시간 좌석 현황을 모니터링하고 임시 선점/예약을 진행하는 **1차 사용자 PWA**와 업주가 실시간으로 좌석을 제어하고 고객 체크인을 도우는 **업주용 예약 관리 대시보드**가 통합된 실시간 예약 플랫폼 MVP입니다. 

Next.js 15와 Firebase Firestore/Auth를 결합하여 실제 동작 가능한 형태로 구현되었습니다.

---

## 🛠️ 기술 스택
* **Framework**: Next.js 15 (App Router, TypeScript)
* **Styling**: TailwindCSS v4 (Obsidian Dark Mode, Neon Points)
* **Real-time Database**: Firebase Firestore (`onSnapshot` 실시간 양방향 구독, `runTransaction` 원자적 선점 제어)
* **Authentication**: Firebase Auth (이메일 회원가입/로그인 및 데모 로그인 구조)
* **PWA**: Manifest.json & Custom Service Worker (모바일 인스톨 지원)

---

## 📂 프로젝트 구조
프로젝트는 재사용성과 독립성을 극대화하기 위해 멀티 앱 구조(Next.js App + Shared 모듈) 형태로 설계되었습니다.
```
seomyeon-reservation/
├── README.md                # 프로젝트 실행, 설정 및 Vercel 배포 가이드
├── apps/
│   └── user-app/            # Next.js 15 PWA 사용자 & 업주 프론트엔드
│       ├── public/          # PWA Manifest, Service Worker 및 PNG 아이콘
│       └── src/             # App Router (/page, /reservation, /owner/dashboard)
└── shared/                  # 앱 간 공유 가능한 리액트 공통 코어
    ├── components/          # 공통 UI (VenueCard, SeatCard, BottomNav 등)
    ├── firebase/            # Firebase SDK 초기화 및 트랜잭션 비즈니스 로직
    ├── hooks/               # 실시간 데이터 구독 커스텀 훅 (onSnapshot, 자가 치유)
    ├── types/               # TypeScript 인터페이스 선언 (타입 무오류 검증)
    └── utils/               # Firestore 시드 세팅 유틸리티
```

---

## ⚙️ Firebase 설정 및 환경변수 등록

동적 실시간 연동을 위해서는 본인의 Firebase 프로젝트 연결이 필요합니다.

### 1. Firebase 웹 앱 생성
1. [Firebase Console](https://console.firebase.google.com/)에 접속하여 신규 프로젝트를 생성합니다.
2. 프로젝트 대시보드에서 **웹 앱(Web App)**을 추가하고 구성 파일(config) 키값을 복사합니다.

### 2. 환경변수 파일 설정 (`.env.local`)
`apps/user-app/` 아래에 위치한 `.env.local` 파일을 열고 복사한 Firebase 설정을 입력합니다.
```env
NEXT_PUBLIC_FIREBASE_API_KEY=your-actual-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
```

---

## 🗄️ Firestore 컬렉션 및 데모 데이터 생성 방법

### 1. Firestore 데이터베이스 빌드
1. Firebase 콘솔 좌측 메뉴에서 **Firestore Database**를 클릭하고 데이터베이스를 생성합니다.
2. 보안 규칙(Rules) 탭으로 이동하여 테스트 기간 동안 쓰기/읽기가 가능하도록 설정합니다:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

### 2. 원클릭 데모 시드 데이터 로드 🌟
1. 로컬에서 실행 중인 앱의 로그인 포털(`http://localhost:3000/login`)로 이동합니다.
2. 테스트용 이메일과 비밀번호를 입력하여 가입/로그인합니다.
3. 로그인 완료 후 활성화되는 **[서면 술집 & 좌석 생성하기]** 버튼을 클릭하면, Firestore에 `/venues`, `/seats` 컬렉션이 즉시 생성되며 5개 대표 주점과 40여 개의 실시간 테이블 정보가 업로드됩니다.

---

## 🚀 로컬 실행 방법

### 1. 패키지 설치
`apps/user-app` 디렉토리로 이동한 뒤 필요한 패키지를 설치합니다.
```bash
cd apps/user-app
npm install
```

### 2. 로컬 실행
개발 서버를 기동하여 즉시 브라우저에서 화면을 확인할 수 있습니다.
```bash
npm run dev
```
기본 접속 주소: `http://localhost:3000`
업주 관리자 대시보드 주소: `http://localhost:3000/owner/dashboard`

---

## ☁️ Vercel 배포 방법 및 설정 가이드

### 1. Vercel 프로젝트 연동
1. [Vercel](https://vercel.com/) 계정에 가입하고 깃허브 저장소를 연동합니다.
2. **Add New > Project**를 누르고 본 프로젝트의 깃허브 리포지토리를 불러옵니다.

### 2. Vercel 모노레포 설정 (중요)
본 프로젝트는 모노레포 형태 구조이므로 다음 설정을 정확히 입력해야 빌드가 성공합니다.
* **Framework Preset**: `Next.js`
* **Root Directory**: `apps/user-app` 설정 (체크박스 활성화)
* **Build Command**: `next build` (기본값)
* **Output Directory**: `.next` (기본값)

### 3. Vercel 환경변수 (Environment Variables) 등록
Vercel 설정 탭의 **Environment Variables** 섹션에 아래 6가지 Firebase 연결 키값을 동일하게 등록해 줍니다.
* `NEXT_PUBLIC_FIREBASE_API_KEY`
* `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
* `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
* `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
* `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
* `NEXT_PUBLIC_FIREBASE_APP_ID`

---

## 🔒 Firebase 도메인 허용 설정 안내

Vercel에 배포된 도메인에서 Firebase Authentication(로그인 및 세션)이 차단 없이 원활히 작동하려면 **Firebase 승인된 도메인**에 배포된 Vercel 도메인을 추가해야 합니다.

1. **Firebase 콘솔** 접속 &rarr; 빌드 &rarr; **Authentication** 메뉴로 이동합니다.
2. **Settings** (설정) 탭을 클릭하고 좌측 메뉴의 **Authorized Domains** (승인된 도메인)을 선택합니다.
3. **Add domain** (도메인 추가) 버튼을 클릭합니다.
4. 본인의 Vercel 배포 도메인(예: `your-project.vercel.app`)을 입력하여 추가합니다.
   * *이 설정을 건너뛰면 실시간 로그인/가입 절차 진행 시 인증 도메인 오류가 발생할 수 있습니다.*

---

## 📋 Vercel 배포 전 최종 체크리스트

배포 전 로컬에서 완벽한 작동을 담보하기 위해 최종 점검해야 하는 체크리스트입니다.

- [ ] `apps/user-app` 폴더 내에서 `npm run build`를 실행했을 때 **`Compiled successfully`** 및 **`Linting and checking validity of types ...`** 정적 파일 생성이 에러 없이 완전 성공하는지 확인.
- [ ] 소스코드 내에 ESLint 규칙을 위배하는 불필요한 `as any` 임시 타입 캐스팅이 존재하지 않는지 점검. (오류 유발 차단 완료)
- [ ] `.env.local` 설정의 Firebase API Key가 실제 유효한 실시간 데이터베이스 키인지 확인.
- [ ] Vercel Root Directory 설정이 `apps/user-app`으로 바르게 세팅되었는지 확인.

---

## 🔗 배포 완료 후 필수 검증 URL 목록

배포가 정상적으로 완료되면 브라우저에서 아래의 모든 모바일/대시보드 페이지가 깨짐 없이 원활하게 구동 및 전환되는지 확인해야 합니다.

1. **`/` (실시간 빈자리 지도 홈)**: 배포 도메인 메인 홈으로 접속하여 옥상포차, 야키토리 등 실시간 좌석 카드 리스트와 잔여 좌석 개수가 정상 렌더링되는지 확인.
2. **`/login` (시딩 포털)**: 회원 로그인/가입 및 데이터베이스 원클릭 시드 생성이 작동하는지 확인.
3. **`/venue/[id]` (가게 실시간 상세판)**: 특정 가게를 클릭하여 실시간 좌석 배치판이 깨짐 없이 렌더링되는지 확인.
4. **`/reservation/[seatId]` (결제 선점 타이머 페이지)**: 빈자리를 예약하여 5분 타이머 프로그레스바 차감 및 간편 Mock 결제가 트랜잭션으로 체결되는지 확인.
5. **`/reservation-success` (Voucher 보증 티켓)**: 영수증 화면에 4자리 PIN 코드 및 Timestamp 파싱 날짜 에러 없이 영수증 카드가 생성되는지 확인.
6. **`/profile` (내 예약 목록)**: 하단 3번째 프로필 탭을 눌러 내가 예약한 활성 티켓 조회 및 즉시 취소가 연동되는지 확인.
7. **`/owner/dashboard` (실시간 업주 제어 대시보드)**: PC 또는 태블릿 환경에서 접속하여 가로 스크롤 가게 스위처, 퀵 좌석 제어(`열기`/`점유`/`마감`), numeric 핀코드 터치 키패드로 4자리 체크인 통과가 양방향 실시간 처리되는지 최종 확인.
