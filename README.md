# 조경회사 통합 경영관리 시스템 (Landscaping ERP)

조경 회사를 위한 통합 경영관리 시스템입니다.
현장관리, 원가관리, 수금관리, 세금계산서, 근태/급여, 하자관리 등 모든 업무를 한 곳에서 관리합니다.

## 주요 기능

- **대시보드**: 월별 매출/원가/이익 요약, 손익 추이, 예산 집행률, 미수금/하자 알림
- **현장관리**: 공사 현장 등록, 계약 관리, 예산 대비 현황
- **일일업무일지**: 카카오톡 AI 파싱, 투입 인력/장비 기록
- **원가관리**: 투입인원/장비 현황, 매입자료 관리, 단가표
- **세금계산서**: 매출/매입 계산서 관리, 월별 현황
- **수금관리**: 기성청구, 수금현황, 미수금 에이징 분석
- **손익보고서**: 현장별 손익, 월별 추이, Excel/PDF 내보내기
- **근태/급여**: 직원 등록, 출퇴근 관리, 급여 자동계산 (4대보험 공제)
- **하자관리**: 하자 접수/처리, 기한 관리, 현장별 통계
- **설정**: 거래처 관리, 단가표 편집

## 기술 스택

- **백엔드**: Node.js + Express + PostgreSQL (Supabase)
- **프론트엔드**: React 18 + Vite + Tailwind CSS + Recharts
- **AI**: Claude API (claude-sonnet-4-20250514) - 카카오톡 파싱
- **배포**: Render (백엔드) + Vercel (프론트엔드)
- **PDF**: jsPDF + jsPDF-AutoTable
- **Excel**: SheetJS (xlsx)

---

## 온라인 배포 가이드

### 1단계: Supabase 프로젝트 생성 (데이터베이스)

