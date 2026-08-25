// NextBook 프로젝트 고유 기능: 도서 DB 검색, 검증형 완독 레이스, 공유 서재, 나의 페이지
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]));

const CHEERS = ["👏", "🔥", "🏃", "📚", "☕"];
const STICKERS = ["📖", "🌙", "🔥", "🌿", "💡", "🫶"];
const COLORS = ["paper", "mint", "butter", "rose"];
const state = {
  deviceId: localStorage.bcDevice || (localStorage.bcDevice = crypto.randomUUID()),
  nickname: localStorage.bcNick || "",
  roomCode: localStorage.bcRoom || "",
  selectedBooks: [],
  noteColor: "paper",
  noteSticker: "📖",
  pendingBook: null,
  room: null,
  pollTimer: null,
  pendingTitle: "",
};
window.nextbookRecentIds = [];

function toast(message) {
  const node = $("#toast");
  if (!node) return;
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(node._timer);
  node._timer = setTimeout(() => node.classList.remove("show"), 2600);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.errors?.join(" ") || "요청에 실패했어요.");
  return data;
}

function showScreen(name) {
  const tab = $(`.nav-tab[data-screen="${name}"]`);
  if (tab) tab.click();
}

$$(".nav-tab[data-screen]").forEach((tab) => {
  tab.addEventListener("click", () => {
    if (tab.dataset.screen === "race" || tab.dataset.screen === "shelf") refreshRoom();
    if (tab.dataset.screen === "bookclub") openBookclub();
    if (tab.dataset.screen === "mypage") requestAnimationFrame(updateMyIndicator);
  });
});

// 도서 DB 자동완성
let searchTimer;
const recentInput = $("#recentBooks");
const suggestionBox = $("#recentBookSuggestions");
recentInput?.addEventListener("input", () => {
  clearTimeout(searchTimer);
  const query = recentInput.value.split(",").at(-1).trim();
  if (!query) {
    suggestionBox.hidden = true;
    return;
  }
  searchTimer = setTimeout(async () => {
    try {
      const { results = [] } = await api(`/api/books?q=${encodeURIComponent(query)}`);
      suggestionBox.innerHTML = results.length
        ? results.slice(0, 8).map((book) => `<button type="button" data-book-id="${esc(book.id || "")}" data-book-title="${esc(book.title)}"><span><b>${esc(book.title)}</b><small> · ${esc(book.author)}</small></span>${book.hasQuiz ? '<span class="raceable">레이스 가능</span>' : ""}</button>`).join("")
        : '<button type="button" disabled><span>검색 결과가 없어요. 입력한 제목은 장르 정보로 반영됩니다.</span></button>';
      suggestionBox.hidden = false;
    } catch {
      suggestionBox.hidden = true;
    }
  }, 220);
});
suggestionBox?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-book-id]");
  if (!button) return;
  if (state.selectedBooks.length >= 3) return toast("최근 읽은 책은 3권까지 선택할 수 있어요.");
  if (state.selectedBooks.some((book) => book.id === button.dataset.bookId)) return;
  state.selectedBooks.push({ id: button.dataset.bookId, title: button.dataset.bookTitle });
  window.nextbookRecentIds = state.selectedBooks.map((book) => book.id).filter(Boolean);
  recentInput.value = "";
  suggestionBox.hidden = true;
  renderSelectedBooks();
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".recent-search")) suggestionBox && (suggestionBox.hidden = true);
});
function renderSelectedBooks() {
  const wrap = $("#recentBookChips");
  if (!wrap) return;
  wrap.innerHTML = state.selectedBooks.map((book, index) => `<button type="button" data-selected-book="${index}">✓ ${esc(book.title)}　×</button>`).join("");
}
$("#recentBookChips")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-selected-book]");
  if (!button) return;
  state.selectedBooks.splice(Number(button.dataset.selectedBook), 1);
  window.nextbookRecentIds = state.selectedBooks.map((book) => book.id).filter(Boolean);
  renderSelectedBooks();
});

// 추천 카드에서 레이스 시작
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-race-book]");
  if (!button) return;
  state.pendingBook = button.dataset.raceBook;
  state.pendingTitle = button.dataset.raceTitle;
  $("#raceModalBook").textContent = `《${button.dataset.raceTitle}》 · 30일 완독 목표`;
  $("#raceNick").value = state.nickname;
  renderRaceClubOptions();
  $("#raceModal").showModal();
});
$("[data-close]")?.addEventListener("click", () => $("#raceModal").close());
$("#raceCreateBtn")?.addEventListener("click", async () => {
  try {
    const nickname = $("#raceNick").value.trim();
    const { code } = await api("/api/room", {
      method: "POST",
      body: JSON.stringify({
        action: "create",
        bookId: state.pendingBook,
        targetDays: 30,
        nickname,
        deviceId: state.deviceId,
      }),
    });
    saveRoom(code, nickname);
    const selectedClubId = $("#raceClubSelect")?.value;
    if (selectedClubId && clubState.user) {
      try {
        await clubApi("/api/bookclub", {
          method: "POST",
          body: JSON.stringify({ action: "link_race", clubId: selectedClubId, raceCode: code }),
        });
        await loadBookclubs(selectedClubId);
      } catch (error) {
        toast(`레이스는 만들었지만 BookClub 연결은 실패했어요: ${error.message}`);
      }
    }
    $("#raceModal").close();
    showScreen("race");
    toast(`레이스를 만들었어요. 초대 코드는 ${code}입니다.`);
    refreshRoom();
  } catch (error) {
    toast(error.message);
  }
});

$("#joinBtn")?.addEventListener("click", async () => {
  try {
    const code = $("#joinCode").value.trim().toUpperCase();
    const nickname = $("#joinNick").value.trim();
    await api("/api/room", {
      method: "POST",
      body: JSON.stringify({ action: "join", code, nickname, deviceId: state.deviceId }),
    });
    saveRoom(code, nickname);
    if (clubState.user) {
      try {
        await clubApi("/api/bookclub", {
          method: "POST",
          body: JSON.stringify({ action: "join", code, nickname }),
        });
        await loadBookclubs();
      } catch {
        // 북클럽에 연결되지 않은 일반 레이스 코드는 그대로 레이스에서만 사용합니다.
      }
    }
    toast("완독 레이스에 참여했어요.");
    refreshRoom();
  } catch (error) {
    toast(error.message);
  }
});

function saveRoom(code, nickname) {
  state.roomCode = code;
  state.nickname = nickname;
  localStorage.bcRoom = code;
  localStorage.bcNick = nickname;
}

