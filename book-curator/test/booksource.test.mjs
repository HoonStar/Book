import {
  activeSource,
  kakaoSearch,
  normalizeKakao,
  pickIsbn,
  pickIsbn13,
  resolveKakaoBookId,
  searchUnified,
} from "../lib/booksource.js";

let pass = 0;
let fail = 0;
const ok = (condition, name) => {
  condition ? pass++ : (fail++, console.error("  ✗", name));
  if (condition) console.log("  ✓", name);
};

const document = {
  title: "아몬드",
  authors: ["손원평"],
  isbn: "8954651134 9788954651134",
  thumbnail: "https://img/almond.jpg",
  publisher: "창비",
  url: "https://book.example/almond",
};
const normalized = normalizeKakao(document);
ok(normalized.id === "kakao:9788954651134" && normalized.raceReady, "카카오 ISBN을 안정적인 레이스 ID로 변환");
ok(normalized.author === "손원평" && normalized.cover.includes("almond"), "카카오 저자·표지 정규화");
ok(pickIsbn("8954651134 9788954651134") === "9788954651134", "ISBN13 우선 추출");
ok(pickIsbn("8954651134") === "8954651134" && pickIsbn13("8954651134") === null, "ISBN10 호환");
ok(activeSource() === "kakao", "도서 소스는 항상 카카오");

const originalFetch = globalThis.fetch;
let request;
process.env.KAKAO_REST_API_KEY = "test-rest-key";
globalThis.fetch = async (url, options) => {
  request = { url: String(url), options };
  return { ok: true, json: async () => ({ documents: [document] }) };
};

const searched = await kakaoSearch("아몬드", 8);
ok(searched[0].id === "kakao:9788954651134", "카카오 검색 결과만 반환");
ok(request.url.includes("/v3/search/book") && !request.url.includes("target=title"), "통합 검색은 제목·저자 등 전체 필드를 검색");
ok(request.options.headers.Authorization === "KakaoAK test-rest-key", "카카오 REST 인증 헤더 사용");

const unified = await searchUnified("아몬드", 8);
ok(unified.source === "kakao" && unified.results.length === 1, "통합 검색에 로컬 병합·폴백 없음");

const resolved = await resolveKakaoBookId("kakao:9788954651134");
ok(resolved?.title === "아몬드", "레이스 ISBN을 카카오에서 다시 확인");
ok(await resolveKakaoBookId("bk_002") === null, "이전 로컬 카탈로그 ID를 허용하지 않음");

delete process.env.KAKAO_REST_API_KEY;
let rejected = false;
try { await searchUnified("아몬드", 8); } catch { rejected = true; }
ok(rejected, "카카오 키가 없을 때 로컬 JSON으로 폴백하지 않음");

globalThis.fetch = originalFetch;
console.log(`\n카카오 도서 소스 결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
