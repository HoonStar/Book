// lib/store.js — 저장소. SUPABASE_URL과 서버 전용 키가 있으면 Supabase(영구), 없으면 메모리.
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
// 2026년 권장 키(sb_secret_...)를 우선 사용하고 기존 service_role 키도 호환합니다.
// 두 키 모두 Vercel 서버에서만 사용하며 브라우저 코드에 노출하면 안 됩니다.
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supa = URL && KEY ? createClient(URL, KEY, { auth: { persistSession: false } }) : null;
export const storageMode = supa ? "supabase" : "memory";

// 메모리 폴백 (vercel dev 로컬 실행·자동 테스트용)
const mem = (globalThis.__bcStore ||= { rooms: {}, members: [], notes: [], cheers: [] });

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 혼동 문자(0,O,1,I,L) 제외
export function newCode() {
  let c = "";
  for (let i = 0; i < 6; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return c;
}

export async function createRoom({ bookId, targetDays, nickname, deviceId }) {
  const code = newCode();
  if (supa) {
    const { error } = await supa.from("rooms").insert({ code, book_id: bookId, target_days: targetDays });
    if (error) throw error;
    await joinRoom({ code, nickname, deviceId });
  } else {
    mem.rooms[code] = { code, book_id: bookId, target_days: targetDays, created_at: new Date().toISOString() };
    mem.members.push(memberRow(code, nickname, deviceId));
  }
  return code;
}

const memberRow = (code, nickname, deviceId) => ({
  room_code: code, nickname, device_id: deviceId, verified_pct: 0, attempts: 0, joined_at: new Date().toISOString(),
});

export async function getRoomRow(code) {
  if (supa) {
    const { data } = await supa.from("rooms").select("*").eq("code", code).maybeSingle();
    return data || null;
  }
  return mem.rooms[code] || null;
}

export async function joinRoom({ code, nickname, deviceId }) {
  if (supa) {
    const { data: exist } = await supa.from("members").select("id").eq("room_code", code).eq("device_id", deviceId).maybeSingle();
    if (exist) { await supa.from("members").update({ nickname }).eq("id", exist.id); return; }
    const { error } = await supa.from("members").insert(memberRow(code, nickname, deviceId));
    if (error) throw error;
  } else {
    const m = mem.members.find((x) => x.room_code === code && x.device_id === deviceId);
    if (m) m.nickname = nickname;
    else mem.members.push(memberRow(code, nickname, deviceId));
  }
}

export async function getMember(code, deviceId) {
  if (supa) {
    const { data } = await supa.from("members").select("*").eq("room_code", code).eq("device_id", deviceId).maybeSingle();
    return data || null;
  }
  return mem.members.find((x) => x.room_code === code && x.device_id === deviceId) || null;
}

export async function updateProgress(code, deviceId, pct) {
  if (supa) {
    const m = await getMember(code, deviceId);
    if (!m) return;
    await supa.from("members").update({ verified_pct: pct }).eq("id", m.id);
  } else {
    const m = mem.members.find((x) => x.room_code === code && x.device_id === deviceId);
    if (!m) return;
    m.verified_pct = pct;
  }
}

export async function listMembers(code) {
  if (supa) {
    const { data } = await supa.from("members").select("nickname,device_id,verified_pct,attempts,joined_at").eq("room_code", code);
    return data || [];
  }
  return mem.members.filter((x) => x.room_code === code);
}

export async function addCheer({ code, fromNick, toNick, emoji }) {
  const row = { room_code: code, from_nick: fromNick, to_nick: toNick, emoji, created_at: new Date().toISOString() };
  if (supa) await supa.from("cheers").insert(row);
  else mem.cheers.push(row);
}
export async function listCheers(code, limit = 20) {
  if (supa) {
    const { data } = await supa.from("cheers").select("*").eq("room_code", code).order("created_at", { ascending: false }).limit(limit);
    return data || [];
  }
  return mem.cheers.filter((x) => x.room_code === code).slice(-limit).reverse();
}

export async function addNote({ code, deviceId, nickname, bookId, content, style }) {
  const row = { room_code: code, device_id: deviceId, nickname, book_id: bookId, content, style, created_at: new Date().toISOString() };
  if (supa) await supa.from("notes").insert(row);
  else mem.notes.push(row);
}
export async function listNotes(code) {
  if (supa) {
    const { data } = await supa.from("notes").select("*").eq("room_code", code).order("created_at", { ascending: false });
    return data || [];
  }
  return mem.notes.filter((x) => x.room_code === code).slice().reverse();
}