async function refreshRoom() {
  clearTimeout(state.pollTimer);
  if (!state.roomCode) {
    renderRaceEmpty();
    return;
  }
  try {
    const data = await api(`/api/room?code=${encodeURIComponent(state.roomCode)}&device=${encodeURIComponent(state.deviceId)}`);
    state.room = data;
    renderBoard(data);
    renderShelf(data);
    if (document.body.dataset.screen === "race" || document.body.dataset.screen === "shelf") {
      state.pollTimer = setTimeout(refreshRoom, 8000);
    }
  } catch {
    localStorage.removeItem("bcRoom");
    state.roomCode = "";
    renderRaceEmpty();
  }
}

function renderRaceEmpty() {
  $("#raceEmpty").hidden = false;
  $("#raceBoard").hidden = true;
  $("#shelfEmpty").hidden = false;
  $("#shelfBody").hidden = true;
  $("#joinNick").value = state.nickname;
}

function renderBoard(data) {
  $("#raceEmpty").hidden = true;
  $("#raceBoard").hidden = false;
  const me = data.members.find((member) => member.is_me);
  const nextCheckpoint = me && me.verified_pct < 100 ? me.verified_pct + 25 : null;
  $("#raceBoard").innerHTML = `
    <div class="race-head-card">
      <h2>《${esc(data.book.title)}》 완독 레이스</h2>
      <div class="race-meta">${esc(data.book.author)} · ${data.book.pages}쪽 · 목표 ${data.room.target_days}일 · ${data.members.length}명 참가</div>
      <div class="code-ticket"><span>초대 코드</span><code>${data.room.code}</code><button class="project-ghost" id="copyCode" type="button">복사</button></div>
      ${nextCheckpoint
        ? `<button class="project-primary quiz-cta" id="quizBtn" type="button">📖 ${nextCheckpoint}% 인증 퀴즈 풀기</button>`
        : me ? '<p class="race-complete">🏆 완독 도장 4개를 모두 획득했어요!</p>' : ""}
    </div>
    ${data.members.map((member, index) => memberCard(member, index, data.checkpoints)).join("")}
    <div class="feed-card"><h3>응원 피드</h3>${data.cheers.length
      ? data.cheers.slice(0, 8).map((cheer) => `<p>${esc(cheer.emoji)} <b>${esc(cheer.from_nick)}</b> → ${esc(cheer.to_nick)}</p>`).join("")
      : "<p>아직 응원이 없어요. 먼저 응원을 보내 볼까요?</p>"}</div>`;
  $("#copyCode")?.addEventListener("click", async () => {
    await navigator.clipboard?.writeText(data.room.code);
    toast("초대 코드를 복사했어요.");
  });
  $("#quizBtn")?.addEventListener("click", openQuiz);
  $$("[data-cheer]").forEach((button) => {
    button.addEventListener("click", () => sendCheer(button.dataset.cheer, button.dataset.emoji));
  });
}

function memberCard(member, rank, checkpoints) {
  return `<div class="member-card">
    <div class="member-top">
      <span class="member-name">${rank === 0 && member.verified_pct > 0 ? "👑 " : ""}${esc(member.nickname)}${member.is_me ? '<span class="me">나</span>' : ""}</span>
      <span class="member-att">검증 ${member.verified_pct}% · 시도 ${member.attempts}회</span>
    </div>
    <div class="progress"><i style="width:${member.verified_pct}%"></i></div>
    <div class="stamps">${checkpoints.map((checkpoint) => `<span class="race-stamp ${member.verified_pct >= checkpoint ? "hit" : ""}">${checkpoint}</span>`).join("")}</div>
    ${member.is_me ? "" : `<div class="cheer-row">${CHEERS.map((emoji) => `<button data-cheer="${esc(member.nickname)}" data-emoji="${emoji}" type="button">${emoji}</button>`).join("")}</div>`}
  </div>`;
}

async function sendCheer(toNick, emoji) {
  try {
    await api("/api/room", {
      method: "POST",
      body: JSON.stringify({ action: "cheer", code: state.roomCode, toNick, emoji, deviceId: state.deviceId }),
    });
    toast(`${emoji} ${toNick}님에게 응원을 보냈어요.`);
    refreshRoom();
  } catch (error) {
    toast(error.message);
  }
}

async function openQuiz() {
  try {
    const quiz = await api(`/api/quiz?code=${encodeURIComponent(state.roomCode)}&device=${encodeURIComponent(state.deviceId)}`);
    if (quiz.done) return toast("이미 완독 인증을 마쳤어요.");
    $("#quizBody").innerHTML = `
      <h3>${quiz.checkpoint}% 인증 퀴즈</h3>
      <p class="dialog-copy">《${esc(quiz.book)}》 · 모든 문제를 맞혀야 도장이 찍혀요.</p>
      ${quiz.questions.map((item, index) => `<div class="q-block"><p>Q${index + 1}. ${esc(item.q)}</p>${item.options.map((option, optionIndex) => `<label class="q-opt"><input type="radio" name="${item.id}" value="${optionIndex}"> ${esc(option)}</label>`).join("")}</div>`).join("")}
      <div class="dialog-actions"><button class="project-ghost" id="quizCancel" type="button">닫기</button><button class="project-primary" id="quizSubmit" type="button">채점하기</button></div>`;
    $("#quizModal").showModal();
    $("#quizCancel").onclick = () => $("#quizModal").close();
    $("#quizSubmit").onclick = () => submitQuiz(quiz);
  } catch (error) {
    toast(error.message);
  }
}

async function submitQuiz(quiz) {
  const answers = quiz.questions.map((item) => {
    const choice = document.querySelector(`input[name="${item.id}"]:checked`);
    return { qid: item.id, choice: choice ? Number(choice.value) : -1 };
  });
  if (answers.some((answer) => answer.choice < 0)) return toast("모든 문항에 답해 주세요.");
  try {
    const result = await api("/api/quiz", {
      method: "POST",
      body: JSON.stringify({
        code: state.roomCode,
        deviceId: state.deviceId,
        checkpoint: quiz.checkpoint,
        answers,
      }),
    });
    $("#quizBody").innerHTML = result.passed
      ? `<div class="quiz-result"><div class="big-stamp">${quiz.checkpoint}%</div><h3>${result.finished ? `완독 인증! ${result.rank}등으로 결승선 통과 🏆` : "도장을 획득했어요!"}</h3><p class="dialog-copy">${result.correct}/${result.total} 정답</p><div class="dialog-actions"><button class="project-primary" id="quizOk" type="button">레이스 보드로</button></div></div>`
      : `<div class="quiz-result"><div class="big-stamp fail">✕</div><h3>아직이에요 (${result.correct}/${result.total})</h3><p class="dialog-copy">조금 더 읽고 다시 도전해 보세요.</p><div class="dialog-actions"><button class="project-ghost" id="quizOk" type="button">닫기</button><button class="project-primary" id="quizRetry" type="button">다시 도전</button></div></div>`;
    $("#quizOk").onclick = () => {
      $("#quizModal").close();
      refreshRoom();
    };
    $("#quizRetry")?.addEventListener("click", openQuiz);
  } catch (error) {
    toast(error.message);
  }
}

