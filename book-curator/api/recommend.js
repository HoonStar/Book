// POST /api/recommend — 카카오 도서 검색 결과 안에서만 3권 추천
import { normalizeRecommendationInput, recommendFromKakao } from "../lib/recommendation.js";
import { generateCopy } from "../lib/llm.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { ok, errors, input } = normalizeRecommendationInput(req.body || {});
  if (!ok) return res.status(400).json({ errors });

  try {
    const recommendations = await recommendFromKakao(input);
    const copy = await generateCopy(input, recommendations);
    return res.status(200).json({
      source: "kakao",
      mode: copy.mode,
      taste_summary: `카카오 도서 검색 결과에서 ${input.preferredGenres.join(", ")} 취향과 ‘${input.mood}’ 기분에 맞는 책을 골랐어요.`,
      recommendations: recommendations.map(({ book, matchScore }) => ({
        book_id: book.id,
        title: book.title,
        author: book.author,
        isbn: book.isbn,
        cover: book.cover,
        publisher: book.publisher,
        url: book.url,
        genres: book.genres,
        one_liner: copy.items[book.id].one_liner,
        why: copy.items[book.id].why,
        reading_plan: `하루 ${input.dailyMinutes}분 · ${input.targetDays}일 목표`,
        match_score: matchScore,
        race_ready: Boolean(book.isbn),
      })),
    });
  } catch (error) {
    console.error("[recommend:kakao]", error.message);
    return res.status(503).json({ error: error.message || "카카오 도서 추천을 불러오지 못했어요." });
  }
}
