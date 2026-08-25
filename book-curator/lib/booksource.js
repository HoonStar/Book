// 카카오 도서 API 단일 데이터 소스.
// 로컬 도서 파일이나 다른 외부 소스로 폴백하지 않습니다.

const KAKAO_ENDPOINT = "https://dapi.kakao.com/v3/search/book";
const RESOLVE_TTL = 10 * 60 * 1000;
const resolveCache = (globalThis.__nextbookKakaoCache ||= new Map());

export function activeSource() {
  return "kakao";
}

export function hasKakaoKey() {
  return Boolean(process.env.KAKAO_REST_API_KEY);
}

export async function searchUnified(q, limit = 8, options = {}) {
  return { source: "kakao", results: await kakaoSearch(q, limit, options) };
}

export async function kakaoSearch(q, limit = 8, options = {}) {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) throw new Error("KAKAO_REST_API_KEY 미설정");
  const query = String(q || "").trim().slice(0, 100);
  if (!query) return [];

  const params = new URLSearchParams({
    query,
    sort: options.sort === "latest" ? "latest" : "accuracy",
    size: String(Math.min(50, Math.max(1, Number(limit) || 8))),
    page: String(Math.min(50, Math.max(1, Number(options.page) || 1))),
  });
  if (["title", "isbn", "publisher", "person"].includes(options.target)) {
    params.set("target", options.target);
  }

  const response = await fetch(`${KAKAO_ENDPOINT}?${params}`, {
    headers: { Authorization: `KakaoAK ${key}` },
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw new Error(`kakao ${response.status}`);
  const data = await response.json();
  return (data.documents || []).map(normalizeKakao).filter((book) => book.title);
}

export function normalizeKakao(document) {
  const isbn = pickIsbn(document.isbn);
  const title = String(document.title || "").trim();
  const author = (document.authors || []).join(", ");
  const id = isbn ? `kakao:${isbn}` : `kakao-ref:${stableHash(`${title}|${author}|${document.url || ""}`)}`;
  return {
    id,
    externalId: id,
    source: "kakao",
    external: true,
    title,
    author,
    isbn,
    cover: document.thumbnail || null,
    publisher: document.publisher || null,
    url: document.url || null,
    status: document.status || null,
    raceReady: Boolean(isbn),
  };
}

export const pickIsbn = (value) => {
  const text = String(value || "");
  return (text.match(/\b\d{13}\b/) || text.match(/\b\d{10}\b/) || [null])[0];
};
export const pickIsbn13 = (value) => (String(value || "").match(/\b\d{13}\b/) || [null])[0];

export async function resolveKakaoBookId(bookId) {
  const id = String(bookId || "").trim();
  const isbn = id.match(/^kakao:(\d{10}|\d{13})$/)?.[1];
  if (!isbn) return null;

  const cached = resolveCache.get(id);
  if (cached && Date.now() - cached.savedAt < RESOLVE_TTL) return cached.book;

  const results = await kakaoSearch(isbn, 10, { target: "isbn" });
  const book = results.find((item) => item.isbn === isbn) || results[0] || null;
  if (book) resolveCache.set(id, { savedAt: Date.now(), book });
  return book;
}

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
