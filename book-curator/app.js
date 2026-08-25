// app.js — 완독 레이스 프런트엔드
const GENRES = ["소설","자기계발","에세이","과학","역사","경제경영","인문","추리·스릴러"];
const MOODS = ["위로가 필요해","자극이 필요해","몰입하고 싶어","가볍게 쉬고 싶어","성장하고 싶어"];
const SPEEDS = ["느림","보통","빠름"];
const CHEERS = ["👏","🔥","🏃","📚","☕"];
const STICKERS = ["📖","🌙","🔥","🌿","💡","🫶"];
const COLORS = ["paper","mint","butter","rose"];

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));

// ── 로컬 상태 ──────────────────────────────────────────────
const state = {
  deviceId: localStorage.bcDevice || (localStorage.bcDevice = crypto.randomUUID()),
  nickname: localStorage.bcNick || "",
  roomCode: localStorage.bcRoom || "",
  recent: [],          // {id,title}
  unknownRecent: [],   // {genre}
  genres: new Set(), mood: null, speed: "보통",
  noteColor: "paper", noteSticker: "📖",
  pendingBook: null, room: null, pollTimer: null,
};

// ── 공통 유틸 ──────────────────────────────────────────────
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(t._h); t._h = setTimeout(() => (t.hidden = true), 2600);
}
async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.errors?.join(" ") || "요청에 실패했어요.");
  return data;
}

