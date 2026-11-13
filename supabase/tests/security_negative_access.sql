-- ISOLATED SUPABASE DATABASE ONLY. Never run this file on ai-detect-db.
-- Apply the reviewed migration to an empty disposable clone first.
-- Explicit operator opt-in: SET cs403.isolated_security_test = 'yes';
begin;
do $$ begin
  if current_setting('cs403.isolated_security_test', true) is distinct from 'yes' then
    raise exception 'Refusing security fixtures without isolated-test opt-in';
  end if;
end $$;
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000000001','admin@example.invalid'),
 ('00000000-0000-4000-8000-000000000002','ordinary@example.invalid');
insert into auth.sessions(id,user_id) values
 ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000002');
insert into report_security.admin_allowlist(user_id) values('00000000-0000-4000-8000-000000000001');
insert into public.user_reports(id,reported_text,ai_probability,user_expected_label,status)
 values('00000000-0000-4000-8000-000000000005',repeat('x',200),25,'Human','pending');
create function pg_temp.expect_denied(statement text) returns void language plpgsql as $$
begin
  begin execute statement; exception when insufficient_privilege then return; end;
  raise exception 'Expected insufficient privilege: %',statement;
end $$;
set local role anon;
select pg_temp.expect_denied('select * from public.user_reports');
select pg_temp.expect_denied('truncate public.user_reports');
select pg_temp.expect_denied('insert into public.user_reports(reported_text,ai_probability,user_expected_label) values (repeat(''x'',200),50,''Human'')');
select pg_temp.expect_denied('update public.user_reports set status=''approved''');
select pg_temp.expect_denied('delete from public.user_reports');
select pg_temp.expect_denied('select public.ingest_verified_feedback(''{}''::jsonb,repeat(''a'',64))');
reset role;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"00000000-0000-4000-8000-000000000004","user_metadata":{"admin":true}}';
set local role authenticated;
do $$ declare n integer; begin
  if public.is_report_admin() then raise exception 'Ordinary account escalated'; end if;
  select count(*) into n from public.user_reports; if n<>0 then raise exception 'Ordinary user read reports'; end if;
  update public.user_reports set status='approved'; get diagnostics n = row_count;
  if n<>0 then raise exception 'Ordinary user modified reports'; end if;
  delete from public.user_reports; get diagnostics n = row_count;
  if n<>0 then raise exception 'Ordinary user deleted reports'; end if;
end $$;
select pg_temp.expect_denied('truncate public.user_reports');
select pg_temp.expect_denied('insert into report_security.admin_allowlist values (auth.uid(),now())');
select pg_temp.expect_denied('select public.ingest_verified_feedback(''{}''::jsonb,repeat(''a'',64))');
reset role;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"00000000-0000-4000-8000-000000000003"}';
set local role authenticated;
do $$ declare n integer; begin
 if not public.is_report_admin() then raise exception 'Admin denied'; end if;
 select count(*) into n from public.user_reports; if n<>1 then raise exception 'Admin cannot read fixture'; end if;
 update public.user_reports set status='approved'; get diagnostics n = row_count;
 if n<>1 then raise exception 'Admin cannot update status'; end if;
end $$;
select pg_temp.expect_denied('update public.user_reports set reported_text=repeat(''y'',200)');
select pg_temp.expect_denied('truncate public.user_reports');
reset role;
update auth.sessions set not_after=now()-interval '1 minute' where user_id='00000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin if public.is_report_admin() or exists(select 1 from public.user_reports) then raise exception 'Expired session allowed'; end if; end $$;
reset role;
update auth.sessions set not_after=null where user_id='00000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ declare n integer; begin
 delete from public.user_reports; get diagnostics n=row_count;
 if n<>1 then raise exception 'Admin cannot delete fixture'; end if;
end $$;
reset role;
insert into public.user_reports(reported_text,ai_probability,user_expected_label,status) values(repeat('x',200),25,'Human','pending');
delete from report_security.admin_allowlist;
set local role authenticated;
do $$ begin if public.is_report_admin() or exists(select 1 from public.user_reports) then raise exception 'Allowlist revocation ineffective'; end if; end $$;
reset role;
rollback;
-- Additional release gate: run parallel service-role ingestion calls and assert
-- exactly 10/min and 100/hour committed rows, rejected duplicates, rollback on
-- invalid values, and expiry/removal of auth.sessions. Unit mocks cannot prove this.