1. [https://supabase.com](https://supabase.com) 에서 회원가입 / 로그인
2. **New Project** 클릭
3. 프로젝트 이름 입력 (예: `landscaping-erp`)
4. 데이터베이스 비밀번호 설정 (기억해 두세요)
5. 리전 선택: **Northeast Asia (Seoul)** 권장
6. **Create new project** 클릭 후 생성 완료 대기 (약 1~2분)

7. **Database URL 확인:**
   - 좌측 메뉴 → **Project Settings** → **Database**
   - **Connection string** 탭 → **URI** 복사
   - 형식: `postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres`
   - `[YOUR-PASSWORD]` 부분을 설정한 비밀번호로 교체

> 테이블은 백엔드 서버가 처음 시작될 때 자동으로 생성됩니다.

---

### 2단계: Render 백엔드 배포

1. [https://render.com](https://render.com) 에서 회원가입 / 로그인 (GitHub 연동 권장)
2. 프로젝트를 GitHub에 push
3. Render 대시보드 → **New +** → **Web Service**
4. GitHub 저장소 연결
5. 다음 설정 입력:

   | 항목 | 값 |
   |------|-----|
   | Name | `landscaping-erp-backend` |
   | Root Directory | `backend` |
   | Runtime | `Node` |
   | Build Command | `npm install` |
   | Start Command | `npm start` |

6. **Environment Variables** 섹션에서 다음 환경변수 추가:

   | Key | Value |
   |-----|-------|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | Supabase에서 복사한 Connection string |
   | `ANTHROPIC_API_KEY` | Anthropic API 키 |
   | `ALLOWED_ORIGINS` | Vercel 배포 후 프론트엔드 URL (예: `https://your-app.vercel.app`) |

7. **Create Web Service** 클릭
8. 배포 완료 후 서비스 URL 확인 (예: `https://landscaping-erp-backend.onrender.com`)

> Render 무료 플랜은 15분 비활성 시 슬립 상태로 전환됩니다. 유료 플랜($7/월)을 사용하면 항상 활성 상태를 유지합니다.

---

### 3단계: Vercel 프론트엔드 배포

1. [https://vercel.com](https://vercel.com) 에서 회원가입 / 로그인 (GitHub 연동 권장)
2. **New Project** → GitHub 저장소 선택
3. 다음 설정 입력:

   | 항목 | 값 |
   |------|-----|
   | Root Directory | `frontend` |
   | Framework Preset | `Vite` |
   | Build Command | `npm run build` |
   | Output Directory | `dist` |

4. **Environment Variables** 섹션에서 다음 환경변수 추가:

   | Key | Value |
   |-----|-------|
   | `VITE_API_URL` | Render 백엔드 URL (예: `https://landscaping-erp-backend.onrender.com`) |

5. **Deploy** 클릭
6. 배포 완료 후 프론트엔드 URL 확인 (예: `https://landscaping-erp.vercel.app`)

---

### 4단계: CORS 설정 업데이트

Vercel 배포 URL이 확정되면 Render 백엔드의 `ALLOWED_ORIGINS` 환경변수를 업데이트:

```
ALLOWED_ORIGINS=https://landscaping-erp.vercel.app
```

여러 도메인을 허용할 경우 쉼표로 구분:
```
ALLOWED_ORIGINS=https://landscaping-erp.vercel.app,https://custom-domain.com
```

---

## 로컬 개발 환경 설정

### 사전 요구사항
- Node.js 18 이상
- npm

### 백엔드 설정

```bash
cd backend
npm install

# 환경변수 설정
copy .env.example .env
# .env 파일을 열어 DATABASE_URL, ANTHROPIC_API_KEY 설정

npm run dev
```

백엔드: `http://localhost:3001`

### 프론트엔드 설정

```bash
cd frontend
npm install

# 환경변수 설정
copy .env.example .env
# .env의 VITE_API_URL 확인 (기본값: http://localhost:3001)

npm run dev
```

프론트엔드: `http://localhost:5173`

---

## 환경변수 정리

### 백엔드 (backend/.env)

| 변수 | 설명 | 예시 |
|------|------|------|
| `PORT` | 서버 포트 | `3001` |
| `NODE_ENV` | 실행 환경 | `development` / `production` |
| `DATABASE_URL` | PostgreSQL 연결 문자열 | `postgresql://postgres:...` |
| `ANTHROPIC_API_KEY` | Claude AI API 키 | `sk-ant-...` |
| `ALLOWED_ORIGINS` | CORS 허용 출처 (쉼표 구분) | `https://app.vercel.app` |

### 프론트엔드 (frontend/.env)

| 변수 | 설명 | 예시 |
|------|------|------|
| `VITE_API_URL` | 백엔드 API URL (개발 시 프록시 대상) | `http://localhost:3001` |

---

## API 엔드포인트

| 경로 | 설명 |
|------|------|
| `GET /api/dashboard` | 대시보드 요약 데이터 |
| `/api/projects` | 현장 CRUD |
| `/api/dailylogs` | 일지 CRUD + AI 파싱 |
| `/api/vendors` | 거래처 CRUD |
| `/api/purchases` | 매입 CRUD |
| `/api/taxinvoices` | 세금계산서 CRUD |
| `/api/progressbills` | 기성청구 CRUD |
| `/api/payments` | 수금 CRUD + 미수금 분석 |
| `/api/employees` | 직원 CRUD |
| `/api/attendance` | 출결 CRUD |
| `/api/salary` | 급여 계산/관리 |
| `/api/defects` | 하자 CRUD + 통계 |
| `/api/unitprices` | 단가표 CRUD |

---

## 카카오톡 AI 파싱 사용법

1. 일일업무일지 페이지 접속
2. "+" 버튼으로 일지 작성 클릭
3. 카카오톡 현장 메시지를 텍스트 영역에 붙여넣기
4. "AI 파싱" 버튼 클릭
5. 파싱된 결과 확인 후 수정
6. 저장

예시 카카오톡 메시지:
```
2024.03.15 맑음
한강공원 조경공사 현장
조경공 3명, 인부 2명 투입
굴삭기06 1대 투입
화단 식재 및 잔디 식재 작업 완료
```

---

## 기본 단가표

### 인력 (원/일)
| 직종 | 단가 |
|------|------|
| 인부 | 150,000 |
| 조경공 | 200,000 |
| 조경기능사 | 230,000 |
| 굴삭기기사 | 250,000 |
| 신호수 | 140,000 |
| 시설원 | 160,000 |
| 반장 | 220,000 |

### 장비 (원/일)
| 장비 | 단가 |
|------|------|
| 굴삭기03 | 400,000 |
| 굴삭기06 | 550,000 |
| 굴삭기20 | 700,000 |
| 스카이차 | 350,000 |
| 트럭1톤 | 150,000 |
| 트럭5톤 | 280,000 |
| 살수차 | 250,000 |
| 고소작업차 | 400,000 |

## 라이선스

MIT License
