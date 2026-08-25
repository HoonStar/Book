import { kakaoSearch } from "./booksource.js";

export const GENRES = ["소설", "에세이", "과학", "자기계발", "경제경영", "인문", "추리·스릴러"];

const GENRE_QUERY = {
  "소설": "한국 소설",
  "에세이": "에세이",
  "과학": "과학 교양",
  "자기계발": "자기계발",
  "경제경영": "경제 경영",
  "인문": "인문학",
  "추리·스릴러": "추리 소설",
};
const MOOD_QUERY = {
  "위로가 필요해": "마음 위로 에세이",
  "자극이 필요해": "새로운 생각",
  "몰입하고 싶어": "몰입 소설",
  "가볍게 쉬고 싶어": "가벼운 에세이",
  "성장하고 싶어": "성장 자기계발",
};

export function normalizeRecommendationInput(raw = {}) {
  const errors = [];
  const preferredGenres = Array.isArray(raw.preferredGenres)
    ? [...new Set(raw.preferredGenres.filter((genre) => GENRES.includes(genre)))].slice(0, 3)
    : [];
  if (!preferredGenres.length) errors.push("선호 장르를 하나 이상 선택해 주세요.");

  const mood = String(raw.mood || "").trim().slice(0, 40);
  if (!mood) errors.push("현재 기분을 선택해 주세요.");

  const recentBooks = Array.isArray(raw.recentBooks)
    ? raw.recentBooks.slice(0, 3).map((book) => ({
        id: String(book?.id || book?.externalId || "").slice(0, 80),
        title: String(book?.title || "").trim().slice(0, 120),
        author: String(book?.author || "").trim().slice(0, 120),
        isbn: String(book?.isbn || "").trim().slice(0, 13),
      })).filter((book) => book.title)
    : [];

  const dailyMinutes = clampNumber(raw.dailyMinutes, 5, 240, 30);
  const targetDays = clampNumber(raw.targetDays, 7, 90, 30);
  const refresh = clampNumber(raw.refresh, 0, 20, 0);
  return { ok: !errors.length, errors, input: { preferredGenres, mood, recentBooks, dailyMinutes, targetDays, refresh } };
}

export async function recommendFromKakao(input) {
  const queries = [];
  for (const book of input.recentBooks) {
    if (book.author) queries.push({ query: book.author.split(",")[0], target: "person", tag: "같은 작가" });
  }
  for (const genre of input.preferredGenres) {
    queries.push({ query: GENRE_QUERY[genre] || genre, tag: genre });
  }
  queries.push({ query: MOOD_QUERY[input.mood] || input.mood, tag: input.mood });
  queries.push({ query: "문학 추천", tag: input.preferredGenres[0] || "추천" });

  const settled = await Promise.allSettled(queries.slice(0, 6).map((item, index) =>
    kakaoSearch(item.query, 10, {
      target: item.target,
      page: 1 + ((input.refresh + index) % 3),
    }).then((books) => books.map((book, rank) => ({ book, tag: item.tag, rank: index * 20 + rank })))
  ));

  const recentKeys = new Set(input.recentBooks.flatMap((book) => [book.id, book.isbn, normalize(book.title)]).filter(Boolean));
  const seen = new Set();
  const candidates = [];
  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    for (const candidate of result.value) {
      const { book } = candidate;
      if (!book.isbn || recentKeys.has(book.id) || recentKeys.has(book.isbn) || recentKeys.has(normalize(book.title))) continue;
      if (seen.has(book.id)) continue;
      seen.add(book.id);
      candidates.push(candidate);
    }
  }

  candidates.sort((a, b) => {
    const qualityA = (a.book.cover ? 2 : 0) + (a.book.publisher ? 1 : 0);
    const qualityB = (b.book.cover ? 2 : 0) + (b.book.publisher ? 1 : 0);
    return a.rank - b.rank || qualityB - qualityA;
  });
  const picked = candidates.slice(0, 3);
  if (picked.length < 3) {
    throw new Error("카카오에서 조건에 맞는 도서를 충분히 찾지 못했어요. 장르나 기분을 바꿔 다시 시도해 주세요.");
  }

  return picked.map((candidate, index) => ({
    book: {
      ...candidate.book,
      genres: [candidate.tag],
      themes: [input.mood],
    },
    matchScore: Math.max(72, 94 - index * 7),
  }));
}

const normalize = (value) => String(value || "").toLowerCase().replace(/[\s·:\-–—()\[\]『』《》"']/g, "");
const clampNumber = (value, min, max, fallback) => {
  const number = Number.isFinite(Number(value)) ? Math.round(Number(value)) : fallback;
  return Math.max(min, Math.min(max, number));
};
