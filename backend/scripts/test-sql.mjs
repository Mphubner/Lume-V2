import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile,readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { runMigrations } from './migrate.mjs';
import { inspectDatabase } from './inspect-supabase.mjs';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../',import.meta.url));
const url=new URL(process.env.TEST_DATABASE_URL||'postgresql://lume_test@127.0.0.1:55439/postgres');
if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw new Error('Testes SQL exigem Postgres local descartável.');
const database='lume_test_'+randomUUID().replaceAll('-','');
if(!/^lume_test_[0-9a-f]{32}$/.test(database))throw new Error('Nome de banco de teste inválido.');
const admin=new Client({connectionString:url.href});await admin.connect();let db;
try{
 await admin.query('CREATE DATABASE '+database);url.pathname='/'+database;
 db=new Client({connectionString:url.href});await db.connect();
 db.on('notice',n=>{if(n.severity==='WARNING')console.error(n.message);});
 await db.query(await readFile(path.join(root,'backend/test/sql/bootstrap.sql'),'utf8'));
 const legacy=process.argv.includes('--legacy-schema');
 await db.query(await readFile(path.join(root,legacy?'backend/test/fixtures/legacy-production-schema.sql':'supabase/schema.sql'),'utf8'));
 await runMigrations(db,{apply:true});
 // Running again proves migration history is idempotent and checksummed.
 if((await runMigrations(db,{apply:true})).length!==0)throw new Error('Migrações reaplicadas indevidamente.');
 const inspection=await inspectDatabase(db);
 assert.equal(inspection.migrations.pending.length,0);
 assert.equal(inspection.migrations.divergent.length,0);
 const transactions=inspection.tables.find(t=>t.schema==='public'&&t.name==='transactions');
 assert.equal(transactions.rls,true);
 assert.ok(transactions.columns.some(c=>c.name==='workspace_id'));
 assert.ok(transactions.policies.length>0);
 assert.equal(transactions.grants.find(g=>g.role==='authenticated').insert,false);
 assert.equal(inspection.import_bucket[0].public,false);
 assert.ok(inspection.functions.some(f=>f.name==='mutate_financial_record'&&f.security_definer&&f.execute.service_role&&!f.execute.authenticated));
 if(legacy){
  const cache=inspection.tables.find(t=>t.schema==='public'&&t.name==='ai_insights_cache');
  assert.equal(cache.grants.find(g=>g.role==='authenticated').select,false);
  assert.equal(cache.grants.find(g=>g.role==='anon').truncate,false);
 }
 console.log(JSON.stringify({test:'read_only_metadata_inspection',status:'passed',tables:inspection.tables.length,functions:inspection.functions.length}));
 const files=(await readdir(path.join(root,'backend/test/sql'))).filter(n=>n.endsWith('.sql')&&n!=='bootstrap.sql').sort();
 for(const name of files){
  const source=(await readFile(path.join(root,'backend/test/sql',name),'utf8')).replace(/^\\set .*$/gm,'');
  const results=await db.query(source);const summaries=(Array.isArray(results)?results:[results]).flatMap(r=>r.rows||[]);
  console.log(JSON.stringify({test:name,status:'passed',summaries}));
 }
}catch(error){console.error('SQL validation failed:',error.message);process.exitCode=1;}
finally{if(db)await db.end();await admin.query('DROP DATABASE '+database+' WITH (FORCE)');await admin.end();}
