// GET /api/books?q=검색어 — 자동완성용 도서 검색
// BOOK_SOURCE 환경변수(local|kakao|aladin)에 따라 소스 전환, 실패 시 로컬 폴백
import { searchUnified } from "../lib/booksource.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  const data = await searchUnified(req.query.q || "", 8);
  return res.status(200).json(data);
}