// ── 탭 ─────────────────────────────────────────────────────
$$(".tab").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
function showTab(name) {
  $$(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  $$(".panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${name}`));
  if (name === "race" || name === "shelf") refreshRoom();
}

// ── 추천 폼 구성 ────────────────────────────────────────────
function chip(label, pressed = false) {
  const b = document.createElement("button");
  b.type = "button"; b.className = "chip"; b.textContent = label; b.setAttribute("aria-pressed", pressed);
  return b;
}
GENRES.forEach((g) => {
  const c = chip(g);
  c.onclick = () => {
    if (state.genres.has(g)) state.genres.delete(g);
    else if (state.genres.size < 3) state.genres.add(g);
    else return toast("선호 장르는 3개까지예요.");
    c.setAttribute("aria-pressed", state.genres.has(g));
  };
  $("#genreChips").append(c);
});
MOODS.forEach((m) => {
  const c = chip(m);
  c.onclick = () => { state.mood = m; $$("#moodChips .chip").forEach((x) => x.setAttribute("aria-pressed", x === c)); };
  $("#moodChips").append(c);
});
SPEEDS.forEach((s) => {
  const c = chip(s, s === "보통");
  c.onclick = () => { state.speed = s; $$("#speedChips .chip").forEach((x) => x.setAttribute("aria-pressed", x === c)); };
  $("#speedChips").append(c);
});
GENRES.forEach((g) => $("#unknownGenre").append(new Option(g, g)));
$("#minutes").oninput = (e) => ($("#minOut").textContent = `${e.target.value}분`);
$("#targetDays").oninput = (e) => ($("#dayOut").textContent = `${e.target.value}일`);

// 최근 읽은 책 자동완성
let debounce;
$("#bookSearch").addEventListener("input", (e) => {
  clearTimeout(debounce);
  const q = e.target.value.trim();
  if (q.length < 1) return ($("#searchResults").hidden = true);
  debounce = setTimeout(async () => {
    const { results } = await api(`/api/books?q=${encodeURIComponent(q)}`);
    const box = $("#searchResults");
    box.innerHTML = results.length
      ? results.map((r, idx) => r.id
          ? `<button type="button" data-id="${r.id}" data-title="${esc(r.title)}">${esc(r.title)} <small>· ${esc(r.author)}</small>${r.hasQuiz ? '<span class="quiz-badge">레이스 가능</span>' : ""}</button>`
          : `<button type="button" data-ext="${idx}" data-title="${esc(r.title)}">${esc(r.title)} <small>· ${esc(r.author)}</small><span class="quiz-badge" style="border-color:var(--ink-soft);color:var(--ink-soft)">외부</span></button>`).join("")
      : `<button type="button" disabled>검색 결과가 없어요 — 아래 '목록에 없어요'를 눌러 주세요</button>`;
    box.hidden = false;
    $$("button[data-id]", box).forEach((b) => (b.onclick = () => addRecent(b.dataset.id, b.dataset.title)));
    $$("button[data-ext]", box).forEach((b) => (b.onclick = () => addExternal(b.dataset.title)));
  }, 220);
});
document.addEventListener("click", (e) => { if (!e.target.closest(".auto-wrap")) $("#searchResults").hidden = true; });
function addRecent(id, title) {
  if (state.recent.length + state.unknownRecent.length >= 3) return toast("최근 읽은 책은 3권까지예요.");
  if (state.recent.some((r) => r.id === id)) return;
  state.recent.push({ id, title });
  $("#bookSearch").value = ""; $("#searchResults").hidden = true;
  renderRecent();
}
function renderRecent() {
  const wrap = $("#recentChips"); wrap.innerHTML = "";
  state.recent.forEach((r, i) => {
    const c = chip(r.title); c.classList.add("removable"); c.innerHTML = `${esc(r.title)}<b>×</b>`;
    c.onclick = () => { state.recent.splice(i, 1); renderRecent(); };
    wrap.append(c);
  });
  state.unknownRecent.forEach((u, i) => {
    const c = chip(""); c.classList.add("removable");
    c.innerHTML = `${u.title ? esc(u.title) + " · " : "(목록 외) "}${esc(u.genre)}<b>×</b>`;
    c.onclick = () => { state.unknownRecent.splice(i, 1); renderRecent(); };
    wrap.append(c);
  });
}
function addExternal(title) {
  if (state.recent.length + state.unknownRecent.length >= 3) return toast("최근 읽은 책은 3권까지예요.");
  state.pendingExtTitle = title;
  $("#bookSearch").value = ""; $("#searchResults").hidden = true;
  $("#unknownForm").hidden = false;
  toast(`《${title}》은 외부 도서예요 — 장르를 골라 주시면 취향에 반영할게요.`);
}
$("#unknownBtn").onclick = () => { state.pendingExtTitle = null; $("#unknownForm").hidden = !$("#unknownForm").hidden; };
$("#unknownAdd").onclick = () => {
  if (state.recent.length + state.unknownRecent.length >= 3) return toast("최근 읽은 책은 3권까지예요.");
  state.unknownRecent.push({ genre: $("#unknownGenre").value, title: state.pendingExtTitle || null });
  state.pendingExtTitle = null;
  $("#unknownForm").hidden = true; renderRecent();
  toast("이 책은 장르 정보만 취향에 반영돼요.");
};

// ── 추천 실행 ──────────────────────────────────────────────
$("#recoForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#recoForm .primary"); btn.disabled = true; btn.textContent = "고르는 중…";
  try {
    const data = await api("/api/recommend", {
      method: "POST",
      body: JSON.stringify({
        recentBookIds: state.recent.map((r) => r.id),
        unknownRecent: state.unknownRecent,
        preferredGenres: [...state.genres],
        mood: state.mood,
        dailyMinutes: +$("#minutes").value,
        speed: state.speed,
        targetDays: +$("#targetDays").value,
      }),
    });
    renderReco(data);
  } catch (err) { toast(err.message); }
  btn.disabled = false; btn.textContent = "이번 달 안에 끝까지 읽을 3권 찾기";
});

