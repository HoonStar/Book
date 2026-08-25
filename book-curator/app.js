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
  document.body.classList.toggle("my-active", name === "my");
  if (name === "race" || name === "shelf") refreshRoom();
  if (name === "my") requestAnimationFrame(updateMyIndicator);
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

// ── 나의 페이지 ────────────────────────────────────────────
const MY_LOG_KEY = "nextbookReadingLogs";
const MY_PROFILE_KEY = "nextbookProfile";
const MY_SETTINGS_KEY = "nextbookSettings";
const DEFAULT_LOGS = [
  { id:"sample-3", date:"2026-08-19", title:"아몬드", status:"완독", note:"감정을 이해하는 방식이 사람마다 얼마나 다른지 오래 생각하게 된 책." },
  { id:"sample-2", date:"2026-08-13", title:"코스모스", status:"읽는 중", note:"우주의 크기를 상상할수록 오늘의 고민이 조금 가벼워진다." },
  { id:"sample-1", date:"2026-08-04", title:"불편한 편의점", status:"완독", note:"평범한 친절이 한 사람의 하루를 바꿀 수 있다는 따뜻한 이야기." },
];
const MY_BOOKS = [
  { title:"삼체", author:"류츠신", tags:["과학","몰입"], saved:true },
  { title:"물고기는 존재하지 않는다", author:"룰루 밀러", tags:["과학","에세이"], saved:true },
  { title:"숨결이 바람 될 때", author:"폴 칼라니티", tags:["에세이","감동"], saved:true },
  { title:"우리가 빛의 속도로 갈 수 없다면", author:"김초엽", tags:["소설","사유"], saved:true },
];
const TASTE = [
  { name:"소설", pct:42, color:"#3F8DA6" }, { name:"과학", pct:28, color:"#8CDAFF" },
  { name:"에세이", pct:18, color:"#9273AE" }, { name:"인문", pct:12, color:"#D5C6A8" },
];
const INSIGHTS = [
  ["요즘의 취향","낯선 세계를 탐험하는 소설과 과학 이야기에 자주 손이 가요."],["집중 시간","저녁 20~30분 독서가 가장 꾸준하게 이어지고 있어요."],["다음 탐색 장르","과학적 상상력이 담긴 한국 SF를 한 권 더 만나보세요."],
  ["요즘의 취향","따뜻한 인물 서사와 생각할 거리를 함께 주는 책을 좋아해요."],["집중 시간","짧게라도 연속해서 읽을 때 완독 가능성이 높아져요."],["다음 탐색 장르","철학 에세이로 취향의 경계를 가볍게 넓혀보세요."],
];

const readStored = (key, fallback) => {
  try { const value = JSON.parse(localStorage.getItem(key)); return value ?? fallback; }
  catch { return fallback; }
};
const writeStored = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { toast("브라우저 저장 공간을 사용할 수 없어 현재 화면에만 유지돼요."); return false; }
};
const myState = {
  goal: Math.max(3, Math.min(20, Number(localStorage.nextbookMonthlyGoal) || 6)),
  logs: readStored(MY_LOG_KEY, []), logFilter:"전체", insightIndex:0,
  profile: readStored(MY_PROFILE_KEY, { name:"완독 탐험가", bio:"한 권씩, 나만의 속도로 읽어가고 있어요.", streak:12 }),
  settings: readStored(MY_SETTINGS_KEY, { personalize:true, reminder:false }),
  books: readStored("nextbookSavedBooks", MY_BOOKS),
};

function allLogs() { return [...myState.logs, ...DEFAULT_LOGS].sort((a,b) => String(b.date).localeCompare(String(a.date))); }
function completedBooks() { return Math.max(3, allLogs().filter((x) => x.status === "완독" && !String(x.id).startsWith("sample-")).length); }

