-- REVIEW DRAFT ONLY: not applied, not registered in migration history.
-- Run against an isolated clone first. No report rows are rewritten or deleted.
-- Supabase CLI was unavailable; register with `supabase migration new` only after review.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create schema report_security authorization postgres;
revoke all on schema report_security from public, anon, authenticated, service_role;
grant usage on schema report_security to authenticated, service_role;

create table report_security.admin_allowlist (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table report_security.feedback_windows (
  bucket text not null,
  starts_at timestamptz not null,
  submissions integer not null check (submissions > 0),
  primary key (bucket, starts_at)
);
create table report_security.used_challenges (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
alter table report_security.admin_allowlist enable row level security;
alter table report_security.feedback_windows enable row level security;
alter table report_security.used_challenges enable row level security;
revoke all on all tables in schema report_security from public, anon, authenticated, service_role;

-- The allowlist and auth.sessions are read by this narrowly scoped owner function.
-- No caller-supplied user id and no editable user_metadata authorization.
create function report_security.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and exists (select 1 from report_security.admin_allowlist a where a.user_id = auth.uid())
    and exists (select 1 from auth.sessions s
      where s.user_id = auth.uid() and s.id::text = auth.jwt()->>'session_id'
      and (s.not_after is null or s.not_after > now()));
$$;
revoke all on function report_security.is_admin() from public, anon, authenticated, service_role;
grant execute on function report_security.is_admin() to authenticated;
create function public.is_report_admin() returns boolean
language sql stable security invoker set search_path = '' as $$
  select report_security.is_admin();
$$;
revoke all on function public.is_report_admin() from public, anon, authenticated, service_role;
grant execute on function public.is_report_admin() to authenticated;

-- RLS policies are permissive ORs: remove every existing policy on this table,
-- rather than leaving a differently named permissive policy behind.
do $$ declare p record; begin
  for p in select policyname from pg_policies
      where schemaname = 'public' and tablename = 'user_reports'
  loop execute format('drop policy %I on public.user_reports', p.policyname); end loop;
end $$;
alter table public.user_reports enable row level security;
alter table public.user_reports force row level security;
revoke all privileges on table public.user_reports from public, anon, authenticated, service_role;
-- Clear any pre-existing column grants too; table revocation alone is insufficient.
do $$ declare c record; begin
  for c in select attname from pg_attribute where attrelid = 'public.user_reports'::regclass
      and attnum > 0 and not attisdropped
  loop execute format('revoke all privileges (%I) on public.user_reports from public, anon, authenticated, service_role', c.attname); end loop;
end $$;
grant select, delete on public.user_reports to authenticated;
grant update (status) on public.user_reports to authenticated;
create policy reports_admin_read on public.user_reports for select to authenticated
  using ((select report_security.is_admin()));
create policy reports_admin_status on public.user_reports for update to authenticated
  using ((select report_security.is_admin())) with check ((select report_security.is_admin()));
create policy reports_admin_delete on public.user_reports for delete to authenticated
  using ((select report_security.is_admin()));
-- No browser INSERT grant/policy. Anonymous submissions use the validated gateway.

alter table public.user_reports add column model_id text;
alter table public.user_reports add column model_category text;
alter table public.user_reports add column model_probabilities jsonb;
alter table public.user_reports add constraint reports_text_valid check (
  char_length(reported_text) between 200 and 10000 and octet_length(reported_text) <= 40000
  and reported_text !~ '^[[:space:]]*$') not valid;
alter table public.user_reports add constraint reports_probability_valid check (
  ai_probability >= 0 and ai_probability <= 100) not valid;
alter table public.user_reports add constraint reports_label_valid check (
  user_expected_label in ('Human', 'AI-Generated')) not valid;
alter table public.user_reports add constraint reports_status_valid check (
  status is not null and status in ('pending', 'approved', 'rejected')) not valid;
-- NOT VALID preserves historical evidence but still enforces checks on new/updated rows.
-- Owner must review invalid legacy rows before a separate VALIDATE CONSTRAINT operation.

create function report_security.ingest_feedback(p_payload jsonb, p_challenge_hash text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  probs jsonb; k text; v numeric; total numeric := 0; best numeric := -1;
  top_label text; bucket_name text; bucket_start timestamptz; cap integer; used integer;
  pct numeric;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise insufficient_privilege using message = 'Server-only feedback ingestion';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Invalid feedback'; end if;
  if (select count(*) from jsonb_object_keys(p_payload)) <> 7
    or not (p_payload ?& array['reported_text','ai_probability','user_expected_label','status','model_id','category','probabilities'])
  then raise exception 'Invalid feedback fields'; end if;
  if jsonb_typeof(p_payload->'reported_text') <> 'string'
    or jsonb_typeof(p_payload->'ai_probability') <> 'number'
    or p_payload->>'status' is distinct from 'pending'
    or p_payload->>'model_id' is distinct from 'thai-en-w8a32-4baa5cb331f6-v1'
    or p_payload->>'user_expected_label' is null or p_payload->>'user_expected_label' not in ('Human','AI-Generated')
  then raise exception 'Invalid feedback values'; end if;
  probs := p_payload->'probabilities';
  if jsonb_typeof(probs) is distinct from 'object' then raise exception 'Invalid probabilities'; end if;
  if (select count(*) from jsonb_object_keys(probs)) <> 4
    or not (probs ?& array['human','gpt','gemini','other']) then raise exception 'Invalid probabilities'; end if;
  foreach k in array array['human','gpt','gemini','other'] loop
    if jsonb_typeof(probs->k) <> 'number' then raise exception 'Invalid probability'; end if;
    v := (probs->>k)::numeric;
    if v < 0 or v > 1 then raise exception 'Invalid probability'; end if;
    total := total + v;
    if v > best then best := v; top_label := k; end if;
  end loop;
  pct := (p_payload->>'ai_probability')::numeric;
  if abs(total - 1) > 0.000001 or abs(pct - (1 - (probs->>'human')::numeric) * 100) > 0.0001
    or p_payload->>'category' is distinct from top_label then raise exception 'Inconsistent prediction'; end if;
  if p_challenge_hash is null or p_challenge_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid receipt'; end if;

  insert into report_security.used_challenges(token_hash) values(p_challenge_hash)
    on conflict do nothing;
  if not found then raise exception sqlstate 'PT409' using message = 'Verification already consumed'; end if;
  -- Global atomic caps, independent of localStorage/IP headers/process restarts.
  -- UPSERT locks serialize competing requests. Any failure rolls back both counters.
  foreach bucket_name in array array['minute','hour'] loop
    bucket_start := date_trunc(bucket_name, statement_timestamp());
    cap := case when bucket_name = 'minute' then 10 else 100 end;
    insert into report_security.feedback_windows as w(bucket, starts_at, submissions)
      values(bucket_name, bucket_start, 1)
      on conflict(bucket, starts_at) do update set submissions = w.submissions + 1
        where w.submissions < cap
      returning submissions into used;
    if not found then raise exception sqlstate 'PT429' using message = 'Feedback limit reached'; end if;
  end loop;
  insert into public.user_reports(reported_text, ai_probability, user_expected_label, status,
      model_id, model_category, model_probabilities)
  values(p_payload->>'reported_text', pct, p_payload->>'user_expected_label', 'pending',
      p_payload->>'model_id', top_label, probs);
end;
$$;
revoke all on function report_security.ingest_feedback(jsonb,text) from public, anon, authenticated, service_role;
grant execute on function report_security.ingest_feedback(jsonb,text) to service_role;
create function public.ingest_verified_feedback(p_payload jsonb, p_challenge_hash text) returns void
language sql security invoker set search_path = '' as $$
  select report_security.ingest_feedback(p_payload, p_challenge_hash);
$$;
revoke all on function public.ingest_verified_feedback(jsonb,text) from public, anon, authenticated, service_role;
grant execute on function public.ingest_verified_feedback(jsonb,text) to service_role;

-- No TRUNCATE, REFERENCES, TRIGGER or table-wide UPDATE for browser roles.
-- Do not grant allowlist writes or role management to application users.
