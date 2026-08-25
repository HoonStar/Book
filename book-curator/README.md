# 완독 레이스 — 독서 취향 큐레이터

> 취향에 맞고 **끝까지 읽을 수 있는** 책 3권을 추천하고,
> 친구와 초대 코드로 레이스를 벌이되 **책 내용 퀴즈를 전부 맞혀야 진도가 인정**되는 소셜 독서 서비스.

포스코퓨처엠 바이브 코딩 경진대회 출품작 · 시나리오 12 「독서 취향 큐레이터」

## 핵심 설계 원칙 — "코드가 결정하고, LLM은 말한다"

| 기능 | 담당 |
|---|---|
| 장르·기분 매칭, 완독 기간 계산, 3권 확정, 퀴즈 채점, 진도 검증 | **코드** (결정론, `lib/engine.js`) |
| 한 줄 소개, 추천 이유, 연계 제안 문구 | **LLM** (`lib/llm.js`, gpt-4o-mini) |

- LLM이 채우는 필드는 문장 3종뿐 — 도서명·수치는 코드 값이 그대로 통과 → **환각을 자료구조로 차단**
- 응답 직전 코드가 재검증(목록 외 도서 언급·길이·필수 필드), 실패 시 템플릿 폴백
- 키가 없어도, LLM이 죽어도 서비스는 정상 동작 (`mode: "template"`)

## 기능

1. **추천** — 최근 읽은 책(자동완성)·선호 장르·기분·하루 독서 시간·속도·목표 기간 → 3권 + 한 줄 소개 + 추천 이유 + 예상 완독 D+일 + 점수 근거
2. **완독 레이스** — 초대 코드 6자리로 참여, 25/50/75/100% 체크포인트마다 **2문항 전부 정답이어야 도장**, 순서 건너뛰기 차단, 시도 횟수 기록, 응원 보내기
3. **서재** — 감상 노트를 색지+스티커로 꾸며 레이스 친구들과 공유
4. **나의 페이지** — 월간 완독 도장, LocalStorage 독서 기록, 취향 분석, 저장한 AI 추천, 프로필·개인화 설정

## 구조

```
index.html / app.js / style.css   정적 프런트엔드
api/
  recommend.js   추천 (코드 파이프라인 → LLM 카피)
  books.js       자동완성 검색 (BOOK_SOURCE로 외부 API 전환)
  health.js      배포 상태 점검(storage/llm/book_source)
  room.js        레이스 생성·참여·응원·노트
  quiz.js        퀴즈 제공(정답 미포함)·서버 채점
lib/
  engine.js      추천 엔진 + 퀴즈 채점 (LLM 무관, 순수 로직)
  catalog.js     도서 데이터 접근 계층 — 외부 API 연동 시 이 파일만 교체
  store.js       Supabase ↔ 메모리 자동 전환
  booksource.js  도서 소스 추상화 (local/kakao/aladin + 카탈로그 매칭)
  llm.js         OpenAI 호출 + 출력 검증 + 템플릿 폴백
  data/          books.json(115권)·quizzes.json(5권) — 큐레이션 카탈로그, DATA_GUIDE.md 참고
scripts/
  import-aladin.mjs   알라딘 API로 도서 수집 → books.json 병합용 (DATA_GUIDE 5장)
  import-books-json.mjs  프로젝트 루트 books.json을 앱 형식으로 변환·병합
  preflight.mjs       제출 전 점검: 데이터 무결성 + 시크릿 스캔 (npm run preflight)
design/
  stitch-brief.md     구글 스티치용 디자인 브리프
stitch_custom_web_design_and_functionality/  전달받은 Stitch 참고 시안과 나의 페이지 기획서
```

## 실행

```bash
npm install
npm test        # 자동 검증 32케이스
vercel dev      # 로컬 (키 없이도 동작: 메모리 저장 + 템플릿 문구)
```

배포는 `DEPLOY.md`, 실데이터 교체는 `DATA_GUIDE.md`, 도서 API 연동은 `API_INTEGRATION.md`, Stitch 디자인은 `design/STITCH_BRIEF.md` 참고.

환경변수: `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (모두 선택 — 없으면 폴백 모드). 기존 프로젝트는 `SUPABASE_SERVICE_ROLE_KEY`도 호환합니다.
