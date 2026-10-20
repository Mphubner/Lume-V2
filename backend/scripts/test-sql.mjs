import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile,readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { runMigrations } from './migrate.mjs';
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
 await db.query(await readFile(path.join(root,'supabase/schema.sql'),'utf8'));
 await runMigrations(db,{apply:true});
 // Running again proves migration history is idempotent and checksummed.
 if((await runMigrations(db,{apply:true})).length!==0)throw new Error('Migrações reaplicadas indevidamente.');
 const files=(await readdir(path.join(root,'backend/test/sql'))).filter(n=>n.endsWith('.sql')&&n!=='bootstrap.sql').sort();
 for(const name of files){
  const source=(await readFile(path.join(root,'backend/test/sql',name),'utf8')).replace(/^\\set .*$/gm,'');
  const results=await db.query(source);const summaries=(Array.isArray(results)?results:[results]).flatMap(r=>r.rows||[]);
  console.log(JSON.stringify({test:name,status:'passed',summaries}));
 }
}catch(error){console.error('SQL validation failed:',error.message);process.exitCode=1;}
finally{if(db)await db.end();await admin.query('DROP DATABASE '+database+' WITH (FORCE)');await admin.end();}
