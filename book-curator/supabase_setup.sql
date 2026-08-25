-- 완독 레이스 — Supabase 테이블 생성 스크립트
-- 사용법: Supabase 대시보드 → SQL Editor → 붙여넣기 → Run

create table if not exists public.rooms (
  code        text primary key,
  book_id     text not null,
  target_days int  not null default 30,
  created_at  timestamptz default now()
);

create table if not exists public.members (
  id           uuid primary key default gen_random_uuid(),
  room_code    text not null references public.rooms(code) on delete cascade,
  device_id    text not null,
  nickname     text not null,
  verified_pct int  not null default 0,
  attempts     int  not null default 0, -- 이전 버전 호환용(현재 앱에서는 사용하지 않음)
  joined_at    timestamptz default now(),
  unique (room_code, device_id)
);

create table if not exists public.cheers (
  id         bigint generated always as identity primary key,
  room_code  text not null references public.rooms(code) on delete cascade,
  from_nick  text,
  to_nick    text,
  emoji      text,
  created_at timestamptz default now()
);

create table if not exists public.notes (
  id         bigint generated always as identity primary key,
  room_code  text not null references public.rooms(code) on delete cascade,
  device_id  text,
  nickname   text,
  book_id    text,
  content    text,
  style      jsonb,
  created_at timestamptz default now()
);

-- 방별 목록 조회와 rooms 삭제 시 외래키 확인을 빠르게 합니다.
create index if not exists cheers_room_code_idx on public.cheers(room_code);
create index if not exists notes_room_code_idx on public.notes(room_code);

-- 보안: RLS를 켜고 정책을 만들지 않음
-- → anon 키로는 접근 불가, 서버의 service_role 키만 접근 가능
alter table public.rooms   enable row level security;
alter table public.members enable row level security;
alter table public.cheers  enable row level security;
alter table public.notes   enable row level security;

-- 2026년 신규 프로젝트는 public 테이블이 Data API에 자동 노출되지 않을 수 있습니다.
-- 이 앱은 브라우저가 DB에 직접 접근하지 않고 Vercel 서버만 서버 전용 키로 접근합니다.
revoke all on table public.rooms, public.members, public.cheers, public.notes from anon, authenticated;
grant select, insert, update, delete on table public.rooms, public.members, public.cheers, public.notes to service_role;
grant usage, select on sequence public.cheers_id_seq, public.notes_id_seq to service_role;
