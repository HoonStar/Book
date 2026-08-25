#!/usr/bin/env node
// scripts/preflight.mjs — 제출·배포 전 자동 점검
// ① 카탈로그(books/quizzes) 무결성  ② 저장소 내 시크릿(sk-, JWT) 스캔  ③ 환경변수 상태 안내
// 사용: npm run preflight
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { GENRES, MOODS } from "../lib/engine.js";

// file URL의 pathname은 Windows에서 /C:/... 형태가 되어 join() 시 C:\C:\... 오류가 납니다.
// fileURLToPath()로 운영체제에 맞는 실제 경로로 변환합니다.
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const errors = [], warns = [];
const err = (m) => errors.push(m);
const warn = (m) => warns.push(m);

// ── ① 카탈로그 검증 ────────────────────────────────────────
let books = [], quizzes = {};
try { books = JSON.parse(readFileSync(join(ROOT, "lib/data/books.json"), "utf-8")); }
catch (e) { err(`books.json 파싱 실패: ${e.message}`); }
try { quizzes = JSON.parse(readFileSync(join(ROOT, "lib/data/quizzes.json"), "utf-8")); }
catch (e) { err(`quizzes.json 파싱 실패: ${e.message}`); }

const ids = new Set();
for (const b of books) {
  const tag = `[${b.id ?? "id없음"}] ${b.title ?? ""}`;
  if (!/^bk_\d{3}$/.test(b.id || "")) err(`${tag} id 형식 오류 (bk_숫자3자리)`);
  if (ids.has(b.id)) err(`${tag} id 중복`);
  ids.add(b.id);
  if (!b.title || !b.author) err(`${tag} title/author 누락`);
  if (!Array.isArray(b.genres) || !b.genres.length) err(`${tag} genres 비어 있음`);
  else b.genres.forEach((g) => { if (!GENRES.includes(g)) err(`${tag} 허용되지 않은 장르 "${g}"`); });
  if (!Number.isInteger(b.pages) || b.pages < 1) err(`${tag} pages는 1 이상 정수여야 함 (현재: ${b.pages})`);
  if (!Number.isInteger(b.difficulty) || b.difficulty < 1 || b.difficulty > 5) err(`${tag} difficulty는 1~5 정수여야 함 (현재: ${b.difficulty})`);
  if (!Array.isArray(b.mood_tags)) err(`${tag} mood_tags가 배열이 아님`);
  else {
    b.mood_tags.forEach((m) => { if (!MOODS.includes(m)) err(`${tag} 허용되지 않은 기분 "${m}" (띄어쓰기까지 정확히)`); });
    if (!b.mood_tags.length) warn(`${tag} mood_tags 비어 있음 — 기분 매칭 점수 0으로 처리됨`);
  }
  Object.keys(b).forEach((k) => { if (k.startsWith("_")) err(`${tag} 검토용 필드 "${k}" 미삭제 (임포트 후 정리 필요)`); });
}
for (const b of books) {
  if (b.series_next && !ids.has(b.series_next)) err(`[${b.id}] series_next "${b.series_next}"가 존재하지 않음`);
}

const qids = new Set();
for (const [bid, cps] of Object.entries(quizzes)) {
  if (!ids.has(bid)) err(`quizzes: 존재하지 않는 도서 "${bid}"`);
  const keys = Object.keys(cps).sort((a, z) => a - z).join(",");
  if (keys !== "100,25,50,75".split(",").sort((a, z) => a - z).join(","))
    err(`quizzes[${bid}] 체크포인트는 25/50/75/100 네 개여야 함 (현재: ${keys})`);
  for (const [cp, list] of Object.entries(cps)) {
    if (!Array.isArray(list) || !list.length) { err(`quizzes[${bid}][${cp}] 문항 없음`); continue; }
    for (const q of list) {
      const t = `quizzes[${bid}][${cp}][${q.id ?? "?"}]`;
      if (!q.id || qids.has(q.id)) err(`${t} 문항 id 누락/중복`);
      qids.add(q.id);
      if (!q.q) err(`${t} 질문 텍스트 누락`);
      if (!Array.isArray(q.options) || q.options.length < 2) err(`${t} 보기 2개 이상 필요`);
      else if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.options.length)
        err(`${t} answer 인덱스 범위 오류 (0~${q.options.length - 1})`);
    }
  }
}
const raceable = Object.keys(quizzes).filter((k) => ids.has(k)).length;
if (raceable < 1) err("레이스 가능한 책(퀴즈 보유)이 없음");

// ── ② 시크릿 스캔 ──────────────────────────────────────────
const SECRET_PATTERNS = [
  [/sk-[A-Za-z0-9_-]{20,}/g, "OpenAI 형태 키"],
  [/eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}/g, "JWT(Supabase 키 형태)"],
];
const SKIP_DIRS = new Set(["node_modules", ".git", ".vercel"]);
const SKIP_FILES = new Set([".env", ".env.local", "package-lock.json"]);
function scan(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { if (!SKIP_DIRS.has(name)) scan(p); continue; }
    if (SKIP_FILES.has(name) || st.size > 1_000_000) continue;
    let text; try { text = readFileSync(p, "utf-8"); } catch { continue; }
    for (const [re, label] of SECRET_PATTERNS) {
      const m = text.match(re);
      if (m) err(`시크릿 의심: ${relative(ROOT, p)} 에 ${label} 패턴 발견 → 즉시 제거·키 재발급`);
    }
  }
}
scan(ROOT);
const gi = existsSync(join(ROOT, ".gitignore")) ? readFileSync(join(ROOT, ".gitignore"), "utf-8") : "";
if (!gi.split("\n").some((l) => l.trim() === ".env")) err(".gitignore에 .env가 없음");

// ── ③ 환경변수 상태 (값은 출력하지 않음) ─────────────────────
const envState = ["OPENAI_API_KEY", "SUPABASE_URL", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "BOOK_SOURCE", "KAKAO_REST_API_KEY"]
  .map((k) => `  ${process.env[k] ? "●" : "○"} ${k}`)
  .join("\n");

// ── 결과 ──────────────────────────────────────────────────
console.log(`도서 ${books.length}권 · 레이스 가능 ${raceable}권 · 퀴즈 문항 ${qids.size}개 검사 완료`);
console.log(`환경변수 (●설정 ○미설정 — 로컬 기준, Vercel은 대시보드에서 확인):\n${envState}`);
warns.forEach((w) => console.log(`  ⚠ ${w}`));
if (errors.length) {
  console.error(`\n✗ 오류 ${errors.length}건:`);
  errors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}
console.log("\n✓ preflight 통과 — 제출/배포 가능 상태");