function renderReco(data) {
  const n = $("#recoNotice");
  n.hidden = !data.notice; if (data.notice) n.textContent = data.notice;
  $("#recoResults").innerHTML = data.recommendations.map((r) => `
    <article class="card reco-card">
      <div class="reco-top">
        <div><div class="reco-title serif">${esc(r.title)}</div><div class="reco-author">${esc(r.author)} · ${r.genres.map(esc).join("·")} · ${r.pages}쪽</div></div>
        <span class="badge ${r.race_ready ? "" : "gray"}">${r.race_ready ? "레이스 가능" : "퀴즈 준비 중"}</span>
      </div>
      <p class="one-liner">${esc(r.one_liner)}</p>
      <p class="why">${esc(r.why)}</p>
      <div class="est-row"><span>완독 <b>D+${r.estimated_days}</b></span><span>하루 <b>${r.daily_pages}쪽</b></span><span>매칭 <b>${Math.round(r.match_score * 100)}점</b></span></div>
      <div class="score-bar"><i style="width:${Math.round(r.match_score * 100)}%"></i></div>
      <details class="detail"><summary>왜 이 책인가 (점수 근거)</summary>
        <div class="breakdown"><span>장르 ${r.breakdown.G}</span><span>기분 ${r.breakdown.M}</span><span>난이도 ${r.breakdown.D}</span><span>완독 적합 ${r.breakdown.F}</span></div>
      </details>
      ${r.race_ready ? `<div class="reco-actions"><button class="primary" data-race="${r.book_id}" data-title="${esc(r.title)}">이 책으로 완독 레이스 시작</button></div>` : ""}
    </article>`).join("") +
    (data.next_up ? `<div class="next-up">📚 <b>다음 책 예약:</b> 《${esc(data.next_up.title)}》 — ${esc(data.next_up.reason)}</div>` : "") +
    (data.mode === "template" ? `<div class="notice">지금은 기본 문구 모드예요. OPENAI_API_KEY를 설정하면 AI가 소개 문구를 써 줘요.</div>` : "");
  $$("button[data-race]").forEach((b) => (b.onclick = () => openRaceModal(b.dataset.race, b.dataset.title)));
}

// ── 레이스 시작/참여 ────────────────────────────────────────
function openRaceModal(bookId, title) {
  state.pendingBook = bookId;
  $("#raceModalBook").textContent = `《${title}》 · 목표 ${$("#targetDays").value}일`;
  $("#raceNick").value = state.nickname;
  $("#raceModal").showModal();
}
$("[data-close]").onclick = () => $("#raceModal").close();
$("#raceCreateBtn").onclick = async () => {
  try {
    const nickname = $("#raceNick").value.trim();
    const { code } = await api("/api/room", {
      method: "POST",
      body: JSON.stringify({ action: "create", bookId: state.pendingBook, targetDays: +$("#targetDays").value, nickname, deviceId: state.deviceId }),
    });
    saveRoom(code, nickname);
    $("#raceModal").close();
    showTab("race");
    toast(`레이스 개설! 초대 코드 ${code}`);
  } catch (err) { toast(err.message); }
};
$("#joinBtn").onclick = async () => {
  try {
    const code = $("#joinCode").value.trim().toUpperCase();
    const nickname = $("#joinNick").value.trim();
    await api("/api/room", { method: "POST", body: JSON.stringify({ action: "join", code, nickname, deviceId: state.deviceId }) });
    saveRoom(code, nickname);
    toast("레이스에 참여했어요!");
    refreshRoom();
  } catch (err) { toast(err.message); }
};
function saveRoom(code, nickname) {
  state.roomCode = code; state.nickname = nickname;
  localStorage.bcRoom = code; localStorage.bcNick = nickname;
}

