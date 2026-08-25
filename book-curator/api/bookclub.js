// /api/bookclub — 로그인 사용자 전용 북클럽·투표·완독 레이스 연결 API
import { createClient } from "@supabase/supabase-js";
import { bookById } from "../lib/engine.js";

const URL = process.env.SUPABASE_URL;
const SECRET = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const db = URL && SECRET
  ? createClient(URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const clean = (value, max) => String(value || "").trim().slice(0, max);
const clubCode = () => Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
const bad = (res, message, status = 400) => res.status(status).json({ error: message });
const requestKey = (value) => {
  const key = clean(value, 36).toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(key) ? key : null;
};

async function currentUser(req, res) {
  if (!db) {
    bad(res, "Supabase 서버 환경변수가 설정되지 않았어요.", 503);
    return null;
  }
  const header = String(req.headers?.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    bad(res, "로그인이 필요해요.", 401);
    return null;
  }
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) {
    bad(res, "로그인 시간이 만료됐어요. 다시 로그인해 주세요.", 401);
    return null;
  }
  return data.user;
}

async function membership(clubId, userId) {
  const { data } = await db.from("club_members")
    .select("club_id,user_id,role,nickname,joined_at")
    .eq("club_id", clubId)
    .eq("user_id", userId)
    .maybeSingle();
  return data || null;
}

async function requireMember(clubId, userId, res, ownerOnly = false) {
  const member = await membership(clubId, userId);
  if (!member) {
    bad(res, "이 북클럽의 멤버만 이용할 수 있어요.", 403);
    return null;
  }
  if (ownerOnly && member.role !== "owner") {
    bad(res, "북클럽장만 변경할 수 있어요.", 403);
    return null;
  }
  return member;
}

async function listClubs(user) {
  const { data: memberships, error } = await db.from("club_members")
    .select("club_id,role,nickname,joined_at")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true });
  if (error) throw error;
  const ids = (memberships || []).map((item) => item.club_id);
  if (!ids.length) return [];
  const { data: clubs, error: clubError } = await db.from("book_clubs")
    .select("id,name,description,invite_code,active_race_code,created_at")
    .in("id", ids)
    .order("created_at", { ascending: true });
  if (clubError) throw clubError;
  const membershipByClub = new Map(memberships.map((item) => [item.club_id, item]));
  return (clubs || []).map((club) => ({
    id: club.id,
    name: club.name,
    description: club.description,
    invite_code: club.invite_code,
    active_race_code: club.active_race_code,
    created_at: club.created_at,
    role: membershipByClub.get(club.id)?.role || "member",
    nickname: membershipByClub.get(club.id)?.nickname || "",
  }));
}

async function detail(clubId, user) {
  const member = await membership(clubId, user.id);
  if (!member) return null;
  const [{ data: club, error: clubError }, { data: books, error: bookError }, { data: votes, error: voteError }, { data: members, error: memberError }] = await Promise.all([
    db.from("book_clubs").select("id,name,description,invite_code,active_race_code,created_at").eq("id", clubId).single(),
    db.from("club_books").select("id,club_id,book_id,title,author,reason,race_ready,created_at").eq("club_id", clubId).order("created_at", { ascending: false }),
    db.from("club_votes").select("club_book_id,user_id,vote_month").eq("club_id", clubId),
    db.from("club_members").select("role,nickname,joined_at").eq("club_id", clubId).order("joined_at", { ascending: true }),
  ]);
  if (clubError || bookError || voteError || memberError) throw clubError || bookError || voteError || memberError;

  let activeRace = null;
  if (club.active_race_code) {
    const { data: room } = await db.from("rooms")
      .select("code,book_id,target_days,created_at")
      .eq("code", club.active_race_code)
      .maybeSingle();
    if (room) {
      const book = bookById(room.book_id);
      activeRace = {
        code: room.code,
        target_days: room.target_days,
        book: book ? { id: book.id, title: book.title, author: book.author, pages: book.pages } : { id: room.book_id, title: room.book_id },
      };
    }
  }

  return {
    club: {
      id: club.id,
      name: club.name,
      description: club.description,
      invite_code: club.invite_code,
      active_race_code: club.active_race_code,
      created_at: club.created_at,
      role: member.role,
      nickname: member.nickname,
    },
    books: books || [],
    votes: (votes || []).map((vote) => ({
      club_book_id: vote.club_book_id,
      vote_month: vote.vote_month,
      mine: vote.user_id === user.id,
    })),
    members: members || [],
    active_race: activeRace,
  };
}