// 공유 서재
COLORS.forEach((color) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `swatch bg-${color}`;
  button.setAttribute("aria-label", `${color} 노트 색상`);
  button.setAttribute("aria-pressed", String(color === state.noteColor));
  button.addEventListener("click", () => {
    state.noteColor = color;
    $$("#noteColors .swatch").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
  });
  $("#noteColors")?.append(button);
});
STICKERS.forEach((sticker) => {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = sticker;
  button.setAttribute("aria-pressed", String(sticker === state.noteSticker));
  button.addEventListener("click", () => {
    state.noteSticker = sticker;
    $$("#noteStickers button").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
  });
  $("#noteStickers")?.append(button);
});
$("#noteBtn")?.addEventListener("click", async () => {
  try {
    await api("/api/room", {
      method: "POST",
      body: JSON.stringify({
        action: "note",
        code: state.roomCode,
        deviceId: state.deviceId,
        content: $("#noteText").value,
        style: { color: state.noteColor, sticker: state.noteSticker },
      }),
    });
    $("#noteText").value = "";
    toast("서재에 감상 노트를 붙였어요.");
    refreshRoom();
  } catch (error) {
    toast(error.message);
  }
});

function renderShelf(data) {
  $("#shelfEmpty").hidden = true;
  $("#shelfBody").hidden = false;
  $("#noteList").innerHTML = data.notes.length
    ? data.notes.map((note) => `<article class="note bg-${esc(note.style?.color || "paper")}"><span class="stk">${esc(note.style?.sticker || "📖")}</span><p>${esc(note.content)}</p><div class="who">— ${esc(note.nickname)} · 《${esc(data.book.title)}》</div></article>`).join("")
    : '<div class="race-empty"><p>아직 노트가 없어요. 첫 감상을 남겨 보세요.</p></div>';
}

// 마이페이지
const MY_LOG_KEY = "nextbookReadingLogs";
const MY_PROFILE_KEY = "nextbookProfile";
const MY_SETTINGS_KEY = "nextbookSettings";
const DEFAULT_LOGS = [
  { id: "sample-3", date: "2026-08-19", title: "아몬드", status: "완독", note: "감정을 이해하는 방식이 사람마다 얼마나 다른지 오래 생각하게 된 책." },
  { id: "sample-2", date: "2026-08-13", title: "코스모스", status: "읽는 중", note: "우주의 크기를 상상할수록 오늘의 고민이 조금 가벼워진다." },
  { id: "sample-1", date: "2026-08-04", title: "불편한 편의점", status: "완독", note: "평범한 친절이 한 사람의 하루를 바꿀 수 있다는 따뜻한 이야기." },
];
const DEFAULT_SAVED_BOOKS = [
  { title: "삼체", author: "류츠신", tags: ["과학", "몰입"], saved: true },
  { title: "물고기는 존재하지 않는다", author: "룰루 밀러", tags: ["과학", "에세이"], saved: true },
  { title: "숨결이 바람 될 때", author: "폴 칼라니티", tags: ["에세이", "감동"], saved: true },
  { title: "우리가 빛의 속도로 갈 수 없다면", author: "김초엽", tags: ["소설", "사유"], saved: true },
];
const TASTE = [
  { name: "소설", pct: 42, color: "#3f8da6" },
  { name: "과학", pct: 28, color: "#8cdaff" },
  { name: "에세이", pct: 18, color: "#9273ae" },
  { name: "인문", pct: 12, color: "#d5c6a8" },
];
const INSIGHTS = [
  [
    ["요즘의 취향", "낯선 세계를 탐험하는 소설과 과학 이야기에 자주 손이 가요."],
    ["집중 시간", "저녁 20~30분 독서가 가장 꾸준하게 이어지고 있어요."],
    ["다음 탐색 장르", "과학적 상상력이 담긴 한국 SF를 한 권 더 만나보세요."],
  ],
  [
    ["요즘의 취향", "따뜻한 인물 서사와 생각할 거리를 함께 주는 책을 좋아해요."],
    ["집중 시간", "짧게라도 연속해서 읽을 때 완독 가능성이 높아져요."],
    ["다음 탐색 장르", "철학 에세이로 취향의 경계를 가볍게 넓혀보세요."],
  ],
];

function readStored(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function writeStored(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    toast("브라우저 저장 공간을 사용할 수 없어 현재 화면에만 유지돼요.");
  }
}

const myState = {
  goal: Math.max(3, Math.min(20, Number(localStorage.nextbookMonthlyGoal) || 6)),
  logs: readStored(MY_LOG_KEY, []),
  logFilter: "전체",
  insightIndex: 0,
  profile: readStored(MY_PROFILE_KEY, { name: "완독 탐험가", bio: "한 권씩, 나만의 속도로 읽어가고 있어요.", streak: 12 }),
  settings: readStored(MY_SETTINGS_KEY, { personalize: true, reminder: false }),
  books: readStored("nextbookSavedBooks", DEFAULT_SAVED_BOOKS),
};
const allLogs = () => [...myState.logs, ...DEFAULT_LOGS].sort((a, b) => String(b.date).localeCompare(String(a.date)));
const completedBooks = () => Math.max(3, allLogs().filter((log) => log.status === "완독" && !String(log.id).startsWith("sample-")).length);

function updateMyIndicator() {
  const nav = $(".my-subtabs");
  const active = $(".my-subtab.active");
  const indicator = $("#myTabIndicator");
  if (!nav || !active || !indicator) return;
  indicator.style.left = `${active.offsetLeft}px`;
  indicator.style.width = `${active.offsetWidth}px`;
}
function showMyView(name) {
  $$(".my-subtab").forEach((button) => {
    const active = button.dataset.myView === name;
    button.classList.toggle("active", active);
    active ? button.setAttribute("aria-current", "page") : button.removeAttribute("aria-current");
  });
  $$(".my-view").forEach((view) => view.classList.toggle("active", view.id === `my-view-${name}`));
  updateMyIndicator();
  if (name === "logs") setTimeout(() => $("#myLogDate")?.focus(), 80);
}
$$(".my-subtab").forEach((button) => button.addEventListener("click", () => showMyView(button.dataset.myView)));
window.addEventListener("resize", updateMyIndicator);