// ── 레이스 보드 ─────────────────────────────────────────────
async function refreshRoom() {
  clearTimeout(state.pollTimer);
  if (!state.roomCode) return renderRaceEmpty();
  try {
    const data = await api(`/api/room?code=${state.roomCode}&device=${state.deviceId}`);
    state.room = data;
    renderBoard(data); renderShelf(data);
    state.pollTimer = setTimeout(refreshRoom, 8000);
  } catch {
    localStorage.removeItem("bcRoom"); state.roomCode = ""; renderRaceEmpty();
  }
}
function renderRaceEmpty() {
  $("#raceEmpty").hidden = false; $("#raceBoard").hidden = true;
  $("#shelfEmpty").hidden = false; $("#shelfBody").hidden = true;
  $("#joinNick").value = state.nickname;
}
function renderBoard(d) {
  $("#raceEmpty").hidden = true; $("#raceBoard").hidden = false;
  const me = d.members.find((m) => m.is_me);
  const next = me && me.verified_pct < 100 ? me.verified_pct + 25 : null;
  $("#raceBoard").innerHTML = `
    <div class="card race-head">
      <h2>《${esc(d.book.title)}》 완독 레이스</h2>
      <div class="meta">${esc(d.book.author)} · ${d.book.pages}쪽 · 목표 ${d.room.target_days}일 · ${d.members.length}명 참가</div>
      <div class="code-ticket"><span>초대 코드</span><code>${d.room.code}</code><button class="small ghost" id="copyCode">복사</button></div>
      ${next ? `<button class="primary big quiz-cta" id="quizBtn" style="margin-top:12px">📖 ${next}% 인증 퀴즈 풀기 (전부 맞혀야 도장!)</button>`
             : me ? `<p style="margin-top:12px;font-weight:700;color:var(--stamp)">🏆 완독 도장 4개 모두 획득!</p>` : ""}
    </div>
    ${d.members.map((m, i) => memberCard(m, i, d.checkpoints)).join("")}
    <div class="card feed"><h3>응원 피드</h3>${
      d.cheers.length ? d.cheers.slice(0, 6).map((c) => `<p>${esc(c.emoji)} <b>${esc(c.from_nick)}</b> → ${esc(c.to_nick)}</p>`).join("") : "<p>아직 응원이 없어요. 먼저 보내 볼까요?</p>"
    }</div>`;
  $("#copyCode").onclick = async () => { await navigator.clipboard.writeText(d.room.code); toast("초대 코드를 복사했어요."); };
  const qb = $("#quizBtn"); if (qb) qb.onclick = openQuiz;
  $$("button[data-cheer]").forEach((b) => (b.onclick = () => sendCheer(b.dataset.cheer, b.dataset.emoji)));
}
function memberCard(m, rank, cps) {
  return `
  <div class="card member">
    <div class="member-top">
      <span class="member-name">${rank === 0 && m.verified_pct > 0 ? '<span class="crown">👑</span> ' : ""}${esc(m.nickname)}${m.is_me ? '<span class="me">나</span>' : ""}</span>
      <span class="member-att">검증 ${m.verified_pct}% · 시도 ${m.attempts}회</span>
    </div>
    <div class="progress"><i style="width:${m.verified_pct}%"></i></div>
    <div class="stamps">${cps.map((c) => `<span class="stamp ${m.verified_pct >= c ? "hit" : ""}">${c}</span>`).join("")}</div>
    ${m.is_me ? "" : `<div class="cheer-row">${CHEERS.map((e) => `<button data-cheer="${esc(m.nickname)}" data-emoji="${e}">${e}</button>`).join("")}</div>`}
  </div>`;
}
async function sendCheer(toNick, emoji) {
  try {
    await api("/api/room", { method: "POST", body: JSON.stringify({ action: "cheer", code: state.roomCode, toNick, emoji, deviceId: state.deviceId }) });
    toast(`${emoji} ${toNick}님에게 응원을 보냈어요!`); refreshRoom();
  } catch (err) { toast(err.message); }
}

