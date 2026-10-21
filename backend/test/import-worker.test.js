import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256 } from '../src/domain/importParsers.js';
import { processImportJob, runImportWorkerOnce, startImportWorker } from '../src/services/importWorker.js';

const csv = Buffer.from('Data;Descrição;Valor\n01/01/2026;Pix mercado;-50,25');
function fixture({ buffer = csv, stageError, lostResponse = false, hash = sha256(buffer) } = {}) {
  const calls = [], state = { status: 'processing', stageCount: 0, chunks: new Map(), manifest:null, pages:[] };
  const job = { id: 'job-1', lease_token: 'lease-1', file_type: 'csv', file_size: buffer.length, document_hash: hash, storage_path: 'workspace/job/source.csv', parser_options: {} };
  const db = {
    storage: { from: () => ({ download: async () => ({ data: new Blob([buffer]), error: null }) }) },
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === 'claim_import_job') return { data: state.status === 'processing' ? [job] : [], error: null };
      if (name === 'heartbeat_import_job') return { data: true, error: null };
      if(name==='read_import_pipeline')return {data:{manifest:state.manifest,chunks:[...state.chunks.keys()],pages:state.pages},error:null};
      if(name==='begin_import_pipeline'){state.manifest=JSON.parse(args.p_manifest);return {data:{chunks:[...state.chunks.keys()]},error:null};}
      if(name==='append_import_chunk'){state.chunks.set(args.p_index,JSON.parse(args.p_payload));return {data:true,error:null};}
      if(name==='checkpoint_import_page'){state.pages.push({page:args.p_page,text:args.p_text,info:args.p_info});return {data:true,error:null};}
      if (name === 'finish_import_pipeline') {
        if (stageError) return { data: null, error: stageError };
        state.status = 'needs_review'; state.stageCount++;
        if (lostResponse) throw new Error('network response lost');
        return { data: { status: 'needs_review', total_transactions: state.manifest.rows }, error: null };
      }
      if (name === 'fail_import_job') {
        if (state.status === 'processing') state.status = args.p_retry ? 'queued' : 'failed';
        return { data: state.status !== 'needs_review', error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
  };
  return { db, job, calls, state };
}

test('worker verifies source and stages one complete batch without direct financial writes', async () => {
  const { db, job, calls, state } = fixture();
  const result = await processImportJob(db, job);
  assert.equal(result.ok, true);
  assert.equal(state.status, 'needs_review');
  const rows=JSON.parse(calls.find(call=>call.name==='append_import_chunk').args.p_payload);
  assert.equal(rows[0].amount_cents, '-5025');
  assert.equal(rows[0].economic_kind, 'standard');
  assert.equal(state.manifest.metadata.document_hash, job.document_hash);
});

test('database constraint failure cannot report success or counted persisted rows', async () => {
  const { db, job, state } = fixture({ stageError: { code: '23503', message: 'FK rejected' } });
  const result = await processImportJob(db, job);
  assert.equal(result.ok, false);
  assert.equal(result.retryable, false);
  assert.equal(state.status, 'failed');
  assert.equal(state.stageCount, 0);
});

test('invalid row or corrupt stored document fails before staging anything', async () => {
  for (const config of [{ hash: 'wrong' }, { buffer: Buffer.from('Data;Descrição;Valor\n31/02/2026;Compra;-10,00') }]) {
    const { db, job, calls, state } = fixture(config);
    assert.equal((await processImportJob(db, job)).ok, false);
    assert.equal(calls.some(call => call.name === 'finish_import_pipeline'), false);
    assert.equal(state.status, 'failed');
  }
});

test('lost database response after commit preserves needs_review and never restages on next poll', async () => {
  const { db, job, state } = fixture({ lostResponse: true });
  assert.equal((await processImportJob(db, job)).ok, false);
  assert.equal(state.status, 'needs_review');
  assert.equal(await runImportWorkerOnce(db), null);
  assert.equal(state.stageCount, 1);
});

test('a restarted process can claim and reconstruct from persisted source without RAM state', async () => {
  const { db, state } = fixture();
  const result = await runImportWorkerOnce(db);
  assert.equal(result.ok, true);
  assert.equal(state.status, 'needs_review');
});

test('shutdown abort keeps job recoverable instead of publishing a partial batch', async () => {
  const { db, job, calls, state } = fixture();
  const controller = new AbortController(); controller.abort();
  const result = await processImportJob(db, job, { signal: controller.signal });
  assert.equal(result.ok, false);
  assert.equal(state.status, 'queued');
  assert.equal(calls.some(call => call.name === 'finish_import_pipeline'), false);
});

test('large source is persisted in bounded chunks and resumes after a lost chunk response',async()=>{
  const buffer=Buffer.from('Data;Descrição;Valor\n'+Array.from({length:1201},(_,i)=>`01/01/2026;Movimento ${i};-0,01`).join('\n'));
  const {db,job,calls,state}=fixture({buffer});const rpc=db.rpc;let interrupted=false;
  db.rpc=async(name,args)=>{const result=await rpc(name,args);if(name==='append_import_chunk'&&args.p_index===2&&!interrupted){interrupted=true;throw new Error('response lost');}return result;};
  assert.equal((await processImportJob(db,job)).ok,false);
  assert.equal(state.stageCount,0);assert.equal(state.chunks.size,2);assert.equal(state.status,'queued');
  state.status='processing';
  assert.equal((await processImportJob(db,job)).ok,true);
  assert.equal(state.stageCount,1);assert.equal(state.manifest.rows,1201);
  assert.deepEqual([...state.chunks.values()].map(chunk=>chunk.length),[500,500,201]);
  assert.equal(calls.filter(call=>call.name==='append_import_chunk'&&call.args.p_index===1).length,1);
});

test('complete chunks resume finalization without parsing or exposing partial review',async()=>{
 const {db,job,state}=fixture();const rpc=db.rpc;let fail=true;
 db.rpc=async(name,args)=>{if(name==='finish_import_pipeline'&&fail){fail=false;throw new Error('network down before finish');}return rpc(name,args);};
 assert.equal((await processImportJob(db,job)).ok,false);assert.equal(state.stageCount,0);
 state.status='processing';job.file_type='unsupported';
 assert.equal((await processImportJob(db,job)).resumed,true);assert.equal(state.stageCount,1);
});

test('worker reports successful empty polls and clears readiness only after a healthy cycle', async () => {
  let success = 0, errors = 0;
  const query = { select() { return this; }, in() { return this; }, lt() { return this; }, is() { return this; }, not() { return this; }, async limit() { return { data: [], error: null }; } };
  const db = { rpc: async () => ({ data: [], error: null }), from: () => query };
  const worker = startImportWorker(db, { intervalMs: 60000, onSuccess: () => success++, onError: () => errors++ });
  await worker.runOnce();
  assert.equal(success, 1);
  assert.equal(errors, 0);
  db.rpc = async () => ({ data: null, error: new Error('database unavailable') });
  await worker.runOnce();
  assert.equal(success, 1);
  assert.equal(errors, 1);
  await worker.stop();
});
