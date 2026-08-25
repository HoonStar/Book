// /api/quiz — 진도 인증 퀴즈 게이트
// GET  ?code=ABC123&device=... → 내 다음 체크포인트의 문항(정답 제외)
// POST {code, deviceId, checkpoint, answers:[{qid, choice}]} → 코드가 채점, 전부 정답이어야 진도 확정
import { getQuiz, gradeQuiz, bookById } from "../lib/engine.js";
import * as store from "../lib/store.js";

const NEXT = { 0: 25, 25: 50, 50: 75, 75: 100 };
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });

export default async function handler(req, res) {
  try {
    if (req.method === "GET") return await serve(req, res);
    if (req.method === "POST") return await grade(req, res);
    return bad(res, "GET/POST only", 405);
  } catch (e) {
    console.error(e);
    return bad(res, "서버 오류가 발생했어요.", 500);
  }
}

async function serve(req, res) {
  const code = String(req.query.code || "").toUpperCase();
  const room = await store.getRoomRow(code);
  const me = await store.getMember(code, String(req.query.device || ""));
  if (!room || !me) return bad(res, "레이스 참가자가 아니에요.", 403);
  if (me.verified_pct >= 100) return res.status(200).json({ done: true });
  const checkpoint = NEXT[me.verified_pct];
  const questions = getQuiz(room.book_id, checkpoint);
  if (!questions) return bad(res, "이 책의 퀴즈가 준비되지 않았어요.", 404);
  return res.status(200).json({ checkpoint, questions, book: bookById(room.book_id).title });
}

async function grade(req, res) {
  const b = req.body || {};
  const code = String(b.code || "").toUpperCase();
  const room = await store.getRoomRow(code);
  const me = await store.getMember(code, b.deviceId);
  if (!room || !me) return bad(res, "레이스 참가자가 아니에요.", 403);

  const checkpoint = Number(b.checkpoint);
  if (checkpoint !== NEXT[me.verified_pct]) {
    return bad(res, `체크포인트는 순서대로 인증해야 해요. (다음: ${NEXT[me.verified_pct] ?? "완료"}%)`);
  }
  const result = gradeQuiz(room.book_id, checkpoint, b.answers);
  if (!result.valid) return bad(res, "퀴즈를 불러올 수 없어요.", 404);

  await store.updateProgress(code, b.deviceId, checkpoint, result.passed);
  const members = await store.listMembers(code);
  const finishedBeforeMe = members.filter((m) => m.verified_pct >= 100 && m.device_id !== b.deviceId).length;

  return res.status(200).json({
    passed: result.passed,
    correct: result.correct,
    total: result.total,
    new_pct: result.passed ? checkpoint : me.verified_pct,
    finished: result.passed && checkpoint === 100,
    rank: result.passed && checkpoint === 100 ? finishedBeforeMe + 1 : null,
  });
}
