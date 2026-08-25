// lib/booksource.js — 도서 데이터 소스 추상화 계층
// BOOK_SOURCE 환경변수로 전환: local(기본) | kakao | aladin
// 설계: 외부 API는 "검색·서지정보(제목/저자/ISBN/표지)" 담당,
//       큐레이션 필드(mood_tags·difficulty·themes·퀴즈)는 로컬 카탈로그 담당.
//       외부 결과가 카탈로그와 매칭되면(ISBN 또는 제목+저자) 병합해 추천·레이스가 가능해짐.
import { BOOKS, searchBooks as searchLocal, hasQuiz } from "./engine.js";

export function activeSource() {
  const s = (process.env.BOOK_SOURCE || (process.env.KAKAO_REST_API_KEY ? "kakao" : "local")).toLowerCase();
  return ["local", "kakao", "aladin"].includes(s) ? s : "local";
}

// ── 통합 검색: api/books.js가 호출하는 단일 진입점 ─────────────
export async function searchUnified(q, limit = 8) {
  const local = searchLocal(q, limit);
  const src = activeSource();
  if (src === "local") return { source: "local", results: local };
  try {
    const ext = src === "kakao" ? await kakaoSearch(q, limit) : await aladinSearch(q, limit);
    return { source: src, results: mergeExternal(ext, local, limit) };
  } catch (e) {
    console.error(`[booksource] ${src} 실패 → 로컬 폴백:`, e.message);
    return { source: "local", results: local, notice: "외부 도서 API 응답이 없어 내장 목록으로 검색했어요." };
  }
}

// ── 병합: 외부 결과를 카탈로그와 대조 (카탈로그 매칭 우선 노출) ──
export function mergeExternal(extItems, localItems, limit = 8) {
  const out = [];
  const seen = new Set();
  const push = (item) => {
    const key = item.id || item.isbn || norm(item.title);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(item);
  };
  for (const ext of extItems) {
    const match = matchCatalog(ext);
    if (match) push({ id: match.id, title: match.title, author: match.author, hasQuiz: hasQuiz(match.id), cover: ext.cover || null });
    else push({
      external: true,
      externalId: `${ext.source || "external"}:${ext.isbn || norm(`${ext.title}-${ext.author}`)}`,
      title: ext.title,
      author: ext.author,
      isbn: ext.isbn || null,
      cover: ext.cover || null,
      publisher: ext.publisher || null,
    });
  }
  for (const l of localItems) push(l); // 외부에 없던 카탈로그 결과 보충
  return out.sort((a, b) => Boolean(b.id) - Boolean(a.id)).slice(0, limit);
}

export function matchCatalog(ext) {
  if (ext.isbn) {
    const byIsbn = BOOKS.find((b) => b.isbn && String(b.isbn) === String(ext.isbn));
    if (byIsbn) return byIsbn;
  }
  const t = norm(ext.title);
  return BOOKS.find((b) => {
    const bt = norm(b.title);
    const titleHit = bt === t || bt.startsWith(t) || t.startsWith(bt);
    const authorHit = !ext.author || !b.author || norm(ext.author).includes(norm(b.author).slice(0, 3)) || norm(b.author).includes(norm(ext.author).slice(0, 3));
    return titleHit && authorHit;
  }) || null;
}
const norm = (s) => String(s || "").toLowerCase().replace(/[\s·:\-–—()\[\]『』《》"']/g, "");

// ── 어댑터 1: 카카오 책 검색 (developers.kakao.com REST API 키) ──
export async function kakaoSearch(q, limit = 8) {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) throw new Error("KAKAO_REST_API_KEY 미설정");
  const query = String(q || "").trim().slice(0, 100);
  if (!query) return [];
  const size = Math.min(50, Math.max(1, Number(limit) || 8));
  const res = await fetch(
    `https://dapi.kakao.com/v3/search/book?target=title&sort=accuracy&size=${size}&query=${encodeURIComponent(query)}`,
    { headers: { Authorization: `KakaoAK ${key}` }, signal: AbortSignal.timeout(6000) }
  );
  if (!res.ok) throw new Error(`kakao ${res.status}`);
  const data = await res.json();
  return (data.documents || []).map(normalizeKakao);
}
export function normalizeKakao(d) {
  return {
    source: "kakao",
    title: String(d.title || "").trim(),
    author: (d.authors || []).join(", "),
    isbn: pickIsbn13(d.isbn),
    cover: d.thumbnail || null,
    publisher: d.publisher || null,
    url: d.url || null,
    pages: null, // 카카오는 쪽수 미제공 → 알라딘 ItemLookUp 또는 수기 입력으로 보강
  };
}
export const pickIsbn13 = (s) => (String(s || "").match(/\b\d{13}\b/) || [null])[0];

// ── 어댑터 2: 알라딘 Open API (TTB 키) ─────────────────────────
export async function aladinSearch(q, limit = 8) {
  const key = process.env.ALADIN_TTB_KEY;
  if (!key) throw new Error("ALADIN_TTB_KEY 미설정");
  const url = `https://www.aladin.co.kr/ttb/api/ItemSearch.aspx?ttbkey=${key}&Query=${encodeURIComponent(q)}&QueryType=Title&MaxResults=${limit}&SearchTarget=Book&output=js&Version=20131101&Cover=Mid`;
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`aladin ${res.status}`);
  const data = await res.json();
  return (data.item || []).map(normalizeAladin);
}
export function normalizeAladin(it) {
  return {
    source: "aladin",
    title: String(it.title || "").trim(),
    author: String(it.author || "").replace(/\s*\(지은이\)|\s*\(옮긴이\)/g, "").trim(),
    isbn: it.isbn13 || pickIsbn13(it.isbn) || null,
    cover: it.cover || null,
    publisher: it.publisher || null,
    pages: it.subInfo?.itemPage || null, // ItemLookUp(OptResult) 사용 시 채워짐
  };
}

// 쪽수 보강용(선택): ISBN13으로 알라딘 상세 조회 → itemPage
export async function aladinLookupPages(isbn13) {
  const key = process.env.ALADIN_TTB_KEY;
  if (!key || !isbn13) return null;
  const url = `https://www.aladin.co.kr/ttb/api/ItemLookUp.aspx?ttbkey=${key}&itemIdType=ISBN13&ItemId=${isbn13}&output=js&Version=20131101&OptResult=packing`;
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) return null;
  const data = await res.json();
  return data.item?.[0]?.subInfo?.itemPage || null;
}
