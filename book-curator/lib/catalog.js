// lib/catalog.js — 도서 카탈로그 접근 계층 (외부 API 연동 심)
//
// 지금은 로컬 JSON(BOOKS_PROVIDER=local)을 읽습니다.
// 나중에 도서 DB를 외부 소스로 바꿀 때 이 파일의 loadBooks/loadQuizzes만 교체하면
// 추천 엔진(engine.js)과 API 핸들러는 한 줄도 수정할 필요가 없습니다.
//
// ⚠️ 설계 전제: 추천 엔진은 difficulty·mood_tags가 채워진 카탈로그를 필요로 합니다.
//    알라딘·카카오 등 외부 도서 API에는 이 필드가 없으므로, 런타임 직접 조회가 아니라
//    [scripts/import-aladin.mjs 로 수집 → 사람이 보강 → 카탈로그 반영] 흐름을 권장합니다.
//    (자세한 절차: DATA_GUIDE.md 5장)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const loadJson = (name) => JSON.parse(readFileSync(join(__dir, "data", name), "utf-8"));

const PROVIDER = process.env.BOOKS_PROVIDER || "local";

function loadBooks() {
  switch (PROVIDER) {
    case "local":
      return loadJson("books.json");
    // case "supabase": ← 카탈로그를 Supabase books 테이블로 옮길 때의 구현 지점
    // case "aladin-live": ← 실시간 API 조회로 전환할 때의 구현 지점 (difficulty 보강 전략 필요)
    default:
      throw new Error(`알 수 없는 BOOKS_PROVIDER: ${PROVIDER} (지원: local)`);
  }
}

function loadQuizzes() {
  switch (PROVIDER) {
    case "local":
      return loadJson("quizzes.json");
    default:
      throw new Error(`알 수 없는 BOOKS_PROVIDER: ${PROVIDER} (지원: local)`);
  }
}

export const BOOKS = loadBooks();
export const QUIZZES = loadQuizzes();

export const bookById = (id) => BOOKS.find((b) => b.id === id) || null;
export const hasQuiz = (id) => Boolean(QUIZZES[id]);

export function searchBooks(q, limit = 8) {
  const s = (q || "").trim().toLowerCase();
  if (!s) return [];
  return BOOKS.filter((b) => b.title.toLowerCase().includes(s) || b.author.toLowerCase().includes(s))
    .slice(0, limit)
    .map((b) => ({ id: b.id, title: b.title, author: b.author, hasQuiz: hasQuiz(b.id) }));
}
