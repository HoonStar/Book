# 완독 레이스 — 독서 취향 큐레이터

카카오 도서 API에서 실제 책을 찾아 취향에 맞는 3권을 추천하고, 초대 코드로 친구와 독서 진도를 공유하는 웹 서비스입니다.

## 주요 기능

1. **카카오 도서 검색·추천** — 최근 읽은 책, 장르, 기분, 하루 독서 시간을 바탕으로 ISBN이 확인된 책 3권을 추천합니다.
2. **완독 레이스** — 카카오 도서를 선택해 방을 만들고 6자리 초대 코드로 참여합니다. 질문이나 퀴즈 없이 5% 단위로 현재 진도율을 직접 기록합니다.
3. **북클럽** — 레이스 멤버와 글·댓글·카카오 도서를 공유합니다.
4. **나의 페이지** — 독서 기록, 카카오 추천 저장 목록, 저장한 책 기반 취향 분석을 제공합니다.
5. **로그인** — Supabase Auth로 이메일 계정을 관리합니다.

## 도서 데이터 원칙

- 검색, 자동완성, 추천, 레이스 도서, 북클럽 공유, 독서 기록 검증은 모두 서버의 카카오 도서 API를 사용합니다.
- `KAKAO_REST_API_KEY`가 없거나 카카오 API 호출이 실패하면 로컬 목록으로 대체하지 않고 오류를 안내합니다.
- 저장소에 남아 있는 기존 도서 JSON 파일은 참고용 원본일 뿐 런타임에서 가져오거나 읽지 않습니다.
- 추천 이유 문구는 `OPENAI_API_KEY`가 있으면 LLM이 작성하고, 없으면 확인된 카카오 도서 정보로 안전한 기본 문구를 만듭니다.

## 구조

```text
index.html / app.js / style.css   프런트엔드
api/
  books.js       카카오 도서 검색·자동완성
  recommend.js   카카오 후보 검색 + 추천 문구 생성
  room.js        레이스 생성·참여·진도·응원·노트
  bookclub.js    북클럽 글·댓글·카카오 도서 공유
  auth.js        Supabase 이메일 인증
  health.js      배포 설정 상태 확인
lib/
  booksource.js      카카오 API 호출·응답 정규화
  recommendation.js 카카오 후보 선정
  llm.js             추천 문구 생성
  store.js           Supabase 저장 계층
scripts/preflight.mjs 배포 전 소스·시크릿 검사
```

## 실행과 검사

```powershell
npm install
npm test
npm run preflight
vercel dev
```

필수 서버 환경변수는 `KAKAO_REST_API_KEY`입니다. 영구 저장에는 `SUPABASE_URL`과 `SUPABASE_SECRET_KEY`가 필요하며, 추천 문구 고도화를 위한 `OPENAI_API_KEY`는 선택 사항입니다. 실제 키는 `.env` 또는 Vercel Environment Variables에만 넣고 Git에 커밋하지 않습니다.

배포 순서는 `DEPLOY.md`, 카카오 설정은 `API_INTEGRATION.md`, 기존 데이터 파일 취급은 `DATA_GUIDE.md`를 참고하세요.
