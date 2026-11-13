-- PREPARED ONLY. SELECT-only verification after a separately approved migration.
-- Contains no report text, Auth identity/session enumeration or credentials.
select current_user as executor,current_setting('server_version') as server_version,
  to_regclass('supabase_migrations.schema_migrations')::text as migration_history;

select count(*) as report_count,
  jsonb_agg(encode(sha256(convert_to(jsonb_build_array(id::text,reported_text,ai_probability::text,
    user_expected_label,status,to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))::text,'UTF8')),'hex') order by id) as six_field_fingerprints,
  count(*) filter(where model_id is null and model_category is null and model_probabilities is null) as legacy_metadata_null_count
from public.user_reports;

select c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) as owner,
 (select count(*) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as column_count
from pg_class c where c.oid='public.user_reports'::regclass;
select policyname,cmd,roles,qual,with_check from pg_policies
where schemaname='public' and tablename='user_reports' order by policyname;
select conname,convalidated,pg_get_constraintdef(oid) as definition from pg_constraint
where conrelid='public.user_reports'::regclass order by conname;

select r.role,p.privilege,has_table_privilege(r.role,'public.user_reports',p.privilege) as allowed
from unnest(array['anon','authenticated','service_role']) r(role)
cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p(privilege)
order by r.role,p.privilege;
select a.attname as column,r.role,p.privilege,
  has_column_privilege(r.role,'public.user_reports',a.attname,p.privilege) as allowed
from pg_attribute a
cross join unnest(array['anon','authenticated','service_role']) r(role)
cross join unnest(array['INSERT','UPDATE','REFERENCES']) p(privilege)
where a.attrelid='public.user_reports'::regclass and a.attnum>0 and not a.attisdropped
order by a.attnum,r.role,p.privilege;

select n.nspname as schema,p.proname,pg_get_userbyid(p.proowner) as owner,
  p.prosecdef as security_definer,p.proconfig,
  (select jsonb_agg(jsonb_build_object('grantee',case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,
    'privilege',x.privilege_type,'grantable',x.is_grantable))
   from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x) as grants
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='report_security' and p.proname in ('is_admin','ingest_feedback'))
   or (n.nspname='public' and p.proname in ('is_report_admin','ingest_verified_feedback'))
order by n.nspname,p.proname;
select n.nspname,c.relname,c.relrowsecurity,pg_get_userbyid(c.relowner) as owner,c.relacl
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='report_security' and c.relkind='r' order by c.relname;
select count(*) as allowlist_count from report_security.admin_allowlist;
-- Expect two unchanged hashes immediately after application, nine columns,
-- three admin-only policies, FORCE RLS; only authenticated SELECT/DELETE plus
-- UPDATE(status), no browser INSERT or destructive grants; no PUBLIC function
-- EXECUTE; trusted definer owners and empty search_path; empty allowlist before
-- separately authorized setup. Verify actual Data API exposed schemas separately.
-- Read migration version/name (no statements) ONLY after history existence is confirmed.
