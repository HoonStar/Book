// test/smoke.mjs — LLM 키·Supabase 없이 전체 흐름 검증 (메모리 스토어 + 템플릿 카피)
import recommend from "../api/recommend.js";
import books from "../api/books.js";
import room from "../api/room.js";
import quiz from "../api/quiz.js";
import { QUIZZES, BOOKS, estimate, normalizeInput } from "../lib/engine.js";

let pass = 0, fail = 0;
const ok = (cond, name) => { cond ? pass++ : (fail++, console.error("  ✗", name)); if (cond) console.log("  ✓", name); };

function mockRes() {
  const r = { code: 0, body: null };
  return { r, status(c) { r.code = c; return this; }, json(b) { r.body = b; return this; } };
}
const call = async (h, method, { query = {}, body = {} } = {}) => {
  const res = mockRes(); await h({ method, query, body }, res); return res.r;
};

// 1) 완독 산식 검산 (기획안 4.4의 예시)
{
  const b = { pages: 300, difficulty: 2 };
  const { days, dailyPages } = estimate(b, 30, "보통");
  ok(dailyPages === 49 && days === 7, `완독 산식: 300쪽·난이도2·보통·30분 → 하루 ${dailyPages}쪽, D+${days} (기대 49쪽·7일)`);
}

// 2) 입력 검증
{
  const bad = normalizeInput({ preferredGenres: [], mood: "이상한값" });
  ok(!bad.ok && bad.errors.length === 2, "잘못된 입력 → 오류 2건 반환");
  const clamped = normalizeInput({ preferredGenres: ["소설"], mood: "위로가 필요해", dailyMinutes: 9999, targetDays: 1 });
  ok(clamped.input.dailyMinutes === 240 && clamped.input.targetDays === 7, "범위 밖 값 클램프 (240분·7일)");
}

// 3) 추천 API — 3권, 목표 내 완독, 환각 불가 구조
{
  const r = await call(recommend, "POST", { body: {
    recentBookIds: ["bk_003"], preferredGenres: ["소설","에세이"], mood: "위로가 필요해",
    dailyMinutes: 30, speed: "보통", targetDays: 30,
  }});
  ok(r.code === 200 && r.body.recommendations.length === 3, "추천 3권 반환");
  ok(r.body.recommendations.every((x) => BOOKS.some((b) => b.id === x.book_id)), "추천 전권이 DB에 실존 (환각 0)");
  ok(!r.body.recommendations.some((x) => x.book_id === "bk_003"), "읽은 책(bk_003) 제외됨");
  ok(r.body.recommendations.every((x) => x.estimated_days <= 30) || r.body.notice, "목표 30일 내 완독 (또는 완화 고지)");
  ok(r.body.mode === "template", "키 없음 → 템플릿 모드 폴백");
  const genres = r.body.recommendations.map((x) => x.genres[0]);
  ok(new Set(genres).size >= 2 || genres.length < 3, "다양성: 동일 장르 3권 금지");
}

// 4) 극단 입력 — 하루 5분·목표 7일에도 3권 (완화 사다리)
{
  const r = await call(recommend, "POST", { body: { preferredGenres: ["과학"], mood: "몰입하고 싶어", dailyMinutes: 5, speed: "느림", targetDays: 7 } });
  ok(r.code === 200 && r.body.recommendations.length === 3 && r.body.notice, `극단 입력에도 3권 + 고지: "${r.body.notice}"`);
}

// 5) 도서 검색
{
  const r = await call(books, "GET", { query: { q: "아몬드" } });
  ok(r.body.results[0]?.id === "bk_002" && r.body.results[0].hasQuiz, "검색 '아몬드' → bk_002, 레이스 가능");
}

// 6) 레이스: 생성 → 참여 → 퀴즈 게이트
{
  const created = await call(room, "POST", { body: { action: "create", bookId: "bk_002", targetDays: 21, nickname: "지훈", deviceId: "dev-A" } });
  const code = created.body.code;
  ok(created.code === 200 && /^[A-Z2-9]{6}$/.test(code), `레이스 생성, 코드 ${code}`);

  const noQuiz = await call(room, "POST", { body: { action: "create", bookId: "bk_011", targetDays: 21, nickname: "지훈", deviceId: "dev-A" } });
  ok(noQuiz.code === 400, "퀴즈 없는 책(bk_011)은 레이스 생성 거부");

  const joined = await call(room, "POST", { body: { action: "join", code, nickname: "친구", deviceId: "dev-B" } });
  ok(joined.code === 200, "친구 참여 성공");
  const badJoin = await call(room, "POST", { body: { action: "join", code: "XXXXXX", nickname: "유령", deviceId: "dev-C" } });
  ok(badJoin.code === 404, "없는 코드 참여 거부");

  // 퀴즈 문항에 정답이 노출되지 않는지
  const served = await call(quiz, "GET", { query: { code, device: "dev-A" } });
  ok(served.body.checkpoint === 25 && served.body.questions.every((q) => !("answer" in q)), "25% 문항 제공, 정답 미노출");

  // 순서 건너뛰기 차단
  const skip = await call(quiz, "POST", { body: { code, deviceId: "dev-A", checkpoint: 50, answers: [] } });
  ok(skip.code === 400, "50% 건너뛰기 차단 (25%부터)");

  // 오답 → 실패, 진도 유지 + 시도 기록
  const wrongAnswers = QUIZZES.bk_002["25"].map((q) => ({ qid: q.id, choice: (q.answer + 1) % q.options.length }));
  const failRes = await call(quiz, "POST", { body: { code, deviceId: "dev-A", checkpoint: 25, answers: wrongAnswers } });
  ok(failRes.body.passed === false && failRes.body.new_pct === 0, "전부 오답 → 실패, 진도 0% 유지");

  // 정답 → 통과
  const rightAnswers = (cp) => QUIZZES.bk_002[String(cp)].map((q) => ({ qid: q.id, choice: q.answer }));
  const passRes = await call(quiz, "POST", { body: { code, deviceId: "dev-A", checkpoint: 25, answers: rightAnswers(25) } });
  ok(passRes.body.passed && passRes.body.new_pct === 25, "전부 정답 → 25% 도장");

  for (const cp of [50, 75, 100]) await call(quiz, "POST", { body: { code, deviceId: "dev-A", checkpoint: cp, answers: rightAnswers(cp) } });
  const state1 = await call(room, "GET", { query: { code, device: "dev-A" } });
  const me = state1.body.members.find((m) => m.is_me);
  ok(me.verified_pct === 100 && me.attempts === 5, `완주: 검증 100%, 시도 ${me.attempts}회(오답 1회 포함)`);
  ok(state1.body.members.every((m) => !("me_key" in m) && !("device_id" in m)), "다른 참가자 device_id 미노출(보안)");

  // 응원 + 노트
  await call(room, "POST", { body: { action: "cheer", code, toNick: "친구", emoji: "🔥", deviceId: "dev-A" } });
  await call(room, "POST", { body: { action: "note", code, deviceId: "dev-B", content: "곤이가 나오는 장면에서 한참 멈춰 있었다.", style: { color: "mint", sticker: "🌿" } } });
  const state2 = await call(room, "GET", { query: { code, device: "dev-B" } });
  ok(state2.body.cheers.length === 1 && state2.body.notes.length === 1, "응원 1건·노트 1건 저장");
  const outsider = await call(room, "POST", { body: { action: "note", code, deviceId: "dev-Z", content: "참가 안 했는데요", style: {} } });
  ok(outsider.code === 403, "비참가자 노트 차단");
}

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
