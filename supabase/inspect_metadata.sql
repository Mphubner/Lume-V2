-- Read-only metadata inspection. Never selects financial records, auth.users,
-- credentials, session tokens or function source. Run as a project administrator.
-- The CLI wrapper also enforces a READ ONLY transaction and a statement timeout.
WITH relations AS (
 SELECT c.oid,n.nspname AS schema,c.relname AS name,c.relkind,
        c.relrowsecurity AS rls,c.relforcerowsecurity AS force_rls,c.reloptions
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('public','storage','auth') AND c.relkind IN ('r','p','v','m')
), roles AS (
 SELECT oid,rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')
)
SELECT jsonb_build_object(
 'captured_at',current_timestamp,'database',current_database(),'postgres_version',current_setting('server_version'),
 'roles',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',rolname,'superuser',rolsuper,'bypass_rls',rolbypassrls)), '[]'::jsonb)
          FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')),
 'tables',(SELECT coalesce(jsonb_agg(jsonb_build_object(
   'schema',r.schema,'name',r.name,'kind',r.relkind,'rls',r.rls,'force_rls',r.force_rls,'options',r.reloptions,
   'columns',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
       'nullable',NOT a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated) ORDER BY a.attnum),'[]'::jsonb)
     FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
     WHERE a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped),
   'constraints',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',conname,'type',contype,'validated',convalidated,
       'definition',pg_get_constraintdef(oid)) ORDER BY conname),'[]'::jsonb) FROM pg_constraint WHERE conrelid=r.oid),
   'indexes',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',ic.relname,'valid',ix.indisvalid,'definition',pg_get_indexdef(ix.indexrelid)) ORDER BY ic.relname),'[]'::jsonb)
     FROM pg_index ix JOIN pg_class ic ON ic.oid=ix.indexrelid WHERE ix.indrelid=r.oid),
   'grants',(SELECT coalesce(jsonb_agg(jsonb_build_object('role',g.rolname,'select',has_table_privilege(g.oid,r.oid,'SELECT'),
       'insert',has_table_privilege(g.oid,r.oid,'INSERT'),'update',has_table_privilege(g.oid,r.oid,'UPDATE'),
       'delete',has_table_privilege(g.oid,r.oid,'DELETE'),'truncate',has_table_privilege(g.oid,r.oid,'TRUNCATE'),
       'references',has_table_privilege(g.oid,r.oid,'REFERENCES'),'trigger',has_table_privilege(g.oid,r.oid,'TRIGGER')) ORDER BY g.rolname),'[]'::jsonb) FROM roles g),
   'policies',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',policyname,'command',cmd,'roles',p.roles,'permissive',permissive,
       'using',qual,'check',with_check) ORDER BY policyname),'[]'::jsonb) FROM pg_policies p WHERE p.schemaname=r.schema AND p.tablename=r.name),
   'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',tgname,'enabled',tgenabled,'definition',pg_get_triggerdef(oid)) ORDER BY tgname),'[]'::jsonb)
     FROM pg_trigger WHERE tgrelid=r.oid AND NOT tgisinternal)
 ) ORDER BY r.schema,r.name),'[]'::jsonb) FROM relations r),
 'functions',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.proname,'arguments',pg_get_function_identity_arguments(p.oid),
   'returns',pg_get_function_result(p.oid),'security_definer',p.prosecdef,'settings',p.proconfig,'source_md5',md5(p.prosrc),
   'execute',(SELECT jsonb_object_agg(g.rolname,has_function_privilege(g.oid,p.oid,'EXECUTE')) FROM roles g)) ORDER BY p.proname,p.oid),'[]'::jsonb)
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p')),
 'schema_grants',(SELECT coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'role',g.rolname,
   'usage',has_schema_privilege(g.oid,n.oid,'USAGE'),'create',has_schema_privilege(g.oid,n.oid,'CREATE')) ORDER BY n.nspname,g.rolname),'[]'::jsonb)
   FROM pg_namespace n CROSS JOIN roles g WHERE n.nspname IN ('public','storage','auth'))
) AS inspection;