async function createClub(body, user, res) {
  const name = clean(body.name, 60);
  const description = clean(body.description, 240);
  const nickname = clean(body.nickname || user.user_metadata?.display_name || user.email?.split("@")[0], 20);
  const idempotencyKey = requestKey(body.requestKey);
  if (body.requestKey && !idempotencyKey) return bad(res, "요청 식별값이 올바르지 않아요.");
  if (name.length < 2) return bad(res, "북클럽 이름을 두 글자 이상 입력해 주세요.");
  if (!nickname) return bad(res, "북클럽에서 사용할 닉네임을 입력해 주세요.");

  let club;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await db.from("book_clubs")
      .insert({ owner_id: user.id, name, description, invite_code: clubCode(), request_key: idempotencyKey })
      .select("id,name,description,invite_code,active_race_code,created_at")
      .single();
    if (!error) {
      club = data;
      break;
    }
    if (error.code !== "23505") throw error;
    if (idempotencyKey) {
      const { data: existing } = await db.from("book_clubs")
        .select("id,name,description,invite_code,active_race_code,created_at")
        .eq("owner_id", user.id)
        .eq("request_key", idempotencyKey)
        .maybeSingle();
      if (existing) {
        club = existing;
        break;
      }
    }
  }
  if (!club) return bad(res, "초대 코드 생성에 실패했어요. 다시 시도해 주세요.", 503);

  const { error: memberError } = await db.from("club_members")
    .upsert({ club_id: club.id, user_id: user.id, role: "owner", nickname }, { onConflict: "club_id,user_id" });
  if (memberError) {
    await db.from("book_clubs").delete().eq("id", club.id);
    throw memberError;
  }
  return res.status(200).json({ club: { ...club, role: "owner", nickname } });
}

async function joinClub(body, user, res) {
  const code = clean(body.code, 6).toUpperCase();
  const nickname = clean(body.nickname || user.user_metadata?.display_name || user.email?.split("@")[0], 20);
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) return bad(res, "6자리 초대 코드를 확인해 주세요.");
  if (!nickname) return bad(res, "북클럽에서 사용할 닉네임을 입력해 주세요.");

  let { data: club } = await db.from("book_clubs")
    .select("id,name,invite_code,active_race_code")
    .eq("invite_code", code)
    .maybeSingle();
  let matchedBy = "club";
  if (!club) {
    const result = await db.from("book_clubs")
      .select("id,name,invite_code,active_race_code")
      .eq("active_race_code", code)
      .maybeSingle();
    club = result.data;
    matchedBy = "race";
  }
  if (!club) return bad(res, "북클럽 또는 연결된 완독 레이스 코드를 찾지 못했어요.", 404);

  const existing = await membership(club.id, user.id);
  if (existing) {
    await db.from("club_members").update({ nickname }).eq("club_id", club.id).eq("user_id", user.id);
  } else {
    const { error } = await db.from("club_members")
      .insert({ club_id: club.id, user_id: user.id, role: "member", nickname });
    if (error) throw error;
  }
  return res.status(200).json({ club, matched_by: matchedBy });
}

async function shareBook(body, user, res) {
  const clubId = clean(body.clubId, 80);
  if (!await requireMember(clubId, user.id, res)) return;
  const title = clean(body.title, 120);
  const author = clean(body.author, 120);
  const reason = clean(body.reason, 500);
  const bookId = clean(body.bookId, 40) || null;
  const idempotencyKey = requestKey(body.requestKey);
  if (body.requestKey && !idempotencyKey) return bad(res, "요청 식별값이 올바르지 않아요.");
  if (!title) return bad(res, "책 제목을 입력해 주세요.");
  const { data, error } = await db.from("club_books").insert({
    club_id: clubId,
    added_by: user.id,
    book_id: bookId,
    title,
    author,
    reason,
    race_ready: Boolean(body.raceReady),
    request_key: idempotencyKey,
  }).select("id,club_id,book_id,title,author,reason,race_ready,created_at").single();
  if (error?.code === "23505" && idempotencyKey) {
    const { data: existing } = await db.from("club_books")
      .select("id,club_id,book_id,title,author,reason,race_ready,created_at")
      .eq("club_id", clubId)
      .eq("added_by", user.id)
      .eq("request_key", idempotencyKey)
      .maybeSingle();
    if (existing) return res.status(200).json({ book: existing, duplicate: true });
  }
  if (error) throw error;
  return res.status(200).json({ book: data });
}

