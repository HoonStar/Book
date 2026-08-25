// lib/engine.js — 추천 엔진 (100% 결정론, LLM 호출 없음)
// 기획안 원칙 R2: "추천 도서 목록은 100% 코드가 확정한다"
// 도서 데이터는 catalog.js(연동 심)를 통해서만 접근 — 외부 API 전환 시 엔진 수정 불필요
import { BOOKS, QUIZZES, bookById } from "./catalog.js";
export { BOOKS, QUIZZES, bookById, hasQuiz, searchBooks } from "./catalog.js";

export const GENRES = ["소설","자기계발","에세이","과학","역사","경제경영","인문","추리·스릴러"];
export const MOODS = ["위로가 필요해","자극이 필요해","몰입하고 싶어","가볍게 쉬고 싶어","성장하고 싶어"];
export const SPEED = { "느림": 1.0, "보통": 1.5, "빠름": 2.2 }; // 분당 쪽수
const MOOD_ADJ = {
  "위로가 필요해": ["가볍게 쉬고 싶어"],
  "가볍게 쉬고 싶어": ["위로가 필요해"],
  "몰입하고 싶어": ["자극이 필요해","성장하고 싶어"],
  "자극이 필요해": ["몰입하고 싶어"],
  "성장하고 싶어": ["몰입하고 싶어"],
};
const WEIGHTS = { G: 0.35, M: 0.25, D: 0.15, F: 0.25 }; // 발표자료에 그대로 노출

// ── [1] Normalize: 입력 검증 ────────────────────────────────
export function normalizeInput(raw = {}) {
  const errors = [];
  const recentBookIds = Array.isArray(raw.recentBookIds) ? raw.recentBookIds.filter(bookById).slice(0, 3) : [];
  // DB 미매칭 책의 폴백: 장르/기분만 반영 (기획안 3.3)
  const unknownRecent = Array.isArray(raw.unknownRecent)
    ? raw.unknownRecent.filter((u) => GENRES.includes(u?.genre)).slice(0, 3)
        .map((u) => ({ genre: u.genre, title: String(u.title || "").trim().slice(0, 60) || null }))
    : [];
  const preferredGenres = Array.isArray(raw.preferredGenres)
    ? [...new Set(raw.preferredGenres.filter((g) => GENRES.includes(g)))].slice(0, 3)
    : [];
  if (preferredGenres.length < 1) errors.push("선호 장르를 1~3개 선택해 주세요.");
  const mood = MOODS.includes(raw.mood) ? raw.mood : null;
  if (!mood) errors.push("현재 기분을 선택해 주세요.");
  const dailyMinutes = clamp(int(raw.dailyMinutes, 30), 5, 240);
  const speed = SPEED[raw.speed] ? raw.speed : "보통";
  const targetDays = clamp(int(raw.targetDays, 30), 7, 90);
  return { ok: errors.length === 0, errors, input: { recentBookIds, unknownRecent, preferredGenres, mood, dailyMinutes, speed, targetDays } };
}
const int = (v, d) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : d);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// ── [2] Profile: 취향 프로파일 ──────────────────────────────
export function buildProfile(input) {
  const gw = {}; // 장르 가중치
  const add = (g, w) => (gw[g] = (gw[g] || 0) + w);
  const recents = input.recentBookIds.map(bookById);
  recents.forEach((b) => b.genres.forEach((g) => add(g, 0.6 / Math.max(1, b.genres.length))));
  input.unknownRecent.forEach((u) => add(u.genre, 0.6));
  input.preferredGenres.forEach((g) => add(g, 0.4));
  const max = Math.max(...Object.values(gw), 0.0001);
  Object.keys(gw).forEach((g) => (gw[g] = gw[g] / max)); // 0~1 정규화
  const diffs = recents.map((b) => b.difficulty);
  const avgDifficulty = diffs.length ? diffs.reduce((a, c) => a + c, 0) / diffs.length : 2.5;
  return { genreWeights: gw, avgDifficulty, readIds: new Set(input.recentBookIds) };
}