function updateMyIndicator() {
  const nav = $(".my-subtabs"), active = $(".my-subtab.active"), bar = $("#myTabIndicator");
  if (!nav || !active || !bar) return;
  bar.style.left = `${active.offsetLeft}px`; bar.style.width = `${active.offsetWidth}px`;
}
function showMyView(name) {
  $$(".my-subtab").forEach((b) => {
    const active = b.dataset.myView === name; b.classList.toggle("active", active);
    active ? b.setAttribute("aria-current","page") : b.removeAttribute("aria-current");
  });
  $$(".my-view").forEach((v) => v.classList.toggle("active", v.id === `my-view-${name}`));
  updateMyIndicator();
  if (name === "logs") setTimeout(() => $("#logDate")?.focus(), 80);
}
$$('.my-subtab').forEach((b) => b.onclick = () => showMyView(b.dataset.myView));
window.addEventListener("resize", updateMyIndicator);

function renderQuest() {
  const done = Math.min(completedBooks(), myState.goal), pct = Math.round(done / myState.goal * 100), left = myState.goal - done;
  $("#questStamps").innerHTML = Array.from({length:myState.goal}, (_,i) => {
    const hit = i < done, goal = i === myState.goal - 1;
    return `<span class="quest-stamp ${hit ? "done" : ""} ${goal ? "goal" : ""}"><i>${hit ? "✓" : goal ? "목표" : "🔒"}</i><span>${i+1}권</span></span>`;
  }).join("");
  const complete = left === 0;
  let message = complete ? "🏆 목표를 모두 채웠어요!" : left === 1 ? "마지막 한 권만 남았어요!" : pct >= 50 ? "절반을 넘어 잘 가고 있어요!" : "첫 도장들이 멋지게 쌓이고 있어요!";
  $("#questRatio").textContent = `${done} / ${myState.goal}권`; $("#questPercent").textContent = `${pct}%`; $("#questMessage").textContent = message;
  $("#questSubmessage").textContent = complete ? "이번 달의 멋진 독서 여정을 완성했어요." : `${left}권 남았어요. 오늘 10분만 펼쳐볼까요?`;
  $("#questProgress i").style.width = `${pct}%`; $("#questProgress").setAttribute("aria-valuenow", pct);
  $(".quest-card").classList.toggle("complete", complete); $("#booksReadStat").textContent = `${done}권`;
  $("#goalDown").disabled = myState.goal <= done; $("#goalUp").disabled = myState.goal >= 20;
}
$("#goalDown").onclick = () => { const done = completedBooks(); if (myState.goal > done) { myState.goal--; localStorage.nextbookMonthlyGoal=myState.goal; renderQuest(); } };
$("#goalUp").onclick = () => { if (myState.goal < 20) { myState.goal++; localStorage.nextbookMonthlyGoal=myState.goal; renderQuest(); } };

function renderLogs() {
  const logs = allLogs(), visible = myState.logFilter === "전체" ? logs : logs.filter((x) => x.status === myState.logFilter);
  $("#logCount").textContent = `${logs.length}개의 기록`;
  $("#readingLogList").innerHTML = visible.length ? visible.map((x) => `<article class="my-card reading-log"><time datetime="${esc(x.date)}">${esc(x.date.replaceAll("-","."))}</time><div><h4>${esc(x.title)}</h4><p>${esc(x.note)}</p></div><span class="status-chip ${x.status === "읽는 중" ? "reading" : ""}">${esc(x.status)}</span></article>`).join("") : `<div class="empty-card"><p>이 조건에 맞는 기록이 아직 없어요.</p></div>`;
}
$("#logDate").value = new Date().toISOString().slice(0,10);
$("#logNote").oninput = (e) => $("#logCharCount").textContent = `${e.target.value.length} / 500`;
$("#readingLogForm").onsubmit = (e) => {
  e.preventDefault(); const date=$("#logDate").value, title=$("#logTitle").value.trim(), note=$("#logNote").value.trim(), status=$("#logStatus").value;
  if (!date || !title || !note) return toast("날짜, 제목, 감상을 모두 입력해 주세요.");
  myState.logs.unshift({id:crypto.randomUUID(),date,title,note,status}); writeStored(MY_LOG_KEY,myState.logs);
  e.target.reset(); $("#logDate").value=new Date().toISOString().slice(0,10); $("#logCharCount").textContent="0 / 500";
  myState.logFilter="전체"; $$("[data-log-filter]").forEach((b)=>b.classList.toggle("active",b.dataset.logFilter==="전체")); renderLogs(); renderQuest(); toast("독서 기록을 저장했어요.");
};
$$('[data-log-filter]').forEach((b) => b.onclick = () => { myState.logFilter=b.dataset.logFilter; $$('[data-log-filter]').forEach((x)=>x.classList.toggle("active",x===b)); renderLogs(); });

