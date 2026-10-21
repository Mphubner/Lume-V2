import { parseStatementBuffer, sha256, ImportError } from '../domain/importParsers.js';
import { extractTransactionsFromPDF, extractTransactionsFromImage } from './pdfExtractor.js';
import { extractSpreadsheet } from './spreadsheetExtractor.js';
import { prepareImportChunks } from './importPipeline.js';
import { MAX_IMPORT_BYTES } from '../domain/importLimits.js';

export const IMPORT_BUCKET = 'financial-imports';
const getData = result => { if (result.error) throw result.error; return result.data; };

function bounded(promise, milliseconds, signal) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(result);
    };
    const abort = () => finish(Object.assign(new Error('Worker interrompido; o lote será retomado.'), { code: 'WORKER_STOPPED', retryable: true }));
    const timer = setTimeout(() => finish(Object.assign(new Error('Serviço excedeu o prazo; nova tentativa será agendada.'), { code: 'SERVICE_TIMEOUT', retryable: true })), milliseconds);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    promise.then(result => finish(null, result), error => finish(error));
  });
}

export async function processImportJob(db, job, { signal, pdfExtractor = extractTransactionsFromPDF, heartbeatMs = 25000 } = {}) {
  let lostLease = false;
  const heartbeat = setInterval(async () => {
    try { if (!getData(await db.rpc('heartbeat_import_job', { p_import: job.id, p_lease: job.lease_token }))) lostLease = true; }
    catch { lostLease = true; }
  }, heartbeatMs);
  heartbeat.unref?.();
  try {
    const blob = getData(await bounded(db.storage.from(IMPORT_BUCKET).download(job.storage_path), 30000, signal));
    if (!blob || blob.size > MAX_IMPORT_BYTES || blob.size !== Number(job.file_size)) throw new ImportError('SOURCE_SIZE_MISMATCH', 'Arquivo armazenado difere do upload. Nenhum lançamento foi aplicado.');
    const buffer = Buffer.from(await blob.arrayBuffer());
    if (sha256(buffer) !== job.document_hash) throw new ImportError('SOURCE_HASH_MISMATCH', 'Integridade do documento não confere. Nenhum lançamento foi aplicado.');
    const pipeline=getData(await bounded(db.rpc('read_import_pipeline',{p_import:job.id,p_lease:job.lease_token}),30000,signal));
    if(pipeline.manifest && pipeline.chunks.length===pipeline.manifest.chunks.length) {
      const staged=getData(await bounded(db.rpc('finish_import_pipeline',{p_import:job.id,p_lease:job.lease_token}),30000,signal));
      return {ok:true,importId:job.id,result:staged,resumed:true};
    }
    const extractionOptions={signal,cachedPages:pipeline.pages||[],onPage:async page=>{
      if(lostLease)throw Object.assign(new Error('Lease perdido.'),{code:'LEASE_LOST',retryable:true});
      getData(await bounded(db.rpc('checkpoint_import_page',{p_import:job.id,p_lease:job.lease_token,p_page:page.page,p_text:page.text,p_info:page.info}),30000,signal));
    }};
    const result = job.file_type === 'pdf' ? await pdfExtractor(buffer, [], extractionOptions)
      : job.file_type==='xlsx' ? await extractSpreadsheet(buffer,job.parser_options||{},extractionOptions)
      : ['png','jpg','jpeg'].includes(job.file_type) ? await extractTransactionsFromImage(buffer,job.file_type,extractionOptions)
      : parseStatementBuffer(buffer, job.file_type, job.parser_options || {});
    if (signal?.aborted || lostLease) throw Object.assign(new Error('Worker perdeu autorização temporária; lote será retomado.'), { code: 'LEASE_LOST', retryable: true });
    const prepared=prepareImportChunks(result);
    const saved=getData(await bounded(db.rpc('begin_import_pipeline',{p_import:job.id,p_lease:job.lease_token,p_manifest:prepared.payload,p_hash:prepared.hash}),30000,signal));
    for(const chunk of prepared.chunks) {
      if(saved.chunks.includes(chunk.index))continue;
      if(signal?.aborted||lostLease)throw Object.assign(new Error('Worker interrompido.'),{code:'LEASE_LOST',retryable:true});
      getData(await bounded(db.rpc('append_import_chunk',{p_import:job.id,p_lease:job.lease_token,p_index:chunk.index,p_payload:chunk.payload,p_hash:chunk.hash}),30000,signal));
    }
    // Internal chunks never appear in review. The whole manifest is validated and
    // published to staging in one PostgreSQL transaction. Ledger approval remains atomic.
    const staged = getData(await bounded(db.rpc('finish_import_pipeline', {p_import:job.id,p_lease:job.lease_token}),30000,signal));
    return { ok: true, importId: job.id, result: staged };
  } catch (error) {
    const retryable = !(error instanceof ImportError) && error.retryable !== false && !['23503', '23505', '23514', 'P0001'].includes(error.code) && String(error.statusCode) !== '404';
    const code = error.code || 'PROCESSING_ERROR';
    const message = error instanceof ImportError ? error.message : retryable ? 'Falha temporária no processamento. A fila fará nova tentativa.' : 'Falha de validação ou persistência. Nenhum lançamento foi aplicado.';
    // If staging committed but its response was lost, its status is needs_review and
    // this CAS returns false; a retry never changes the already staged result.
    try { getData(await db.rpc('fail_import_job', { p_import: job.id, p_lease: job.lease_token, p_code: code, p_message: message, p_retry: retryable })); }
    catch { /* Persisted lease expiration is the recovery path if the database is down. */ }
    return { ok: false, importId: job.id, code, retryable };
  } finally { clearInterval(heartbeat); }
}