// ── 완독 기간 산식 (기획안 4.4) ─────────────────────────────
export function estimate(book, dailyMinutes, speedLabel) {
  const adj = 1 - 0.08 * (book.difficulty - 3); // 난이도 보정
  const ppm = SPEED[speedLabel] * adj;          // 분당 쪽수
  const dailyPages = Math.max(1, Math.round(dailyMinutes * ppm));
  const days = Math.ceil(book.pages / dailyPages);
  return { days, dailyPages };
}

// ── [3]+[4] Filter & Score ─────────────────────────────────
function scoreBook(book, input, profile) {
  const G = book.genres.reduce((m, g) => Math.max(m, profile.genreWeights[g] || 0), 0);
  const M = book.mood_tags.includes(input.mood) ? 1
    : book.mood_tags.some((t) => (MOOD_ADJ[input.mood] || []).includes(t)) ? 0.5 : 0;
  const D = 1 - Math.min(1, Math.abs(book.difficulty - profile.avgDifficulty) / 4);
  const est = estimate(book, input.dailyMinutes, input.speed);
  const F = est.days <= input.targetDays ? 1 : Math.max(0, 1 - (est.days - input.targetDays) / input.targetDays);
  const score = WEIGHTS.G * G + WEIGHTS.M * M + WEIGHTS.D * D + WEIGHTS.F * F;
  return { book, est, score: round2(score), breakdown: { G: round2(G), M: round2(M), D: round2(D), F: round2(F) } };
}
const round2 = (n) => Math.round(n * 100) / 100;

export function recommend(input) {
  const profile = buildProfile(input);
  const pool = BOOKS.filter((b) => !profile.readIds.has(b.id));
  const scored = pool.map((b) => scoreBook(b, input, profile));

  // 완독 필터 완화 사다리 (기획안 4.6): 목표일 → 목표일×1.5 → 해제
  const ladders = [
    { cap: input.targetDays, notice: null },
    { cap: Math.round(input.targetDays * 1.5), notice: `목표 기간 내 후보가 부족해 기준을 ${Math.round(input.targetDays * 1.5)}일로 완화했어요.` },
    { cap: Infinity, notice: "완독 기간 조건을 해제하고 취향 순으로 추천했어요." },
  ];
  let picked = [], notice = null;
  for (const step of ladders) {
    const eligible = scored.filter((s) => s.est.days <= step.cap).sort((a, b) => b.score - a.score);
    picked = diversify(eligible, 3);
    if (picked.length >= 3) { notice = step.notice; break; }
  }
  if (picked.length < 3) {
    picked = diversify([...scored].sort((a, b) => b.score - a.score), 3);
    notice = "조건에 맞는 책이 적어 전체 도서에서 추천했어요.";
  }
  const nextUp = pickNextUp(picked, profile);
  return { recs: picked, nextUp, notice, weights: WEIGHTS };
}

// 다양성 보정: 상위 3권 중 동일 장르 최대 2권
function diversify(sorted, k) {
  const out = [], count = {};
  for (const s of sorted) {
    const primary = s.book.genres[0];
    if ((count[primary] || 0) >= 2) continue;
    out.push(s);
    count[primary] = (count[primary] || 0) + 1;
    if (out.length === k) break;
  }
  return out;
}

// 연계 추천: 시리즈 다음 권 우선, 없으면 차순위 후보
function pickNextUp(picked, profile) {
  for (const p of picked) {
    const nx = p.book.series_next && bookById(p.book.series_next);
    if (nx && !profile.readIds.has(nx.id) && !picked.some((q) => q.book.id === nx.id))
      return { book: nx, basis: p.book.title };
  }
  return null;
}

// ── 퀴즈 게이트 (기획안: 코드가 정답 판정) ───────────────────
export function getQuiz(bookId, checkpoint) {
  const set = QUIZZES[bookId]?.[String(checkpoint)];
  if (!set) return null;
  return set.map(({ id, q, options }) => ({ id, q, options })); // 정답 제거 후 전달
}
export function gradeQuiz(bookId, checkpoint, answers) {
  const set = QUIZZES[bookId]?.[String(checkpoint)];
  if (!set) return { valid: false };
  let correct = 0;
  for (const item of set) {
    const a = answers?.find((x) => x.qid === item.id);
    if (a && Number(a.choice) === item.answer) correct++;
  }
  return { valid: true, correct, total: set.length, passed: correct === set.length };
}