function renderTaste() {
  $("#genreBars").innerHTML = TASTE.map((g) => `<div><div class="genre-bar-head"><span>${g.name}</span><b>${g.pct}%</b></div><div class="genre-bar-track"><i style="width:${g.pct}%;background:${g.color}"></i></div></div>`).join("");
  const set = INSIGHTS[myState.insightIndex];
  $("#insightBody").innerHTML = `<div class="insight-list">${set.map((x)=>`<div class="insight-item"><b>${x[0]}</b><span>${x[1]}</span></div>`).join("")}</div>`;
  $("#insightTime").textContent = `마지막 분석 · ${new Date().toLocaleString("ko-KR",{month:"long",day:"numeric",hour:"2-digit",minute:"2-digit"})}`;
}
$("#refreshInsight").onclick = () => { myState.insightIndex=(myState.insightIndex+1)%INSIGHTS.length; renderTaste(); toast("새 독서 기록을 반영해 인사이트를 갱신했어요."); };

function renderSavedBooks() {
  $("#savedBookGrid").innerHTML = myState.books.map((b,i)=>`<article class="my-card saved-book" ${!b.saved ? 'hidden' : ''}><button class="save-toggle" data-save-index="${i}" type="button" aria-label="${esc(b.title)} 저장 해제">♥</button><div class="book-cover-art">${esc(b.title)}</div><h4>${esc(b.title)}</h4><p class="author">${esc(b.author)}</p><div class="book-tags">${b.tags.map((t)=>`<span>${esc(t)}</span>`).join("")}</div></article>`).join("");
  $$('[data-save-index]').forEach((btn)=>btn.onclick=()=>{ myState.books[+btn.dataset.saveIndex].saved=false; writeStored("nextbookSavedBooks",myState.books); renderSavedBooks(); toast("저장한 추천에서 제외했어요."); });
}
$("#showAllSaved").onclick = () => { showTab("reco"); window.scrollTo({top:0,behavior:"smooth"}); };

function renderProfile() {
  $("#myHeroName").textContent=myState.profile.name; $("#myHeroBio").textContent=myState.profile.bio; $("#streakStat").textContent=`${myState.profile.streak || 12}일`;
  $$('[data-setting]').forEach((b)=>b.setAttribute("aria-checked", String(Boolean(myState.settings[b.dataset.setting]))));
}
$("#profileEditBtn").onclick=()=>{ $("#profileName").value=myState.profile.name; $("#profileBio").value=myState.profile.bio; $("#profileModal").showModal(); };
$("#profileCancel").onclick=()=>$("#profileModal").close();
$("#profileForm").onsubmit=(e)=>{ e.preventDefault(); myState.profile={...myState.profile,name:$("#profileName").value.trim(),bio:$("#profileBio").value.trim()}; writeStored(MY_PROFILE_KEY,myState.profile); renderProfile(); $("#profileModal").close(); toast("프로필을 저장했어요."); };
$$('[data-setting]').forEach((b)=>b.onclick=()=>{ const k=b.dataset.setting; myState.settings[k]=!myState.settings[k]; b.setAttribute("aria-checked",String(myState.settings[k])); writeStored(MY_SETTINGS_KEY,myState.settings); });

renderQuest(); renderLogs(); renderTaste(); renderSavedBooks(); renderProfile(); updateMyIndicator();
