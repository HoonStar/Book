// GET /api/books?q=검색어 — 카카오 도서 검색 전용
import { searchUnified } from "../lib/booksource.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  const query = String(req.query.q || "").trim().slice(0, 100);
  if (!query) return res.status(200).json({ source: "kakao", results: [] });
  try {
    const data = await searchUnified(query, 8);
    res.setHeader?.("Cache-Control", "s-maxage=300, stale-while-revalidate=3600");
    return res.status(200).json(data);
  } catch (error) {
    console.error("[books:kakao]", error.message);
    return res.status(503).json({ error: "카카오 도서 검색을 잠시 사용할 수 없어요." });
  }
}