export async function runImportWorkerOnce(db, options = {}) {
  const jobs = getData(await db.rpc('claim_import_job'));
  if (!jobs?.length) return null;
  return processImportJob(db, jobs[0], options);
}

export async function cleanupExpiredImportSources(db, now = new Date()) {
  const jobs = getData(await db.from('imports').select('id,storage_path').in('status', ['completed', 'failed', 'cancelled', 'reversed'])
    .lt('source_expires_at', now.toISOString()).is('source_deleted_at', null).not('storage_path', 'is', null).limit(20));
  for (const job of jobs || []) {
    getData(await db.storage.from(IMPORT_BUCKET).remove([job.storage_path]));
    getData(await db.rpc('complete_import_source_cleanup',{p_import:job.id,p_storage_path:job.storage_path}));
  }
  // Replaced upload paths remain discoverable after a crash; retain the original
  // expiry and delete the private pointer only after Storage acknowledges removal.
  const retired=getData(await db.from('import_retired_sources').select('import_id,storage_path').lt('expires_at',now.toISOString()).limit(20));
  for(const source of retired||[]) {
    getData(await db.storage.from(IMPORT_BUCKET).remove([source.storage_path]));
    getData(await db.rpc('complete_retired_import_source_cleanup',{p_import:source.import_id,p_storage_path:source.storage_path}));
  }
  return jobs?.length || 0;
}

/** One process handles one job at a time; database leases also cap all replicas. */
export function startImportWorker(db, { intervalMs = 5000, onSuccess = () => {}, onError = error => console.error(JSON.stringify({ event: 'import_worker_error', code: error.code || 'database' })) } = {}) {
  let stopped = false, running = null, timer, lastCleanup = 0;
  const controller = new AbortController();
  const tick = () => {
    if (stopped || running) return running;
    running = (async () => {
      try {
        const result = await runImportWorkerOnce(db, { signal: controller.signal });
        if (!stopped && Date.now() - lastCleanup > 3600000) {
          await cleanupExpiredImportSources(db); lastCleanup = Date.now();
        }
        if (!stopped) onSuccess(result);
        return result;
      } catch (error) { onError(error); return null; }
      finally { running = null; }
    })();
    return running;
  };
  timer = setInterval(tick, intervalMs); timer.unref?.();
  void tick();
  return {
    runOnce: tick,
    async stop() { stopped = true; clearInterval(timer); controller.abort(); if (running) await bounded(running, 5000).catch(() => {}); },
  };
}