async function vote(body, user, res) {
  const clubId = clean(body.clubId, 80);
  if (!await requireMember(clubId, user.id, res)) return;
  const bookId = clean(body.clubBookId, 80);
  const { data: book } = await db.from("club_books").select("id").eq("id", bookId).eq("club_id", clubId).maybeSingle();
  if (!book) return bad(res, "이 북클럽에 공유된 책이 아니에요.", 404);
  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const { error } = await db.from("club_votes").upsert({
    club_id: clubId,
    club_book_id: bookId,
    user_id: user.id,
    vote_month: month,
  }, { onConflict: "club_id,user_id,vote_month" });
  if (error) throw error;
  return res.status(200).json({ ok: true, vote_month: month });
}

async function linkRace(body, user, res) {
  const clubId = clean(body.clubId, 80);
  if (!await requireMember(clubId, user.id, res, true)) return;
  const code = clean(body.raceCode, 6).toUpperCase();
  const { data: room } = await db.from("rooms").select("code").eq("code", code).maybeSingle();
  if (!room) return bad(res, "완독 레이스 코드를 찾지 못했어요.", 404);
  const { error } = await db.from("book_clubs").update({ active_race_code: code }).eq("id", clubId).eq("owner_id", user.id);
  if (error?.code === "23505") return bad(res, "이 레이스는 이미 다른 북클럽에 연결되어 있어요.", 409);
  if (error) throw error;
  return res.status(200).json({ ok: true, race_code: code });
}

async function updateClub(body, user, res) {
  const clubId = clean(body.clubId, 80);
  if (!await requireMember(clubId, user.id, res, true)) return;
  const name = clean(body.name, 60);
  const description = clean(body.description, 240);
  if (name.length < 2) return bad(res, "북클럽 이름을 두 글자 이상 입력해 주세요.");
  const { error } = await db.from("book_clubs").update({ name, description }).eq("id", clubId).eq("owner_id", user.id);
  if (error) throw error;
  return res.status(200).json({ ok: true });
}

async function deleteClub(body, user, res) {
  const clubId = clean(body.clubId, 80);
  if (!await requireMember(clubId, user.id, res, true)) return;
  const { error } = await db.from("book_clubs").delete().eq("id", clubId).eq("owner_id", user.id);
  if (error) throw error;
  return res.status(200).json({ ok: true });
}

export default async function handler(req, res) {
  const user = await currentUser(req, res);
  if (!user) return;
  try {
    if (req.method === "GET") {
      const action = clean(req.query?.action || "list", 20);
      if (action === "list") return res.status(200).json({ clubs: await listClubs(user) });
      if (action === "detail") {
        const data = await detail(clean(req.query?.clubId, 80), user);
        return data ? res.status(200).json(data) : bad(res, "북클럽을 찾지 못했어요.", 404);
      }
      return bad(res, "지원하지 않는 조회예요.");
    }
    if (req.method !== "POST") return bad(res, "GET/POST only", 405);
    const body = req.body || {};
    if (body.action === "create") return await createClub(body, user, res);
    if (body.action === "join") return await joinClub(body, user, res);
    if (body.action === "share_book") return await shareBook(body, user, res);
    if (body.action === "vote") return await vote(body, user, res);
    if (body.action === "link_race") return await linkRace(body, user, res);
    if (body.action === "update") return await updateClub(body, user, res);
    if (body.action === "delete") return await deleteClub(body, user, res);
    return bad(res, "지원하지 않는 작업이에요.");
  } catch (error) {
    console.error("[bookclub]", error);
    return bad(res, "북클럽 처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.", 500);
  }
}