// ── 퀴즈 게이트 ─────────────────────────────────────────────
async function openQuiz() {
  try {
    const q = await api(`/api/quiz?code=${state.roomCode}&device=${state.deviceId}`);
    if (q.done) return toast("이미 완독 인증을 마쳤어요!");
    $("#quizBody").innerHTML = `
      <h3>${q.checkpoint}% 인증 퀴즈</h3>
      <p class="modal-book">《${esc(q.book)}》 · ${q.questions.length}문항 모두 맞혀야 도장이 찍혀요</p>
      ${q.questions.map((item, qi) => `
        <div class="q-block"><p>Q${qi + 1}. ${esc(item.q)}</p>
          ${item.options.map((o, oi) => `<label class="q-opt"><input type="radio" name="${item.id}" value="${oi}" required> ${esc(o)}</label>`).join("")}
        </div>`).join("")}
      <div class="modal-actions"><button class="ghost" id="quizCancel">닫기</button><button class="primary" id="quizSubmit">채점하기</button></div>`;
    $("#quizModal").showModal();
    $("#quizCancel").onclick = () => $("#quizModal").close();
    $("#quizSubmit").onclick = () => submitQuiz(q);
  } catch (err) { toast(err.message); }
}
async function submitQuiz(q) {
  const answers = q.questions.map((item) => {
    const sel = document.querySelector(`input[name="${item.id}"]:checked`);
    return { qid: item.id, choice: sel ? +sel.value : -1 };
  });
  if (answers.some((a) => a.choice < 0)) return toast("모든 문항에 답해 주세요.");
  try {
    const r = await api("/api/quiz", { method: "POST", body: JSON.stringify({ code: state.roomCode, deviceId: state.deviceId, checkpoint: q.checkpoint, answers }) });
    $("#quizBody").innerHTML = r.passed
      ? `<div class="quiz-result"><div class="big-stamp">${q.checkpoint}%</div>
           <h3>${r.finished ? `완독 인증! ${r.rank}등으로 결승선 통과 🏆` : "도장 획득!"}</h3>
           <p class="modal-book">${r.correct}/${r.total} 정답 — 진짜 읽고 계시네요.</p>
           <div class="modal-actions"><button class="primary" id="quizOk">레이스 보드로</button></div></div>`
      : `<div class="quiz-result"><div class="big-stamp fail">✕</div>
           <h3>아직이에요 (${r.correct}/${r.total})</h3>
           <p class="modal-book">조금 더 읽고 다시 도전! 시도 횟수는 기록돼요.</p>
           <div class="modal-actions"><button class="ghost" id="quizOk">닫기</button><button class="primary" id="quizRetry">다시 도전</button></div></div>`;
    $("#quizOk").onclick = () => { $("#quizModal").close(); refreshRoom(); };
    const retry = $("#quizRetry"); if (retry) retry.onclick = openQuiz;
  } catch (err) { toast(err.message); }
}

// ── 서재(노트) ─────────────────────────────────────────────
COLORS.forEach((c) => {
  const b = document.createElement("button");
  b.type = "button"; b.className = `swatch bg-${c}`; b.setAttribute("aria-pressed", c === state.noteColor);
  b.onclick = () => { state.noteColor = c; $$("#noteColors .swatch").forEach((x) => x.setAttribute("aria-pressed", x === b)); };
  $("#noteColors").append(b);
});
STICKERS.forEach((s) => {
  const b = document.createElement("button");
  b.type = "button"; b.className = "sticker"; b.textContent = s; b.setAttribute("aria-pressed", s === state.noteSticker);
  b.onclick = () => { state.noteSticker = s; $$("#noteStickers .sticker").forEach((x) => x.setAttribute("aria-pressed", x === b)); };
  $("#noteStickers").append(b);
});
$("#noteBtn").onclick = async () => {
  try {
    await api("/api/room", {
      method: "POST",
      body: JSON.stringify({ action: "note", code: state.roomCode, deviceId: state.deviceId, content: $("#noteText").value, style: { color: state.noteColor, sticker: state.noteSticker } }),
    });
    $("#noteText").value = ""; toast("노트를 붙였어요!"); refreshRoom();
  } catch (err) { toast(err.message); }
};
function renderShelf(d) {
  $("#shelfEmpty").hidden = true; $("#shelfBody").hidden = false;
  $("#noteList").innerHTML = d.notes.length
    ? d.notes.map((n) => `
      <div class="note bg-${esc(n.style?.color || "paper")}">
        <span class="stk">${esc(n.style?.sticker || "📖")}</span>
        <p>${esc(n.content)}</p>
        <div class="who serif">— ${esc(n.nickname)} · 《${esc(d.book.title)}》</div>
      </div>`).join("")
    : `<div class="empty-card"><p>아직 노트가 없어요. 첫 감상을 남겨 보세요!</p></div>`;
}

// ── 초기화 ─────────────────────────────────────────────────
if (state.roomCode) refreshRoom();
