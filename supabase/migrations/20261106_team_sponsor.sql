-- EBiZ Back Your Team 2027. Apply ONLY to an isolated Supabase project.
-- IMPORTANT: Keep anonymous clients away from both personal data and storage files.
create extension if not exists pgcrypto;

create table if not exists public.team_sponsor_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  status text not null default 'draft' check(status in
    ('draft','submitted_pending_review','approved','rejected','withdrawn','winner','expired')),
  receipt text not null unique,
  team_name text not null,
  team_key text not null,
  sport text not null,
  org_type text not null check(org_type in ('school','barangay','club')),
  organization text not null,
  organization_key text not null,
  province text not null,
  municipality text not null,
  kit_count smallint not null check(kit_count between 6 and 18),
  has_minors boolean not null,
  story text not null,
  rep_name text not null,
  rep_role text not null,
  rep_email text not null,
  rep_phone text not null,
  signed_name text not null,
  consent_claims jsonb not null,
  terms_version text not null,
  accepted_at timestamptz not null,
  -- The original random claim token is NEVER stored; only its hash.
  claim_token_hash text not null,
  -- Daily salted/truncated token, not the raw IP; see privacy notice.
  abuse_fingerprint text,
  video_path text not null,
  consents_path text not null,
  endorsement_path text not null,
  admin_notes text,
  review_at timestamptz,
  review_by text
);
create unique index if not exists team_sponsor_one_team
on public.team_sponsor_submissions (team_key,organization_key,province)
where status in ('submitted_pending_review','approved','rejected','withdrawn','winner');
create unique index if not exists team_sponsor_one_representative
on public.team_sponsor_submissions (lower(rep_email))
where status in ('submitted_pending_review','approved','rejected','withdrawn','winner');
create index if not exists team_sponsor_status_time on public.team_sponsor_submissions(status,created_at);

create table if not exists public.team_sponsor_rate_limits (
  day date not null,
  fingerprint text not null,
  attempts integer not null default 0,
  primary key (day,fingerprint)
);
-- Atomic throttle, callable only by server service role.
create or replace function public.team_sponsor_hit_rate_limit(p_fingerprint text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  insert into public.team_sponsor_rate_limits(day,fingerprint,attempts)
  values ((now() at time zone 'Asia/Manila')::date,p_fingerprint,1)
  on conflict (day,fingerprint) do update
  set attempts = public.team_sponsor_rate_limits.attempts + 1
  returning attempts into n;
  return n;
end; $$;
revoke all on function public.team_sponsor_hit_rate_limit(text) from public,anon,authenticated;
grant execute on function public.team_sponsor_hit_rate_limit(text) to service_role;

alter table public.team_sponsor_submissions enable row level security;
alter table public.team_sponsor_rate_limits enable row level security;
revoke all on public.team_sponsor_submissions from public,anon,authenticated;
revoke all on public.team_sponsor_rate_limits from public,anon,authenticated;
grant all on public.team_sponsor_submissions to service_role;
grant all on public.team_sponsor_rate_limits to service_role;

-- Supabase Storage admin API uses this PRIVATE bucket. NO public access or anon
-- storage.objects RLS policies should be created.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('team-entry-private','team-entry-private',false,52428800,array['video/mp4','application/pdf']::text[])
on conflict(id) do update set
  public=false,
  file_size_limit=52428800,
  allowed_mime_types=array['video/mp4','application/pdf']::text[];
-- Privacy retention jobs are NOT installed by this migration: see deployment checklist.
