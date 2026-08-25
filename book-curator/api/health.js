// GET /api/health — 배포 후 연동 상태 한눈에 확인
import { storageMode } from "../lib/store.js";
import { activeSource } from "../lib/booksource.js";

export default async function handler(req, res) {
  return res.status(200).json({
    ok: true,
    storage: storageMode,                                   // supabase | memory
    llm: process.env.OPENAI_API_KEY ? "live" : "template",  // live면 AI 문구 활성
    book_source: activeSource(),                            // local | kakao | aladin
    time: new Date().toISOString(),
  });
}
