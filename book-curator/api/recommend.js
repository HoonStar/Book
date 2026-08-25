// POST /api/recommend — [1]~[4] 코드 파이프라인 → [5] LLM 카피
import { normalizeInput, recommend, hasQuiz } from "../lib/engine.js";
import { generateCopy } from "../lib/llm.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { ok, errors, input } = normalizeInput(req.body || {});
  if (!ok) return res.status(400).json({ errors });

  const { recs, nextUp, notice, weights } = recommend(input);   // 코드가 3권 확정
  const copy = await generateCopy(input, recs, nextUp);          // LLM은 문장만

  return res.status(200).json({
    mode: copy.mode, notice, weights,
    recommendations: recs.map((r) => ({
      book_id: r.book.id, title: r.book.title, author: r.book.author,
      genres: r.book.genres, pages: r.book.pages, difficulty: r.book.difficulty,
      one_liner: copy.items[r.book.id].one_liner,
      why: copy.items[r.book.id].why,
      estimated_days: r.est.days, daily_pages: r.est.dailyPages,
      match_score: r.score, breakdown: r.breakdown,
      race_ready: hasQuiz(r.book.id),
    })),
    next_up: nextUp ? { book_id: nextUp.book.id, title: nextUp.book.title, author: nextUp.book.author, reason: copy.next_reason } : null,
  });
}