function renderQuest() {
  const done = Math.min(completedBooks(), myState.goal);
  const percent = Math.round((done / myState.goal) * 100);
  const left = myState.goal - done;
  $("#questStamps").innerHTML = Array.from({ length: myState.goal }, (_, index) => {
    const hit = index < done;
    const goal = index === myState.goal - 1;
    return `<span class="quest-stamp ${hit ? "done" : ""} ${goal ? "goal" : ""}"><i>${hit ? "✓" : goal ? "목표" : "🔒"}</i><span>${index + 1}권</span></span>`;
  }).join("");
  const message = left === 0 ? "🏆 목표를 모두 채웠어요!" : left === 1 ? "마지막 한 권만 남았어요!" : percent >= 50 ? "절반을 넘어 잘 가고 있어요!" : "첫 도장들이 멋지게 쌓이고 있어요!";
  $("#questRatio").textContent = `${done} / ${myState.goal}권`;
  $("#questPercent").textContent = `${percent}%`;
  $("#questMessage").textContent = message;
  $("#questSubmessage").textContent = left === 0 ? "이번 달의 멋진 독서 여정을 완성했어요." : `${left}권 남았어요. 오늘 10분만 펼쳐볼까요?`;
  $("#questProgress i").style.width = `${percent}%`;
  $("#questProgress").setAttribute("aria-valuenow", percent);
  $("#booksReadStat").textContent = `${done}권`;
  $("#goalDown").disabled = myState.goal <= done;
  $("#goalUp").disabled = myState.goal >= 20;
}
$("#goalDown")?.addEventListener("click", () => {
  const done = completedBooks();
  if (myState.goal > done) {
    myState.goal -= 1;
    localStorage.nextbookMonthlyGoal = myState.goal;
    renderQuest();
  }
});
$("#goalUp")?.addEventListener("click", () => {
  if (myState.goal < 20) {
    myState.goal += 1;
    localStorage.nextbookMonthlyGoal = myState.goal;
    renderQuest();
  }
});

function renderMyLogs() {
  const logs = allLogs();
  const visible = myState.logFilter === "전체" ? logs : logs.filter((log) => log.status === myState.logFilter);
  $("#logCount").textContent = `${logs.length}개의 기록`;
  $("#readingLogList").innerHTML = visible.length
    ? visible.map((log) => `<article class="my-card reading-log"><time datetime="${esc(log.date)}">${esc(log.date.replaceAll("-", "."))}</time><div><h4>${esc(log.title)}</h4><p>${esc(log.note)}</p></div><span class="status-chip ${log.status === "읽는 중" ? "reading" : ""}">${esc(log.status)}</span></article>`).join("")
    : '<div class="my-card"><p class="muted">이 조건에 맞는 기록이 아직 없어요.</p></div>';
}
$("#myLogDate").value = new Date().toISOString().slice(0, 10);
$("#myLogNote")?.addEventListener("input", (event) => {
  $("#myLogCharCount").textContent = `${event.target.value.length} / 500`;
});
$("#readingLogForm")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const date = $("#myLogDate").value;
  const title = $("#myLogTitle").value.trim();
  const note = $("#myLogNote").value.trim();
  const status = $("#myLogStatus").value;
  if (!date || !title || !note) return toast("날짜, 제목, 감상을 모두 입력해 주세요.");
  myState.logs.unshift({ id: crypto.randomUUID(), date, title, note, status });
  writeStored(MY_LOG_KEY, myState.logs);
  event.target.reset();
  $("#myLogDate").value = new Date().toISOString().slice(0, 10);
  $("#myLogCharCount").textContent = "0 / 500";
  myState.logFilter = "전체";
  $$("[data-log-filter]").forEach((button) => button.classList.toggle("active", button.dataset.logFilter === "전체"));
  renderMyLogs();
  renderQuest();
  toast("독서 기록을 저장했어요.");
});
$$("[data-log-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    myState.logFilter = button.dataset.logFilter;
    $$("[data-log-filter]").forEach((item) => item.classList.toggle("active", item === button));
    renderMyLogs();
  });
});

