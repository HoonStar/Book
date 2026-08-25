// 카카오가 확정한 도서에 대해서만 소개 문장을 만듭니다.
// OpenAI 키가 없거나 응답 검증에 실패하면 안전한 템플릿 문장을 사용합니다.
const KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

export async function generateCopy(input, recommendations) {
  const fallback = templateCopy(input, recommendations);
  if (!KEY) return { ...fallback, mode: "template" };
  try {
    const payload = {
      user: {
        mood: input.mood,
        dailyMinutes: input.dailyMinutes,
        preferredGenres: input.preferredGenres,
      },
      books: recommendations.map(({ book }) => ({
        id: book.id,
        title: book.title,
        author: book.author,
        publisher: book.publisher,
        tags: book.genres,
      })),
    };
    const system = [
      "너는 도서 추천 카피라이터다. 제공된 books 배열에 있는 책에 대해서만 문장을 쓴다.",
      "목록에 없는 도서 제목, 쪽수, 결말, 반전을 언급하지 않는다.",
      "one_liner는 40자 이내, why는 2문장 이내로 쓴다.",
      '출력(JSON만): {"items":[{"id":"kakao:ISBN","one_liner":"...","why":"..."}]}',
    ].join("\n");
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.6,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify(payload) }],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`OpenAI ${response.status}`);
    const data = await response.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
    const items = validate(parsed, recommendations);
    if (!items) throw new Error("validation failed");
    return { items, mode: "live" };
  } catch {
    return { ...fallback, mode: "template" };
  }
}

function validate(parsed, recommendations) {
  if (!Array.isArray(parsed?.items)) return null;
  const output = {};
  for (const { book } of recommendations) {
    const item = parsed.items.find((candidate) => candidate.id === book.id);
    if (!item?.one_liner || !item?.why) return null;
    output[book.id] = {
      one_liner: sanitize(item.one_liner).slice(0, 60),
      why: sanitize(item.why).slice(0, 180),
    };
  }
  return output;
}

function templateCopy(input, recommendations) {
  const items = {};
  for (const { book } of recommendations) {
    const publisher = book.publisher ? `${book.publisher}에서 펴낸` : "카카오 도서 검색에서 찾은";
    items[book.id] = {
      one_liner: `${publisher} ${book.genres[0]} 추천`,
      why: `‘${input.mood}’ 기분과 선호 장르(${input.preferredGenres.join(", ")})를 바탕으로 카카오 도서 검색 결과에서 골랐어요.`,
    };
  }
  return { items };
}

const sanitize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

export const CHEER_PRESETS = ["🔥 페이스 좋아요!", "📚 오늘도 한 장!", "🏃 곧 따라잡아요!", "👏 진도 기록 축하!", "☕ 쉬엄쉬엄, 완독까지!"];
