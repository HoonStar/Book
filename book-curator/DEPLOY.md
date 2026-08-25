# 배포 가이드 (Vercel + Supabase)

허니스낵 때와 같은 조합입니다. 순서대로 따라 하면 배포 URL까지 15~20분.

## 0. ⚠️ API 키 보안 규칙 (반드시 먼저)

1. **채팅·문서·코드에 키를 붙여넣었다면 그 키는 노출된 것입니다.**
   → platform.openai.com → API keys → 해당 키 **Revoke(폐기)** → 새 키 발급.
2. 키는 오직 두 곳에만 존재해야 합니다: **내 로컬 `.env` 파일**(git 제외됨)과 **Vercel 환경변수**.
3. 이 저장소의 `.gitignore`가 `.env`를 이미 제외하고 있습니다. `git status`에 `.env`가 보이면 커밋 금지.
4. 경진대회에 코드를 제출하기 전, 아래를 실행해 키가 없는지 최종 확인:
   ```powershell
   Select-String -Path .\* -Pattern "sk-" -Recurse -Exclude node_modules
   ```
   결과가 `.env.example`의 안내 문구뿐이어야 정상입니다.

## 1. Supabase (영구 저장소)

1. supabase.com → New project 생성 (리전: Northeast Asia 권장)
2. SQL Editor → 이 저장소의 `supabase_setup.sql` 내용 붙여넣기 → **Run**
3. 프로젝트 화면의 **Connect** 또는 Settings → API Keys에서 두 값을 복사해 둡니다:
   - `Project URL` → `SUPABASE_URL`
   - `Secret key`(`sb_secret_...`) → `SUPABASE_SECRET_KEY`

> Secret key는 OpenAI 키와 동일한 보안 규칙을 적용하세요. 서버(Vercel 함수)에서만 사용되며, 프런트엔드 코드에는 절대 들어가지 않습니다. 기존 Supabase 프로젝트에서 Secret key를 만들 수 없다면 legacy `service_role` 키를 `SUPABASE_SERVICE_ROLE_KEY` 이름으로 등록해도 됩니다.

## 2. GitHub에 올리기

```powershell
cd book-curator
git init
git add .
git commit -m "완독 레이스 v1.0"
# GitHub에서 빈 저장소(private 권장) 만든 뒤:
git remote add origin https://github.com/<아이디>/book-curator.git
git push -u origin main
```

## 3. Vercel 배포

1. vercel.com → **Add New → Project** → 방금 올린 저장소 Import
2. Framework Preset: **Other** (그대로 두면 됨)
3. **Environment Variables**에 3개 등록:

   | Name | Value |
   |---|---|
   | `OPENAI_API_KEY` | 새로 발급한 키 |
   | `SUPABASE_URL` | 1-3에서 복사한 URL |
   | `SUPABASE_SECRET_KEY` | 1-3에서 복사한 `sb_secret_...` 키 |

   (선택 — 도서 API 연동 시, API_INTEGRATION.md 참고)

   | `BOOK_SOURCE` | `kakao` 또는 `aladin` |
   | `KAKAO_REST_API_KEY` / `ALADIN_TTB_KEY` | 발급받은 키 |

4. **Deploy** → 완료되면 `https://book-curator-xxx.vercel.app` 형태의 URL이 나옵니다. 이것이 제출용 배포 URL.

## 4. 배포 확인 체크리스트

- [ ] `https://배포주소/api/health` 접속 → `{"ok":true,"storage":"supabase","llm":"live",...}` 확인 (여기서 memory/template가 보이면 환경변수 누락)
- [ ] 추천 탭에서 3권이 나오고, 문구 아래 "기본 문구 모드" 안내가 **없음** (= OpenAI 연동 성공)
- [ ] 레이스 생성 → 초대 코드 발급
- [ ] 휴대폰 등 **다른 기기**에서 접속 → 코드로 참여 (Supabase 연동 확인)
- [ ] 퀴즈 전부 정답 → 도장 애니메이션 / 일부러 오답 → 진도 유지 + 시도 횟수 증가
- [ ] 노트 작성 → 다른 기기에서 보임

## 로컬에서 먼저 돌려 보기 (선택)

```powershell
npm install
npm test                    # 자동 검증 32케이스
npm install -g vercel
vercel dev                  # http://localhost:3000
```

`.env` 없이 실행하면: 저장은 메모리(재시작 시 초기화), 문구는 템플릿 모드로 동작합니다.
로컬에서도 실제 연동을 보려면 `.env.example`을 복사해 `.env`를 만들고 값을 채우세요.
