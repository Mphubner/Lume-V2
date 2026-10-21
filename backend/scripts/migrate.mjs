import { Client } from 'pg';
import { readFile,readdir,stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath,pathToFileURL } from 'node:url';
import path from 'node:path';
import 'dotenv/config';
const root=fileURLToPath(new URL('../../',import.meta.url));
export function migrationBody(source) {
 const body=source.replace(/^\uFEFF/,'').replace(/^\s*(?:--[^\n]*\n\s*)*BEGIN;\s*/,'').replace(/\s*COMMIT;\s*$/,'');
 if(body===source||/^\s*BEGIN;/.test(body))throw new Error('Migração deve declarar uma transação externa.');
 return body;
}
export async function migrationFiles(){
 const dir=path.join(root,'supabase','migrations');
 return Promise.all((await readdir(dir)).filter(n=>/^\d{12}_[a-z_]+\.sql$/.test(n)).sort().map(async name=>{
  const sql=(await readFile(path.join(dir,name),'utf8')).replace(/^\uFEFF/,'').replace(/\r\n/g,'\n');
  return {name,sql,checksum:createHash('sha256').update(sql).digest('hex')};
 }));
}
export async function runMigrations(client,{apply=false,onProgress=console.log}={}){
 await client.query("SELECT pg_advisory_lock(hashtext('lume-schema-migrations'))");
 try{
  const exists=(await client.query("SELECT to_regclass('public.lume_schema_migrations') AS table_name")).rows[0].table_name;
  const applied=exists?(await client.query('SELECT version,checksum FROM public.lume_schema_migrations ORDER BY version')).rows:[];
  const files=await migrationFiles();
  for(const entry of applied){const file=files.find(f=>f.name===entry.version);if(!file||file.checksum!==entry.checksum)throw new Error('Histórico de migração diverge: '+entry.version);}
  const pending=files.filter(f=>!applied.some(a=>a.version===f.name));
  onProgress(JSON.stringify({applied:applied.length,pending:pending.map(f=>f.name),mode:apply?'apply':'plan'}));
  if(!apply)return pending;
  if(!(await client.query("SELECT to_regclass('public.profiles') AS table_name")).rows[0].table_name)throw new Error('Schema base ausente. Crie ambiente vazio pelo procedimento documentado.');
  await client.query('CREATE TABLE IF NOT EXISTS public.lume_schema_migrations(version text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now()); REVOKE ALL ON public.lume_schema_migrations FROM PUBLIC,anon,authenticated;');
  for(const file of pending){
   await client.query('BEGIN');
   try{
    await client.query("SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='120s'");
    await client.query(migrationBody(file.sql));
    await client.query('INSERT INTO public.lume_schema_migrations(version,checksum) VALUES($1,$2)',[file.name,file.checksum]);
    await client.query('COMMIT');onProgress('Applied '+file.name);
   }catch(error){await client.query('ROLLBACK');throw error;}
  }
  return pending;
 }finally{await client.query("SELECT pg_advisory_unlock(hashtext('lume-schema-migrations'))");}
}
async function main(){
 if(!process.env.DATABASE_URL)throw new Error('Configure DATABASE_URL sem colocá-la na linha de comando.');
 const url=new URL(process.env.DATABASE_URL),local=['localhost','127.0.0.1','[::1]'].includes(url.hostname),apply=process.argv.includes('--apply');
 if(apply&&!local){
  if(process.env.CONFIRM_MIGRATION_TARGET!==url.hostname+url.pathname)throw new Error('Informe CONFIRM_MIGRATION_TARGET com host/banco exatos.');
  const backup=process.env.MIGRATION_BACKUP_PATH;
  if(!backup||!(await stat(backup)).isFile()||(await stat(backup)).size===0)throw new Error('Backup local verificável obrigatório antes de migração remota.');
 }
 const client=new Client({connectionString:process.env.DATABASE_URL,...(!local?{ssl:{rejectUnauthorized:true}}:{})});await client.connect();
 try{await runMigrations(client,{apply});}finally{await client.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error('Migration failed:',error.code||error.message);process.exitCode=1;});
