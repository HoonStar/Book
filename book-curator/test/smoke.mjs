import { existsSync } from "node:fs";
import books from "../api/books.js";
import recommend from "../api/recommend.js";
import room from "../api/room.js";
import { normalizeRecommendationInput } from "../lib/recommendation.js";

let pass = 0;
let fail = 0;
const ok = (condition, name) => {
  condition ? pass++ : (fail++, console.error("  ✗", name));
  if (condition) console.log("  ✓", name);
};
function mockRes() {
  const result = { code: 0, body: null };
  return {
    result,
    status(code) { result.code = code; return this; },
    json(body) { result.body = body; return this; },
    setHeader() {},
  };
}
const call = async (handler, method, { query = {}, body = {} } = {}) => {
  const response = mockRes();
  await handler({ method, query, body }, response);
  return response.result;
};

const originalFetch = globalThis.fetch;
process.env.KAKAO_REST_API_KEY = "test-rest-key";
const servedIds = new Set();
globalThis.fetch = async (url) => {
  const parsed = new URL(String(url));
  const query = parsed.searchParams.get("query") || "도서";
  const target = parsed.searchParams.get("target");
  let documents;
  if (target === "isbn") {
    documents = [{
      title: query === "9788954651134" ? "아몬드" : `ISBN ${query} 도서`,
      authors: [query === "9788954651134" ? "손원평" : "카카오 작가"],
      isbn: query,
      thumbnail: `https://img.example/${query}.jpg`,
      publisher: "카카오 테스트 출판사",
      url: `https://book.example/${query}`,
    }];
  } else if (query === "아몬드") {
    documents = [{
      title: "아몬드",
      authors: ["손원평"],
      isbn: "8954651134 9788954651134",
      thumbnail: "https://img.example/almond.jpg",
      publisher: "창비",
      url: "https://book.example/almond",
    }];
  } else {
    const seed = [...query].reduce((sum, char) => sum + char.codePointAt(0), 0) % 900000;
    documents = Array.from({ length: 10 }, (_, index) => {
      const isbn = `97889${String(seed * 10 + index).padStart(8, "0")}`.slice(0, 13);
      servedIds.add(`kakao:${isbn}`);
      return {
        title: `${query} 추천 도서 ${index + 1}`,
        authors: [`카카오 작가 ${index + 1}`],
        isbn,
        thumbnail: `https://img.example/${isbn}.jpg`,
        publisher: "카카오 테스트 출판사",
        url: `https://book.example/${isbn}`,
      };
    });
  }
  return { ok: true, json: async () => ({ documents }) };
};

const invalid = normalizeRecommendationInput({ preferredGenres: [], mood: "" });
ok(!invalid.ok && invalid.errors.length === 2, "추천 입력 검증");

const search = await call(books, "GET", { query: { q: "아몬드" } });
ok(search.code === 200 && search.body.source === "kakao", "검색 소스는 카카오");
ok(search.body.results[0].id === "kakao:9788954651134", "검색 결과가 카카오 ISBN ID 사용");

const recommended = await call(recommend, "POST", { body: {
  recentBooks: [{ id: "kakao:9788954651134", isbn: "9788954651134", title: "아몬드", author: "손원평" }],
  preferredGenres: ["소설", "에세이"],
  mood: "위로가 필요해",
  dailyMinutes: 30,
  targetDays: 30,
} });
ok(recommended.code === 200 && recommended.body.recommendations.length === 3, "카카오 기반 추천 3권 반환");
ok(recommended.body.recommendations.every((book) => book.book_id.startsWith("kakao:") && servedIds.has(book.book_id)), "추천 전권이 카카오 응답에 존재");
ok(recommended.body.recommendations.every((book) => book.race_ready && book.cover), "ISBN·표지가 있는 책으로 레이스 준비");

const created = await call(room, "POST", { body: {
  action: "create",
  bookId: "kakao:9788954651134",
  targetDays: 21,
  nickname: "지훈",
  deviceId: "dev-A",
} });
const code = created.body.code;
ok(created.code === 200 && /^[A-Z2-9]{6}$/.test(code), "카카오 도서로 레이스 생성");

const legacy = await call(room, "POST", { body: {
  action: "create",
  bookId: "bk_002",
  targetDays: 21,
  nickname: "지훈",
  deviceId: "dev-A",
} });
ok(legacy.code === 400, "로컬 카탈로그 ID로 레이스 생성 차단");

const joined = await call(room, "POST", { body: { action: "join", code, nickname: "친구", deviceId: "dev-B" } });
ok(joined.code === 200, "초대 코드 참여");

const progress = await call(room, "POST", { body: { action: "progress", code, deviceId: "dev-A", progress: 57 } });
ok(progress.code === 200 && progress.body.progress === 55, "질문 없이 5% 단위 진도 저장");
await call(room, "POST", { body: { action: "progress", code, deviceId: "dev-A", progress: 100 } });
const state = await call(room, "GET", { query: { code, device: "dev-A" } });
const me = state.body.members.find((member) => member.is_me);
ok(me.verified_pct === 100 && !("attempts" in me), "퀴즈 시도 횟수 없이 완독 기록");
ok(state.body.book.id === "kakao:9788954651134" && state.body.book.title === "아몬드", "레이스 도서를 카카오에서 조회");

await call(room, "POST", { body: { action: "cheer", code, toNick: "친구", emoji: "🔥", deviceId: "dev-A" } });
await call(room, "POST", { body: { action: "note", code, deviceId: "dev-B", content: "좋았던 장면을 기록해요.", style: {} } });
const finalState = await call(room, "GET", { query: { code, device: "dev-B" } });
ok(finalState.body.cheers.length === 1 && finalState.body.notes.length === 1, "응원·공유 서재 유지");
ok(!existsSync(new URL("../api/quiz.js", import.meta.url)), "퀴즈 API 제거");

globalThis.fetch = originalFetch;
delete process.env.KAKAO_REST_API_KEY;
console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
