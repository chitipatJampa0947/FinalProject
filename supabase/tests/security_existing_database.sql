-- PREPARED ONLY. Never run before separately approved migration AND fixture tests.
-- Use psql ON_ERROR_STOP=1 in a verified connection to tslxclshozddleaojxwb.
-- Runner must set all cs403.* inputs from the reviewed unique fixture manifest.
-- No Auth accounts/sessions are created or changed here. No original row is a fixture.
-- SQL role/claim simulation tests DB authorization, not signed JWT/GoTrue validation.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '10s';
set local idle_in_transaction_session_timeout = '30s';
set local search_path = public, pg_temp;

do $$ begin
  if current_setting('cs403.existing_security_test',true) is distinct from 'approved-fixtures'
    or current_setting('cs403.target_project',true) is distinct from 'tslxclshozddleaojxwb'
    or current_user <> 'postgres'
    or current_setting('server_version_num')::int not between 170000 and 179999
  then raise exception 'Refusing unapproved target/executor/version'; end if;
  if to_regnamespace('report_security') is null then
    raise exception 'Hardening must already be approved and applied'; end if;
  if current_setting('cs403.fixture_report_id',true) is null
    or current_setting('cs403.fixture_insert_id',true) is null
    or current_setting('cs403.ordinary_user_id',true) is null
    or current_setting('cs403.missing_session_id',true) is null
    or current_setting('cs403.admin_user_id',true) is null
    or current_setting('cs403.admin_session_id',true) is null
    or current_setting('cs403.original_fingerprints',true) is null
  then raise exception 'Missing reviewed fixture inputs'; end if;
  if current_setting('cs403.fixture_report_id')=current_setting('cs403.fixture_insert_id')
    or current_setting('cs403.admin_user_id')=current_setting('cs403.ordinary_user_id')
  then raise exception 'Fixture IDs must be distinct'; end if;
  if exists(select 1 from public.user_reports where id in
       (current_setting('cs403.fixture_report_id')::uuid,current_setting('cs403.fixture_insert_id')::uuid))
    or exists(select 1 from auth.users where id=current_setting('cs403.ordinary_user_id')::uuid)
    or exists(select 1 from auth.sessions where id=current_setting('cs403.missing_session_id')::uuid)
  then raise exception 'Fixture collision'; end if;
  if not exists(select 1 from auth.sessions where id=current_setting('cs403.admin_session_id')::uuid
      and user_id=current_setting('cs403.admin_user_id')::uuid
      and (not_after is null or not_after>now()))
    or exists(select 1 from report_security.admin_allowlist
      where user_id=current_setting('cs403.admin_user_id')::uuid)
  then raise exception 'Designated test actor needs a live session and must not already be allowlisted'; end if;
end $$;

create temporary table cs403_baseline on commit drop as
select id,encode(sha256(convert_to(jsonb_build_array(id::text,reported_text,ai_probability::text,
  user_expected_label,status,to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))::text,'UTF8')),'hex') as hash
from public.user_reports;
do $$ declare actual jsonb; begin
  select jsonb_agg(hash order by id) into actual from pg_temp.cs403_baseline;
  if (select count(*) from pg_temp.cs403_baseline)<>2
    or actual is distinct from current_setting('cs403.original_fingerprints')::jsonb
  then raise exception 'Original evidence changed; take a new versioned backup and review'; end if;
end $$;

create function pg_temp.expect_state(statement text, expected text) returns void
language plpgsql security invoker as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlstate=expected then return; end if;
    raise exception 'Unexpected SQLSTATE in scoped probe';
  end;
  raise exception 'Scoped negative probe unexpectedly succeeded';
end $$;
create function pg_temp.assert_no_visible_fixture() returns void
language plpgsql security invoker as $$
declare n int;
begin
  if public.is_report_admin() then raise exception 'Unauthorized actor became admin'; end if;
  select count(*) into n from public.user_reports where id=current_setting('cs403.fixture_report_id')::uuid;
  if n<>0 then raise exception 'Unauthorized fixture read'; end if;
  update public.user_reports set status='approved' where id=current_setting('cs403.fixture_report_id')::uuid;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'Unauthorized fixture update'; end if;
  delete from public.user_reports where id=current_setting('cs403.fixture_report_id')::uuid;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'Unauthorized fixture delete'; end if;
end $$;

insert into public.user_reports(id,reported_text,ai_probability,user_expected_label,status)
values(current_setting('cs403.fixture_report_id')::uuid,
  'CS403_SYNTHETIC_'||current_setting('cs403.fixture_report_id')||repeat('x',200),25,'Human','pending');

-- Inspect destructive capabilities; never issue TRUNCATE or MAINTAIN probes.
do $$ declare r text; p text; begin
  foreach r in array array['anon','authenticated','service_role'] loop
    foreach p in array array['TRUNCATE','MAINTAIN','REFERENCES','TRIGGER','INSERT','UPDATE'] loop
      if has_table_privilege(r,'public.user_reports',p) then raise exception 'Excessive table privilege'; end if;
    end loop;
  end loop;
