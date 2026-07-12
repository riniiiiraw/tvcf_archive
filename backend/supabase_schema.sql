-- =====================================================================
-- TVCF 아카이브 — Supabase 스키마 (1회 실행)
-- Supabase 대시보드 → SQL Editor → New query → 전체 붙여넣기 → Run
-- =====================================================================

-- 1) 분석 레코드 테이블 ------------------------------------------------
create table if not exists public.analyses (
  id           text primary key,                 -- 예: "bacchus-1720000000"
  brand        text,
  title        text,
  source_link  text,                             -- TVCF/YouTube 링크(있으면)
  created_by   text,                             -- 업로더 이름(선택)
  created_at   timestamptz not null default now(),
  data         jsonb not null                    -- 광고 분석 객체 전체(사이트 스키마와 동일)
);

create index if not exists analyses_created_idx on public.analyses (created_at desc);

-- 2) RLS: 누구나 읽기 가능 / 쓰기는 서버(secret 키)만 -------------------
alter table public.analyses enable row level security;

drop policy if exists "public read analyses" on public.analyses;
create policy "public read analyses"
  on public.analyses for select
  using (true);
-- insert/update/delete 정책은 두지 않는다.
--  → publishable(공개) 키로는 쓰기 불가.
--  → 서버가 secret 키로 RLS를 우회해 기록한다.

-- 3) 이미지 저장용 공개 버킷 'frames' --------------------------------
insert into storage.buckets (id, name, public)
values ('frames', 'frames', true)
on conflict (id) do nothing;

-- 공개 버킷이라 URL로 누구나 이미지 읽기 가능(읽기 정책 자동).
-- 업로드(쓰기)는 서버 secret 키로만.
drop policy if exists "public read frames" on storage.objects;
create policy "public read frames"
  on storage.objects for select
  using (bucket_id = 'frames');
