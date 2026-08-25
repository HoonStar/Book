# 배포 가이드 — Vercel + Supabase + 카카오

## 1. 키 보안

- 실제 키는 로컬 `.env`와 Vercel Environment Variables에만 저장합니다.
- `.env`, `password.txt`는 `.gitignore`에 포함되어야 합니다.
- 키를 채팅·문서·코드에 공개했다면 해당 서비스에서 폐기하고 새 키를 발급합니다.
- 커밋 전 `npm run preflight`를 실행합니다.

## 2. Supabase

1. Supabase 프로젝트의 SQL Editor를 엽니다.
2. `supabase_setup.sql` 내용을 붙여넣고 Run을 누릅니다.
3. Project URL과 서버용 Secret key를 확인합니다.
4. Vercel 환경변수에 등록합니다.

   | 이름 | 값 |
   |---|---|
   | `SUPABASE_URL` | Supabase Project URL |
   | `SUPABASE_SECRET_KEY` | `sb_secret_...` 서버 키 |

브라우저는 DB에 직접 접근하지 않으며 Vercel 서버 함수만 서버 키를 사용합니다. 기존 프로젝트에서는 `SUPABASE_SERVICE_ROLE_KEY`도 호환됩니다.

## 3. 카카오 도서 API

Kakao Developers에서 확인한 REST API 키를 Vercel에 등록합니다.

| 이름 | 값 |
|---|---|
| `KAKAO_REST_API_KEY` | 카카오 애플리케이션의 REST API 키 |

이 값은 모든 도서 검색·추천·레이스·북클럽 기능에 필수입니다. 추가한 뒤 Production과 Preview를 선택하고 새로 배포합니다.

## 4. 선택 환경변수

| 이름 | 용도 |
|---|---|
| `OPENAI_API_KEY` | 추천 이유 문구 생성. 없어도 기본 문구로 동작 |

## 5. 자동 배포

GitHub 저장소의 배포 브랜치에 push하면 연결된 Vercel 프로젝트가 자동 배포됩니다. Framework Preset은 `Other`를 사용하며 별도 빌드 명령은 필요하지 않습니다.

## 6. 배포 확인 체크리스트

- [ ] `/api/health`에서 `storage: "supabase"`, `book_source: "kakao"`, `kakao_key: "configured"` 확인
- [ ] 책 자동완성에 카카오 표지·저자 표시
- [ ] 추천 결과 3권과 출판사 표시
- [ ] ISBN이 확인된 추천 도서로 레이스 생성 후 6자리 초대 코드 발급
- [ ] 다른 기기에서 초대 코드로 참여
- [ ] 질문 없이 슬라이더로 진도율 저장
- [ ] 북클럽에서 검색한 카카오 도서 공유
- [ ] 글·댓글·노트가 다른 기기에서도 표시

## 로컬 실행

```powershell
npm install
npm test
npm run preflight
vercel dev
```

`.env.example`을 `.env`로 복사해 값을 채웁니다. 카카오 키가 없으면 도서 기능은 로컬 목록으로 대체되지 않고 설정 오류를 안내합니다.