end $$;
set local role anon;
select pg_temp.expect_state(format('select id from public.user_reports where id=%L::uuid',current_setting('cs403.fixture_report_id')),'42501');
select pg_temp.expect_state(format('update public.user_reports set status=''approved'' where id=%L::uuid',current_setting('cs403.fixture_report_id')),'42501');
select pg_temp.expect_state(format('delete from public.user_reports where id=%L::uuid',current_setting('cs403.fixture_report_id')),'42501');
select pg_temp.expect_state(format('insert into public.user_reports(id,reported_text,ai_probability,user_expected_label,status) values(%L::uuid,repeat(''x'',200),25,''Human'',''pending'')',current_setting('cs403.fixture_insert_id')),'42501');
select pg_temp.expect_state('select public.ingest_verified_feedback(''{}''::jsonb,repeat(''a'',64))','42501');
reset role;

-- Missing Auth identity plus spoofed editable metadata must not grant admin.
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('cs403.ordinary_user_id'),
  'role','authenticated','session_id',current_setting('cs403.missing_session_id'),
  'user_metadata',jsonb_build_object('admin',true))::text,true);
set local role authenticated;
select pg_temp.assert_no_visible_fixture();
select pg_temp.expect_state(format('insert into report_security.admin_allowlist(user_id) values(%L::uuid)',current_setting('cs403.ordinary_user_id')),'42501');
select pg_temp.expect_state('select public.ingest_verified_feedback(''{}''::jsonb,repeat(''b'',64))','42501');
reset role;

-- This new allowlist assignment is fixture-only, transient and separately authorized.
insert into report_security.admin_allowlist(user_id) values(current_setting('cs403.admin_user_id')::uuid);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('cs403.admin_user_id'),
  'role','authenticated','session_id',current_setting('cs403.admin_session_id'))::text,true);
set local role authenticated;
do $$ declare n int; begin
  if not public.is_report_admin() then raise exception 'Positive admin control failed'; end if;
  select count(*) into n from public.user_reports where id=current_setting('cs403.fixture_report_id')::uuid;
  if n<>1 then raise exception 'Admin fixture read failed'; end if;
  update public.user_reports set status='approved' where id=current_setting('cs403.fixture_report_id')::uuid;
  get diagnostics n=row_count; if n<>1 then raise exception 'Admin fixture update failed'; end if;
end $$;
select pg_temp.expect_state(format('update public.user_reports set reported_text=repeat(''y'',200) where id=%L::uuid',current_setting('cs403.fixture_report_id')),'42501');
select pg_temp.expect_state(format('update public.user_reports set status=''invalid'' where id=%L::uuid',current_setting('cs403.fixture_report_id')),'23514');
select pg_temp.expect_state(format('update public.user_reports set status=NULL where id=%L::uuid',current_setting('cs403.fixture_report_id')),'23514');
do $$ declare n int; begin
  delete from public.user_reports where id=current_setting('cs403.fixture_report_id')::uuid;
  get diagnostics n=row_count; if n<>1 then raise exception 'Admin fixture delete failed'; end if;
end $$;
reset role;
insert into public.user_reports(id,reported_text,ai_probability,user_expected_label,status)
values(current_setting('cs403.fixture_report_id')::uuid,repeat('x',200),25,'Human','pending');

-- An allowlisted actor with a missing session must still be denied. No auth.sessions mutation.
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('cs403.admin_user_id'),
  'role','authenticated','session_id',current_setting('cs403.missing_session_id'))::text,true);
set local role authenticated;
select pg_temp.assert_no_visible_fixture();
reset role;
delete from report_security.admin_allowlist where user_id=current_setting('cs403.admin_user_id')::uuid;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('cs403.admin_user_id'),
  'role','authenticated','session_id',current_setting('cs403.admin_session_id'))::text,true);
set local role authenticated;
select pg_temp.assert_no_visible_fixture();
reset role;

-- Guard every original and any unexpected nonfixture row before mandatory rollback.
do $$ begin
  if exists(
    (select id,hash from pg_temp.cs403_baseline except
     select id,encode(sha256(convert_to(jsonb_build_array(id::text,reported_text,ai_probability::text,
       user_expected_label,status,to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))::text,'UTF8')),'hex')
     from public.user_reports where id<>current_setting('cs403.fixture_report_id')::uuid)
    union all
    (select id,encode(sha256(convert_to(jsonb_build_array(id::text,reported_text,ai_probability::text,
       user_expected_label,status,to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))::text,'UTF8')),'hex')
     from public.user_reports where id<>current_setting('cs403.fixture_report_id')::uuid
     except select id,hash from pg_temp.cs403_baseline))
  then raise exception 'Original/nonfixture evidence changed'; end if;
end $$;
rollback;
-- Runner MUST compare original hashes again outside this transaction, assert both
-- report fixture IDs and the newly added allowlist row absent, then close session.
-- Errors must abort/ROLLBACK, never resume statements or substitute COMMIT.
