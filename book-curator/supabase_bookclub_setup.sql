-- NextBook BookClub + Supabase Auth 연동 스키마
-- 운영 DB에는 add_bookclubs_and_race_linking 마이그레이션으로 적용됨

create table if not exists public.book_clubs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  description text not null default '' check (char_length(description) <= 240),
  invite_code text not null unique check (invite_code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  active_race_code text references public.rooms(code) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.club_members (
  club_id uuid not null references public.book_clubs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  nickname text not null check (char_length(nickname) between 1 and 20),
  joined_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

create table if not exists public.club_books (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.book_clubs(id) on delete cascade,
  added_by uuid not null references auth.users(id) on delete cascade,
  book_id text,
  title text not null check (char_length(title) between 1 and 120),
  author text not null default '' check (char_length(author) <= 120),
  reason text not null default '' check (char_length(reason) <= 500),
  race_ready boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, club_id)
);

create table if not exists public.club_votes (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.book_clubs(id) on delete cascade,
  club_book_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  vote_month date not null,
  created_at timestamptz not null default now(),
  constraint club_votes_book_in_club_fkey foreign key (club_book_id, club_id)
    references public.club_books(id, club_id) on delete cascade,
  constraint club_votes_one_per_month unique (club_id, user_id, vote_month)
);

create index if not exists book_clubs_owner_id_idx on public.book_clubs(owner_id);
create unique index if not exists book_clubs_active_race_code_uidx
  on public.book_clubs(active_race_code) where active_race_code is not null;
create index if not exists club_members_user_id_idx on public.club_members(user_id);
create index if not exists club_books_club_created_idx on public.club_books(club_id, created_at desc);
create index if not exists club_books_added_by_idx on public.club_books(added_by);
create index if not exists club_votes_club_month_idx on public.club_votes(club_id, vote_month);
create index if not exists club_votes_user_id_idx on public.club_votes(user_id);
create index if not exists club_votes_book_club_idx on public.club_votes(club_book_id, club_id);

alter table public.book_clubs enable row level security;
alter table public.club_members enable row level security;
alter table public.club_books enable row level security;
alter table public.club_votes enable row level security;

-- 브라우저는 Auth API만 사용합니다. 북클럽 데이터는 로그인 토큰을 검증하는 Vercel API를 통해 접근합니다.
revoke all on table public.book_clubs, public.club_members, public.club_books, public.club_votes from anon, authenticated;
grant select, insert, update, delete on table public.book_clubs, public.club_members, public.club_books, public.club_votes to service_role;
