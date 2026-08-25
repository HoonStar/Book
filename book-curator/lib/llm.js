// lib/llm.js — LLM은 "확정된 결과에 대한 문장"만 생성 (기획안 원칙 R3)
// 키가 없거나 호출·검증에 실패하면 템플릿 폴백 → LLM 장애가 서비스 장애가 되지 않음 (기획안 4.6)
import { BOOKS } from "./engine.js";

const KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

export async function generateCopy(input, recs, nextUp) {
  const fallback = templateCopy(input, recs, nextUp);
  if (!KEY) return { ...fallback, mode: "template" };
  try {
    const payload = {
      user: { mood: input.mood, dailyMinutes: input.dailyMinutes, preferredGenres: input.preferredGenres },
      books: recs.map((r) => ({ id: r.book.id, title: r.book.title, author: r.book.author, genres: r.book.genres, themes: r.book.themes })),
      nextUp: nextUp ? { id: nextUp.book.id, title: nextUp.book.title, basis: nextUp.basis } : null,
    };
    const sys = [
      "너는 도서 추천 카피라이터다. 아래 JSON의 books 목록에 있는 책에 대해서만 문장을 쓴다.",
      "규칙: ① 목록에 없는 도서 제목 언급 금지 ② 결말·반전 스포일러 금지 ③ 쪽수·완독 기간 등 숫자 언급 금지(코드 담당)",
      "④ '당신은 ~한 사람' 식 단정 금지 ⑤ one_liner는 40자 이내 ⑥ why는 2문장 이내이며 사용자의 기분 또는 선호 장르를 반드시 1회 인용.",
      '출력(JSON만): {"items":[{"id":"bk_xxx","one_liner":"...","why":"..."}],"next_reason":"..."}',
    ].join("\n");
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model: MODEL, temperature: 0.7, response_format: { type: "json_object" },
        messages: [{ role: "system", content: sys }, { role: "user", content: JSON.stringify(payload) }],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}`);
    const data = await res.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
    const validated = validate(parsed, recs);
    if (!validated) throw new Error("validation failed");
    return { ...validated, next_reason: sanitize(parsed.next_reason) || fallback.next_reason, mode: "live" };
  } catch {
    return { ...fallback, mode: "template" };
  }
}

// 출력 검증 (기획안 5.4): 필수 필드·길이·목록 외 도서 언급 여부를 코드가 강제 검사
function validate(parsed, recs) {
  const items = parsed?.items;
  if (!Array.isArray(items)) return null;
  const allowedIds = new Set(recs.map((r) => r.book.id));
  const allowedTitles = recs.map((r) => r.book.title);
  const otherTitles = BOOKS.map((b) => b.title).filter((t) => !allowedTitles.some((a) => a.includes(t) || t.includes(a)));
  const out = {};
  for (const r of recs) {
    const it = items.find((x) => x.id === r.book.id);
    if (!it || !it.one_liner || !it.why) return null;
    const text = `${it.one_liner} ${it.why}`;
    if (otherTitles.some((t) => t.length >= 3 && text.includes(t))) return null; // 환각(목록 외 도서) 차단
    out[r.book.id] = { one_liner: sanitize(it.one_liner).slice(0, 60), why: sanitize(it.why).slice(0, 160) };
  }
  for (const id of Object.keys(out)) if (!allowedIds.has(id)) return null;
  return { items: out };
}
const sanitize = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

// 템플릿 폴백 — LLM 없이도 완전한 응답 (M2 단계에서 이것만으로 동작 확인)
function templateCopy(input, recs, nextUp) {
  const items = {};
  for (const r of recs) {
    const theme = r.book.themes?.[0] ? `'${r.book.themes[0]}'` : "지금 이 순간";
    items[r.book.id] = {
      one_liner: `${theme}을(를) 담은 ${r.book.genres[0]}`,
      why: `'${input.mood}' 기분과 선호 장르(${input.preferredGenres.join(", ")})에 맞춰 골랐어요.`,
    };
  }
  return {
    items,
    next_reason: nextUp ? `《${nextUp.basis}》가 잘 맞았다면 자연스럽게 이어 읽기 좋아요.` : "",
  };
}

// 검증 통과 퀴즈 후 격려 한 줄 (프리셋 — 범위 관리를 위해 LLM 미사용)
export const CHEER_PRESETS = ["🔥 페이스 미쳤다!", "📚 오늘도 한 장!", "🏃 곧 따라잡는다?", "👏 인증 축하!", "☕ 쉬엄쉬엄, 완독까지!", "🥇 1등 예약?"];
