// /api/room — 완독 레이스 룸
// GET  ?code=ABC123            → 룸 전체 상태(멤버·진도·응원·노트)
// POST {action:"create"|"join"|"progress"|"cheer"|"note", ...}
import { resolveKakaoBookId } from "../lib/booksource.js";
import * as store from "../lib/store.js";

const CHECKPOINTS = [25, 50, 75, 100];
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });

export default async function handler(req, res) {
  try {
    if (req.method === "GET") return await getState(req, res);
    if (req.method === "POST") {
      const b = req.body || {};
      if (b.action === "create") return await create(b, res);
      if (b.action === "join") return await join(b, res);
      if (b.action === "progress") return await progress(b, res);
      if (b.action === "cheer") return await cheer(b, res);
      if (b.action === "note") return await note(b, res);
      return bad(res, "unknown action");
    }
    return bad(res, "GET/POST only", 405);
  } catch (e) {
    console.error(e);
    return bad(res, "서버 오류가 발생했어요. 잠시 후 다시 시도해 주세요.", 500);
  }
}

async function create(b, res) {
  const book = await resolveKakaoBookId(b.bookId);
  if (!book?.isbn) return bad(res, "카카오에서 ISBN이 확인된 도서만 레이스를 만들 수 있어요.");
  const nickname = cleanNick(b.nickname);
  if (!nickname || !b.deviceId) return bad(res, "닉네임을 입력해 주세요.");
  const targetDays = Math.max(7, Math.min(90, Number(b.targetDays) || 30));
  const code = await store.createRoom({ bookId: book.id, targetDays, nickname, deviceId: b.deviceId });
  return res.status(200).json({ code });
}

async function join(b, res) {
  const code = String(b.code || "").trim().toUpperCase();
  const room = await store.getRoomRow(code);
  if (!room) return bad(res, "초대 코드를 찾을 수 없어요. 다시 확인해 주세요.", 404);
  const nickname = cleanNick(b.nickname);
  if (!nickname || !b.deviceId) return bad(res, "닉네임을 입력해 주세요.");
  await store.joinRoom({ code, nickname, deviceId: b.deviceId });
  return res.status(200).json({ code });
}

async function progress(b, res) {
  const code = String(b.code || "").trim().toUpperCase();
  const me = await store.getMember(code, b.deviceId);
  if (!me) return bad(res, "레이스 참가자만 진도를 기록할 수 있어요.", 403);
  const pct = Math.max(0, Math.min(100, Math.round(Number(b.progress) / 5) * 5));
  if (!Number.isFinite(pct)) return bad(res, "진도율을 확인해 주세요.");
  await store.updateProgress(code, b.deviceId, pct);
  return res.status(200).json({ ok: true, progress: pct, finished: pct === 100 });
}

async function cheer(b, res) {
  const code = String(b.code || "").toUpperCase();
  const me = await store.getMember(code, b.deviceId);
  if (!me) return bad(res, "레이스 참가자만 응원할 수 있어요.", 403);
  const emoji = String(b.emoji || "👏").slice(0, 20);
  await store.addCheer({ code, fromNick: me.nickname, toNick: String(b.toNick || "").slice(0, 20), emoji });
  return res.status(200).json({ ok: true });
}

async function note(b, res) {
  const code = String(b.code || "").toUpperCase();
  const room = await store.getRoomRow(code);
  const me = await store.getMember(code, b.deviceId);
  if (!room || !me) return bad(res, "레이스 참가자만 노트를 남길 수 있어요.", 403);
  const content = String(b.content || "").trim().slice(0, 500);
  if (content.length < 2) return bad(res, "노트 내용을 입력해 주세요.");
  const style = {
    color: ["paper", "mint", "butter", "rose"].includes(b.style?.color) ? b.style.color : "paper",
    sticker: String(b.style?.sticker || "📖").slice(0, 4),
  };
  await store.addNote({ code, deviceId: b.deviceId, nickname: me.nickname, bookId: room.book_id, content, style });
  return res.status(200).json({ ok: true });
}

async function getState(req, res) {
  const code = String(req.query.code || "").trim().toUpperCase();
  const room = await store.getRoomRow(code);
  if (!room) return bad(res, "초대 코드를 찾을 수 없어요.", 404);
  const book = await resolveKakaoBookId(room.book_id);
  if (!book) return bad(res, "이전 방식으로 만든 레이스입니다. 카카오 도서로 새 레이스를 만들어 주세요.", 409);
  const members = (await store.listMembers(code)).sort((a, z) => z.verified_pct - a.verified_pct || new Date(a.joined_at) - new Date(z.joined_at));
  const [cheers, notes] = await Promise.all([store.listCheers(code), store.listNotes(code)]);
  return res.status(200).json({
    room: { code, target_days: room.target_days, created_at: room.created_at },
    book: { id: book.id, title: book.title, author: book.author, isbn: book.isbn, cover: book.cover, publisher: book.publisher },
    checkpoints: CHECKPOINTS,
    members: members.map((m) => ({ nickname: m.nickname, verified_pct: m.verified_pct, is_me: m.device_id === String(req.query.device || "") })),
    cheers, notes, storage: store.storageMode,
  });
}
const cleanNick = (n) => String(n || "").trim().slice(0, 12);
