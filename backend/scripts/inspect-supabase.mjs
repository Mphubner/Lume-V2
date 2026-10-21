import { Client } from 'pg';
import { readFile,writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { migrationFiles } from './migrate.mjs';
import 'dotenv/config';

// Reads catalogue and deployment history only. Does not call application RPCs.
export async function inspectDatabase(client) {
 await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
 try {
  await client.query("SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='3s'");
  const sql=await readFile(new URL('../../supabase/inspect_metadata.sql',import.meta.url),'utf8');
  const inspection=(await client.query(sql)).rows[0].inspection;
  const ledger=inspection.tables.some(t=>t.schema==='public'&&t.name==='lume_schema_migrations');
  const applied=ledger?(await client.query('SELECT version,checksum,applied_at FROM public.lume_schema_migrations ORDER BY version')).rows:[];
  const files=await migrationFiles();
  inspection.migrations={ledger_present:ledger,applied,pending:files.filter(f=>!applied.some(a=>a.version===f.name)).map(f=>f.name),
   divergent:applied.filter(a=>!files.some(f=>f.name===a.version&&f.checksum===a.checksum)).map(a=>a.version)};
  const buckets=inspection.tables.find(t=>t.schema==='storage'&&t.name==='buckets');
  inspection.import_bucket=buckets?(await client.query("SELECT id,name,public,file_size_limit FROM storage.buckets WHERE id='financial-imports'")).rows:[];
  inspection.limitations=['Metadata only: no live cross-user authorization tests, email delivery or AI provider request.',
   'Auth providers, confirmation, redirects, SMTP and API schema exposure require separate Dashboard inspection.',
   'Migration history alone does not prove schema integrity; review policies, grants, functions and constraints.'];
  await client.query('COMMIT');return inspection;
 } catch(error) {await client.query('ROLLBACK');throw error;}
}
async function main() {
 if(!process.env.DATABASE_URL)throw new Error('Configure DATABASE_URL no ambiente; não passe credenciais na linha de comando.');
 const url=new URL(process.env.DATABASE_URL),local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 const client=new Client({connectionString:process.env.DATABASE_URL,...(!local?{ssl:{rejectUnauthorized:true}}:{})});
 await client.connect();
 try {
  const snapshot=await inspectDatabase(client),serialized=JSON.stringify(snapshot,null,2)+'\n';
  const output=process.env.SUPABASE_INSPECTION_PATH;
  if(output){await writeFile(output,serialized,{encoding:'utf8',flag:'wx'});console.log(JSON.stringify({status:'inspected',output,pending:snapshot.migrations.pending,divergent:snapshot.migrations.divergent}));}
  else console.log(serialized);
 } finally {await client.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{
 console.error('Inspeção não concluída:',error.code||'configuration_or_connection_error');process.exitCode=1;
});