function renderTaste() {
  $("#genreBars").innerHTML = TASTE.map((genre) => `<div><div class="genre-bar-head"><span>${genre.name}</span><b>${genre.pct}%</b></div><div class="genre-bar-track"><i style="width:${genre.pct}%;background:${genre.color}"></i></div></div>`).join("");
  const insight = INSIGHTS[myState.insightIndex];
  $("#insightBody").innerHTML = `<div class="insight-list">${insight.map((item) => `<div class="insight-item"><b>${item[0]}</b><span>${item[1]}</span></div>`).join("")}</div>`;
  $("#insightTime").textContent = `마지막 분석 · ${new Date().toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
}
$("#refreshInsight")?.addEventListener("click", () => {
  myState.insightIndex = (myState.insightIndex + 1) % INSIGHTS.length;
  renderTaste();
  toast("새 독서 기록을 반영해 인사이트를 갱신했어요.");
});

function renderSavedBooks() {
  $("#savedBookGrid").innerHTML = myState.books.map((book, index) => `<article class="my-card saved-book" ${book.saved ? "" : "hidden"}><button class="save-toggle" data-save-index="${index}" type="button" aria-label="${esc(book.title)} 저장 해제">♥</button><div class="book-cover-art">${esc(book.title)}</div><h4>${esc(book.title)}</h4><p class="author">${esc(book.author)}</p><div class="book-tags">${(book.tags || []).map((tag) => `<span>${esc(tag)}</span>`).join("")}</div></article>`).join("");
  $$("[data-save-index]").forEach((button) => {
    button.addEventListener("click", () => {
      myState.books[Number(button.dataset.saveIndex)].saved = false;
      writeStored("nextbookSavedBooks", myState.books);
      renderSavedBooks();
      toast("저장한 추천에서 제외했어요.");
    });
  });
}
$("#showAllSaved")?.addEventListener("click", () => showScreen("taste"));

function renderProfile() {
  $("#myHeroName").textContent = myState.profile.name;
  $("#myHeroBio").textContent = myState.profile.bio;
  $("#streakStat").textContent = `${myState.profile.streak || 12}일`;
  $$("[data-setting]").forEach((button) => button.setAttribute("aria-checked", String(Boolean(myState.settings[button.dataset.setting]))));
}
$("#profileEditBtn")?.addEventListener("click", () => {
  $("#profileName").value = myState.profile.name;
  $("#profileBio").value = myState.profile.bio;
  $("#profileModal").showModal();
});
$("#profileCancel")?.addEventListener("click", () => $("#profileModal").close());
$("#profileForm")?.addEventListener("submit", (event) => {
  event.preventDefault();
  myState.profile = { ...myState.profile, name: $("#profileName").value.trim(), bio: $("#profileBio").value.trim() };
  writeStored(MY_PROFILE_KEY, myState.profile);
  renderProfile();
  $("#profileModal").close();
  toast("프로필을 저장했어요.");
});
$$("[data-setting]").forEach((button) => {
  button.addEventListener("click", () => {
    const key = button.dataset.setting;
    myState.settings[key] = !myState.settings[key];
    button.setAttribute("aria-checked", String(myState.settings[key]));
    writeStored(MY_SETTINGS_KEY, myState.settings);
  });
});

// 현재 추천 결과를 마이페이지의 저장 목록과 연결
const recommendations = $("#recommendations");
if (recommendations) {
  new MutationObserver(() => {
    const books = $$(".book", recommendations).map((card) => ({
      title: $("h3", card)?.textContent.trim(),
      author: $(".author", card)?.textContent.trim(),
      tags: $$(".book-tags .chip", card).map((tag) => tag.textContent.trim()),
      bookId: $("[data-race-book]", card)?.dataset.raceBook || "",
      raceReady: Boolean($("[data-race-book]", card)),
      saved: true,
    })).filter((book) => book.title);
    if (!books.length) return;
    const existing = new Map(myState.books.map((book) => [book.title, book]));
    books.forEach((book) => existing.set(book.title, { ...existing.get(book.title), ...book, saved: true }));
    myState.books = [...existing.values()].slice(0, 12);
    writeStored("nextbookSavedBooks", myState.books);
    renderSavedBooks();
    decorateRecommendationCards();
  }).observe(recommendations, { childList: true });
}

renderQuest();
renderMyLogs();
renderTaste();
renderSavedBooks();
renderProfile();
updateMyIndicator();
if (state.roomCode) refreshRoom();
else renderRaceEmpty();


// Supabase Auth + BookClub
const SUPABASE_URL = "https://kuupzmckvygidtaqelvp.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_ccnOFv5ihZCo93LkdblhXw_9WBqUKAv";
const authClient = window.supabase?.createClient
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  : null;
const clubState = {
  user: null,
  session: null,
  clubs: [],
  activeId: null,
  detail: null,
  tab: "books",
  authMode: "login",
};

function showAuthMessage(message, type = "info") {
  const node = $("#authMessage");
  node.textContent = message;
  node.classList.toggle("error", type === "error");
  node.hidden = false;
}

function setAuthMode(mode) {
  clubState.authMode = mode;
  const signup = mode === "signup";
  const forgot = mode === "forgot";
  const recovery = mode === "recovery";
  $("#authTitle").textContent = signup ? "회원가입" : forgot ? "비밀번호 찾기" : recovery ? "새 비밀번호 설정" : "로그인";
  $("#authDescription").textContent = signup
    ? "이메일과 비밀번호만으로 바로 시작할 수 있어요."
    : forgot
      ? "가입한 이메일로 비밀번호 재설정 링크를 보내드려요."
      : recovery
        ? "앞으로 사용할 새 비밀번호를 입력해 주세요."
        : "가입한 이메일과 비밀번호를 입력하세요.";
  $("#authEmailField").hidden = recovery;
  $("#authPasswordField").hidden = forgot;
  $("#authConfirmField").hidden = !(signup || recovery);
  $("#forgotPassword").hidden = mode !== "login";
  $("#authSubmit").textContent = signup ? "회원가입" : forgot ? "재설정 메일 보내기" : recovery ? "비밀번호 변경" : "로그인";
  $("#authSwitch").textContent = mode === "login" ? "처음이라면 회원가입" : "로그인으로 돌아가기";
  $("#authSwitch").hidden = recovery;
  $("#authEmail").required = !recovery;
  $("#authPassword").required = !forgot;
  $("#authConfirmPassword").required = signup || recovery;
  $("#authPassword").autocomplete = signup || recovery ? "new-password" : "current-password";
  $("#authMessage").hidden = true;
}

function openAuth(mode = "login") {
  if (!authClient) return toast("로그인 모듈을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.");
  setAuthMode(mode);
  $("#authForm").reset();
  $("#authModal").showModal();
  setTimeout(() => $(mode === "recovery" ? "#authPassword" : "#authEmail")?.focus(), 30);
}
function closeAuth() {
  $("#authModal").close();
  $("#authForm").reset();
  $("#authMessage").hidden = true;
}

function authValues() {
  const email = $("#authEmail").value.trim();
  const password = $("#authPassword").value;
  const confirmPassword = $("#authConfirmPassword").value;
  if (clubState.authMode !== "recovery" && !email) {
    showAuthMessage("이메일을 입력해 주세요.", "error");
    return null;
  }
  if (clubState.authMode !== "forgot" && password.length < 8) {
    showAuthMessage("비밀번호는 8자 이상 입력해 주세요.", "error");
    return null;
  }
  if ((clubState.authMode === "signup" || clubState.authMode === "recovery") && password !== confirmPassword) {
    showAuthMessage("비밀번호 확인이 일치하지 않아요.", "error");
    return null;
  }
  return { email, password };
}

async function submitAuth() {
  const values = authValues();
  if (!values) return;
  const button = $("#authSubmit");
  button.disabled = true;
  try {
    if (clubState.authMode === "login") {
      const { data, error } = await authClient.auth.signInWithPassword(values);
      if (error) throw new Error("이메일 또는 비밀번호가 올바르지 않아요.");
      clubState.user = data.user;
      clubState.session = data.session;
      closeAuth();
      toast("로그인했어요.");
      await loadBookclubs();
    } else if (clubState.authMode === "signup") {
      const { data, error } = await authClient.auth.signUp({
        ...values,
        options: { emailRedirectTo: location.origin },
      });
      if (error) throw error;
      if (!data.session) {
        showAuthMessage("확인 메일을 보냈어요. 이메일 인증 후 로그인해 주세요.");
      } else {
        clubState.user = data.user;
        clubState.session = data.session;
        closeAuth();
        toast("회원가입이 완료됐어요.");
        await loadBookclubs();
      }
    } else if (clubState.authMode === "forgot") {
      const { error } = await authClient.auth.resetPasswordForEmail(values.email, { redirectTo: location.origin });
      if (error) throw error;
      showAuthMessage("비밀번호 재설정 메일을 보냈어요.");
    } else {
      const { error } = await authClient.auth.updateUser({ password: values.password });
      if (error) throw error;
      closeAuth();
      toast("비밀번호를 변경했어요.");
    }
  } catch (error) {
    const message = String(error.message || "");
    if (/rate|security/i.test(message)) showAuthMessage("요청이 잠시 제한됐어요. 잠시 후 다시 시도해 주세요.", "error");
    else if (/already|registered/i.test(message)) showAuthMessage("이미 사용 중인 이메일이에요. 로그인해 주세요.", "error");
    else showAuthMessage(message || "로그인 처리에 실패했어요.", "error");
  } finally {
    button.disabled = false;
  }
}

function updateAuthUI() {
  const loggedIn = Boolean(clubState.user);
  $("#authButton").textContent = loggedIn ? (clubState.user.email || "내 계정") : "로그인";
  $("#signupButton").textContent = loggedIn ? "로그아웃" : "회원가입";
  $("#bookclubGate").hidden = loggedIn;
  if (!loggedIn) {
    $("#bookclubSetup").hidden = true;
    $("#bookclubContent").hidden = true;
  }
  const nickname = loggedIn ? (clubState.user.user_metadata?.display_name || clubState.user.email?.split("@")[0] || "") : "";
  if ($("#clubCreateNickname") && !$("#clubCreateNickname").value) $("#clubCreateNickname").value = nickname;
  if ($("#clubJoinNickname") && !$("#clubJoinNickname").value) $("#clubJoinNickname").value = nickname;
  renderRaceClubOptions();
}

async function clubApi(path, options = {}) {
  const session = clubState.session || (await authClient?.auth.getSession()).data?.session;
  if (!session?.access_token) {
    const error = new Error("로그인이 필요해요.");
    error.status = 401;
    throw error;
  }
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "북클럽 요청에 실패했어요.");
    error.status = response.status;
    throw error;
  }
  return data;
}

async function openBookclub() {
  if (!clubState.user) {
    openAuth("login");
    return;
  }
  await loadBookclubs(clubState.activeId);
}

async function loadBookclubs(preferredId = null) {
  if (!clubState.user) return;
  try {
    const { clubs } = await clubApi("/api/bookclub?action=list");
    clubState.clubs = clubs || [];
    const ids = clubState.clubs.map((club) => club.id);
    clubState.activeId = ids.includes(preferredId) ? preferredId : ids.includes(clubState.activeId) ? clubState.activeId : ids[0] || null;
    if (clubState.activeId) {
      clubState.detail = await clubApi(`/api/bookclub?action=detail&clubId=${encodeURIComponent(clubState.activeId)}`);
    } else {
      clubState.detail = null;
    }
    renderBookclub();
    renderRaceClubOptions();
  } catch (error) {
    if (error.status === 401) openAuth("login");
    else toast(error.message);
  }
}

function renderBookclub() {
  updateAuthUI();
  if (!clubState.user) return;
  const hasClubs = clubState.clubs.length > 0;
  $("#bookclubSetup").hidden = hasClubs;
  $("#bookclubContent").hidden = !hasClubs;
  if (!hasClubs) return;
  const data = clubState.detail;
  if (!data) return;
  const { club, books, votes, members, active_race: activeRace } = data;
  const month = `${new Date().toISOString().slice(0, 7)}-01`;
  const monthlyVotes = votes.filter((vote) => vote.vote_month === month);
  const counts = {};
  monthlyVotes.forEach((vote) => { counts[vote.club_book_id] = (counts[vote.club_book_id] || 0) + 1; });
  const owner = club.role === "owner";

  $("#bookclubContent").innerHTML = `
    <div class="club-shell">
      <aside class="club-sidebar">
        <div class="club-sidebar-head"><h3>내 BookClub</h3><button class="project-ghost" id="newClubBtn" type="button">+ 새 클럽</button></div>
        <div class="club-list">${clubState.clubs.map((item) => `
          <button class="club-item ${item.id === club.id ? "active" : ""}" data-club-select="${item.id}" type="button">
            <strong>${esc(item.name)}</strong><small>${esc(item.description || "함께 읽는 책 모임")}</small>
          </button>`).join("")}</div>
        <div class="club-code-box">
          <div class="club-code-label">북클럽 초대 코드</div>
          <div class="club-code-row"><code class="club-code">${club.invite_code}</code><button class="project-ghost" data-copy-club="${club.invite_code}" type="button">복사</button></div>
          <div class="club-code-help">이 코드로 BookClub에 참여할 수 있어요. 연결된 레이스 코드도 같은 참여 창에서 사용할 수 있습니다.</div>
        </div>
        <div class="club-sidebar-actions">
          <button class="project-ghost" id="clubMembersBtn" type="button">멤버 ${members.length}명</button>
          ${owner ? '<button class="project-ghost" id="editClubBtn" type="button">수정</button><button class="project-ghost" id="deleteClubBtn" type="button">삭제</button>' : ""}
        </div>
      </aside>
      <div class="club-main">
        <div class="club-main-head"><div><h3>${esc(club.name)}</h3><p>${esc(club.description || "함께 읽을 책을 골라보세요.")}</p></div><button class="project-primary" id="shareClubBookBtn" type="button">책 공유하기</button></div>
        ${renderClubRace(activeRace, owner)}
        <div class="club-tabs"><button class="club-tab ${clubState.tab === "books" ? "active" : ""}" data-club-tab="books" type="button">공유 도서</button><button class="club-tab ${clubState.tab === "vote" ? "active" : ""}" data-club-tab="vote" type="button">이번 달 투표</button></div>
        <div id="clubTabContent">${clubState.tab === "books" ? clubBookFeed(books, counts) : clubVoteFeed(books, counts, monthlyVotes)}</div>
      </div>
    </div>`;

  wireClubDetail();
}

function renderClubRace(activeRace, owner) {
  if (activeRace) {
    return `<article class="club-race-card"><div class="club-race-head"><div><h4>🏁 진행 중인 완독 레이스</h4><p>《${esc(activeRace.book.title)}》 · 목표 ${activeRace.target_days}일</p></div><code class="club-code">${activeRace.code}</code></div><div class="club-race-actions"><button class="project-primary" data-join-club-race="${activeRace.code}" type="button">이 레이스 참여</button><button class="project-ghost" data-copy-club="${activeRace.code}" type="button">레이스 코드 복사</button></div></article>`;
  }
  if (owner && state.roomCode) {
    return `<article class="club-race-card"><div class="club-race-head"><div><h4>현재 레이스를 연결할까요?</h4><p>${state.roomCode} 코드를 이 BookClub에서도 함께 사용합니다.</p></div></div><div class="club-race-actions"><button class="project-primary" id="linkCurrentRaceBtn" type="button">현재 레이스 연결</button></div></article>`;
  }
  return `<article class="club-race-card"><div class="club-race-head"><div><h4>아직 연결된 완독 레이스가 없어요</h4><p>추천 도서로 레이스를 만들 때 이 BookClub을 선택할 수 있어요.</p></div></div></article>`;
}

function clubBookFeed(books, counts) {
  if (!books.length) return '<div class="club-empty">아직 공유된 도서가 없어요. 첫 책을 공유해 보세요.</div>';
  return `<div class="club-feed">${books.map((book) => `<article class="club-book"><div class="club-book-head"><div><h4>${esc(book.title)}</h4><div class="author">${esc(book.author)}</div></div><span class="club-vote-count">${counts[book.id] || 0}표</span></div><p class="reason">${esc(book.reason || "함께 읽고 싶은 책으로 공유됐어요.")}</p><div class="club-book-meta"><span>${book.race_ready ? "🏁 레이스 가능" : "함께 읽기 추천"}</span><span>${new Date(book.created_at).toLocaleDateString("ko-KR")}</span></div></article>`).join("")}</div>`;
}

function clubVoteFeed(books, counts, monthlyVotes) {
  if (!books.length) return '<div class="club-empty">공유 도서가 있어야 투표할 수 있어요.</div>';
  const mine = monthlyVotes.find((vote) => vote.mine)?.club_book_id;
  return `<div class="club-feed">${[...books].sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0)).map((book) => `<article class="club-book"><div class="club-book-head"><div><h4>${esc(book.title)}</h4><div class="author">${esc(book.author)}</div></div><strong class="club-vote-count">${counts[book.id] || 0}표</strong></div><button class="project-ghost club-vote-btn" data-vote-book="${book.id}" type="button">${mine === book.id ? "✓ 나의 선택" : mine ? "이 책으로 변경" : "이 책에 투표"}</button></article>`).join("")}</div>`;
}

function wireClubDetail() {
  $$("[data-club-select]").forEach((button) => button.addEventListener("click", async () => {
    clubState.activeId = button.dataset.clubSelect;
    await loadBookclubs(clubState.activeId);
  }));
  $$("[data-club-tab]").forEach((button) => button.addEventListener("click", () => {
    clubState.tab = button.dataset.clubTab;
    renderBookclub();
  }));
  $$("[data-copy-club]").forEach((button) => button.addEventListener("click", async () => {
    await navigator.clipboard?.writeText(button.dataset.copyClub);
    toast("초대 코드를 복사했어요.");
  }));
  $$("[data-vote-book]").forEach((button) => button.addEventListener("click", async () => {
    try {
      await clubApi("/api/bookclub", { method: "POST", body: JSON.stringify({ action: "vote", clubId: clubState.activeId, clubBookId: button.dataset.voteBook }) });
      toast("이번 달 투표를 저장했어요.");
      await loadBookclubs(clubState.activeId);
    } catch (error) { toast(error.message); }
  }));
  $$("[data-join-club-race]").forEach((button) => button.addEventListener("click", () => joinLinkedRace(button.dataset.joinClubRace)));
  $("#shareClubBookBtn")?.addEventListener("click", () => openShareBookDialog());
  $("#clubMembersBtn")?.addEventListener("click", showClubMembers);
  $("#newClubBtn")?.addEventListener("click", () => {
    $("#bookclubSetup").hidden = false;
    $("#bookclubContent").hidden = true;
    $("#clubName").focus();
  });
  $("#editClubBtn")?.addEventListener("click", openEditClubDialog);
  $("#deleteClubBtn")?.addEventListener("click", deleteActiveClub);
  $("#linkCurrentRaceBtn")?.addEventListener("click", () => linkRaceToClub(clubState.activeId, state.roomCode));
}

async function joinLinkedRace(code) {
  const nickname = clubState.detail?.club?.nickname || state.nickname || clubState.user?.email?.split("@")[0] || "독서가";
  try {
    await api("/api/room", { method: "POST", body: JSON.stringify({ action: "join", code, nickname, deviceId: state.deviceId }) });
    saveRoom(code, nickname);
    await loadBookclubs(clubState.activeId);
    toast("BookClub의 완독 레이스에 참여했어요.");
    showScreen("race");
    refreshRoom();
  } catch (error) { toast(error.message); }
}

async function linkRaceToClub(clubId, raceCode) {
  if (!clubId || !raceCode) return;
  try {
    await clubApi("/api/bookclub", { method: "POST", body: JSON.stringify({ action: "link_race", clubId, raceCode }) });
    toast("완독 레이스와 BookClub을 연결했어요.");
    await loadBookclubs(clubId);
  } catch (error) { toast(error.message); }
}

function openShareBookDialog(preset = {}) {
  if (!clubState.user) return openAuth("login");
  if (!clubState.clubs.length) {
    showScreen("bookclub");
    renderBookclub();
    return toast("먼저 BookClub을 만들어 주세요.");
  }
  const body = $("#clubActionBody");
  body.innerHTML = `<form id="shareClubBookForm"><h3>BookClub에 책 공유</h3><p class="dialog-copy">팀원과 함께 읽고 싶은 이유를 남겨보세요.</p><label>공유할 BookClub<select id="shareClubId">${clubState.clubs.map((club) => `<option value="${club.id}" ${club.id === clubState.activeId ? "selected" : ""}>${esc(club.name)}</option>`).join("")}</select></label><label>책 제목<input id="shareClubTitle" type="text" maxlength="120" value="${esc(preset.title || "")}" required /></label><label>저자<input id="shareClubAuthor" type="text" maxlength="120" value="${esc(preset.author || "")}" /></label><label>한 줄평<textarea id="shareClubReason" maxlength="500" placeholder="왜 함께 읽고 싶은가요?">${esc(preset.reason || "")}</textarea></label><div class="dialog-actions"><button class="project-ghost" id="cancelClubAction" type="button">취소</button><button class="project-primary" type="submit">공유하기</button></div></form>`;
  const form = $("#shareClubBookForm");
  form.dataset.bookId = preset.bookId || "";
  form.dataset.raceReady = String(Boolean(preset.raceReady));
  $("#cancelClubAction").onclick = () => $("#clubActionModal").close();
  form.onsubmit = async (event) => {
    event.preventDefault();
    try {
      await clubApi("/api/bookclub", {
        method: "POST",
        body: JSON.stringify({
          action: "share_book",
          clubId: $("#shareClubId").value,
          title: $("#shareClubTitle").value,
          author: $("#shareClubAuthor").value,
          reason: $("#shareClubReason").value,
          bookId: form.dataset.bookId,
          raceReady: form.dataset.raceReady === "true",
        }),
      });
      clubState.activeId = $("#shareClubId").value;
      $("#clubActionModal").close();
      toast("BookClub에 책을 공유했어요.");
      await loadBookclubs(clubState.activeId);
    } catch (error) { toast(error.message); }
  };
  $("#clubActionModal").showModal();
}

function showClubMembers() {
  const members = clubState.detail?.members || [];
  $("#clubActionBody").innerHTML = `<h3>${esc(clubState.detail.club.name)} 멤버</h3><div class="club-modal-list">${members.map((member, index) => `<div class="club-member-row"><strong>${member.role === "owner" ? "👑 " : ""}${esc(member.nickname || `멤버 ${index + 1}`)}</strong><span>${member.role === "owner" ? "클럽장" : "멤버"}</span></div>`).join("")}</div><div class="dialog-actions"><button class="project-primary" id="closeClubAction" type="button">닫기</button></div>`;
  $("#closeClubAction").onclick = () => $("#clubActionModal").close();
  $("#clubActionModal").showModal();
}

function openEditClubDialog() {
  const club = clubState.detail.club;
  $("#clubActionBody").innerHTML = `<form id="editClubForm"><h3>BookClub 수정</h3><label>클럽 이름<input id="editClubName" type="text" maxlength="60" value="${esc(club.name)}" required /></label><label>클럽 설명<input id="editClubDescription" type="text" maxlength="240" value="${esc(club.description)}" /></label><div class="dialog-actions"><button class="project-ghost" id="cancelClubAction" type="button">취소</button><button class="project-primary" type="submit">저장</button></div></form>`;
  $("#cancelClubAction").onclick = () => $("#clubActionModal").close();
  $("#editClubForm").onsubmit = async (event) => {
    event.preventDefault();
    try {
      await clubApi("/api/bookclub", { method: "POST", body: JSON.stringify({ action: "update", clubId: club.id, name: $("#editClubName").value, description: $("#editClubDescription").value }) });
      $("#clubActionModal").close();
      toast("BookClub 정보를 수정했어요.");
      await loadBookclubs(club.id);
    } catch (error) { toast(error.message); }
  };
  $("#clubActionModal").showModal();
}

async function deleteActiveClub() {
  const club = clubState.detail.club;
  if (!confirm(`‘${club.name}’ BookClub을 삭제할까요? 공유 도서와 투표도 함께 삭제됩니다.`)) return;
  try {
    await clubApi("/api/bookclub", { method: "POST", body: JSON.stringify({ action: "delete", clubId: club.id }) });
    clubState.activeId = null;
    toast("BookClub을 삭제했어요.");
    await loadBookclubs();
  } catch (error) { toast(error.message); }
}

function decorateRecommendationCards() {
  $$(".book", recommendations).forEach((card) => {
    if ($(".recommend-club-share", card)) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "recommend-club-share";
    button.textContent = "✦ BookClub에 공유";
    button.addEventListener("click", () => openShareBookDialog({
      title: $("h3", card)?.textContent.trim(),
      author: $(".author", card)?.textContent.trim(),
      reason: $(".intro", card)?.textContent.trim(),
      bookId: $("[data-race-book]", card)?.dataset.raceBook || "",
      raceReady: Boolean($("[data-race-book]", card)),
    }));
    card.append(button);
  });
}

function renderRaceClubOptions() {
  const field = $("#raceClubField");
  const select = $("#raceClubSelect");
  if (!field || !select) return;
  const owned = clubState?.clubs?.filter((club) => club.role === "owner") || [];
  field.hidden = !clubState?.user || !owned.length;
  select.innerHTML = '<option value="">연결하지 않음</option>' + owned.map((club) => `<option value="${club.id}">${esc(club.name)}</option>`).join("");
}

$("#createClubForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const { club } = await clubApi("/api/bookclub", {
      method: "POST",
      body: JSON.stringify({
        action: "create",
        name: $("#clubName").value,
        description: $("#clubDescription").value,
        nickname: $("#clubCreateNickname").value,
      }),
    });
    event.target.reset();
    clubState.activeId = club.id;
    toast(`BookClub을 만들었어요. 초대 코드는 ${club.invite_code}입니다.`);
    await loadBookclubs(club.id);
  } catch (error) { toast(error.message); }
});

$("#joinClubForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = $("#clubCodeInput").value.trim().toUpperCase();
  const nickname = $("#clubJoinNickname").value.trim();
  try {
    const result = await clubApi("/api/bookclub", {
      method: "POST",
      body: JSON.stringify({ action: "join", code, nickname }),
    });
    clubState.activeId = result.club.id;
    if (result.matched_by === "race" && result.club.active_race_code) {
      await joinLinkedRace(result.club.active_race_code);
    } else {
      toast("BookClub에 참여했어요.");
      await loadBookclubs(result.club.id);
    }
  } catch (error) { toast(error.message); }
});

$("#authButton")?.addEventListener("click", () => clubState.user ? showScreen("bookclub") : openAuth("login"));
$("#signupButton")?.addEventListener("click", async () => {
  if (clubState.user) {
    await authClient.auth.signOut();
    toast("로그아웃했어요.");
  } else openAuth("signup");
});
$("#clubLoginBtn")?.addEventListener("click", () => openAuth("login"));
$("#clubSignupBtn")?.addEventListener("click", () => openAuth("signup"));
$("#authClose")?.addEventListener("click", closeAuth);
$("#authSwitch")?.addEventListener("click", () => setAuthMode(clubState.authMode === "login" ? "signup" : "login"));
$("#forgotPassword")?.addEventListener("click", () => setAuthMode("forgot"));
$("#togglePassword")?.addEventListener("click", () => {
  const visible = $("#authPassword").type === "text";
  $("#authPassword").type = visible ? "password" : "text";
  $("#authConfirmPassword").type = visible ? "password" : "text";
  $("#togglePassword").textContent = visible ? "보기" : "숨기기";
});
$("#authForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  await submitAuth();
});

async function initializeAuth() {
  if (!authClient) {
    updateAuthUI();
    return;
  }
  const { data } = await authClient.auth.getSession();
  clubState.session = data.session;
  clubState.user = data.session?.user || null;
  updateAuthUI();
  authClient.auth.onAuthStateChange((event, session) => {
    setTimeout(async () => {
      clubState.session = session;
      clubState.user = session?.user || null;
      if (event === "PASSWORD_RECOVERY") openAuth("recovery");
      updateAuthUI();
      if (clubState.user) await loadBookclubs(clubState.activeId);
      else {
        clubState.clubs = [];
        clubState.activeId = null;
        clubState.detail = null;
        renderBookclub();
      }
    }, 0);
  });
  if (clubState.user) await loadBookclubs();
  if (document.body.dataset.screen === "bookclub" && !clubState.user) openAuth("login");
}

initializeAuth();
