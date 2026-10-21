import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';
import { HTTPError, assertUUID, checked, requireRecordAccess, resolveScope, scopeQuery, handleError } from '../services/access.js';
import { sha256, ImportError, parseAmountCents, centsToDecimal, parseStatementDate, MAX_IMPORT_ROWS } from '../domain/importParsers.js';
import { MAX_IMPORT_BYTES } from '../domain/importLimits.js';
import { getImportCapabilities } from '../services/importPipeline.js';
import { convertStatement } from '../domain/statementConversion.js';
import { IMPORT_BUCKET } from '../services/importWorker.js';
import { enrichFinancialRows } from '../services/relations.js';

const router = Router();
router.use(authMiddleware);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMPORT_BYTES, files: 1, fields: 8, fieldSize: 8192 } }).single('file');
// Admission control happens BEFORE buffering a file. Durable queue limits also
// apply across instances, once the document hash and authorized account are known.
export function createBoundedUpload(uploadHandler=upload) {
 const activeUploads = new Set();
 return function boundedUpload(req, res, next) {
  if (activeUploads.size >= 4 || activeUploads.has(req.user.id)) return res.status(429).json({ error: 'Já há um upload em andamento. Tente novamente em instantes.' });
  activeUploads.add(req.user.id);
  const release = () => activeUploads.delete(req.user.id);
  res.once('finish', release); res.once('close', release);
  uploadHandler(req, res, error => {
    if (error) { release(); return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Arquivo excede o limite de 20 MB.' : 'Upload inválido. Envie um único arquivo.' }); }
    next();
  });
 };
}
const boundedUpload=createBoundedUpload();

const publicJob = row => {
  const { storage_path: _storage, lease_token: _token, lease_until: _lease, pipeline_manifest: _manifest, ...rest } = row;
  return rest;
};
const pageNumber = (value, fallback, max = Number.MAX_SAFE_INTEGER) => {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > max) throw new HTTPError(400, 'Paginação inválida.');
  return number;
};
function fail(res, error) {
  if (error instanceof ImportError) return res.status(422).json({ error: error.message, code: error.code, details: error.details });
  return handleError(res, error);
}
function parseOptions(value) {
  let options = value || {};
  if (typeof options === 'string') {
    try { options = JSON.parse(options); } catch { throw new HTTPError(400, 'Mapeamento CSV inválido.'); }
  }
  if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(key => !['locale', 'delimiter', 'columns'].includes(key))) throw new HTTPError(400, 'Opções do extrato inválidas.');
  if (options.locale && !['pt-BR', 'en-US'].includes(options.locale)) throw new HTTPError(400, 'Locale inválido.');
  if (options.delimiter && ![';', ',', '\t'].includes(options.delimiter)) throw new HTTPError(400, 'Separador inválido.');
  if (options.columns && (typeof options.columns !== 'object' || Array.isArray(options.columns) || Object.entries(options.columns).some(([key, val]) => !['date','description','amount','debit','credit','external_id','currency'].includes(key) || !(typeof val === 'string' && val.length <= 80 || Number.isInteger(val) && val >= 0 && val < 100)))) throw new HTTPError(400, 'Mapeamento de colunas inválido.');
  return options;
}

router.post('/upload', boundedUpload, async (req, res) => {
  let job;
  try {
    if (!req.file?.buffer?.length) throw new HTTPError(400, 'Nenhum arquivo enviado.');
    assertUUID(req.body.account_id);
    const account = await requireRecordAccess(supabase, 'accounts', req.body.account_id, req.user.id, 'write');
    if (req.body.workspace && req.body.workspace !== account.workspace_id) {
      const scope = await resolveScope(supabase, req.user.id, req.body.workspace, 'write');
      if (scope.id !== account.workspace_id) throw new HTTPError(403, 'A conta não pertence ao espaço selecionado.');
    }
    const fileType = req.file.originalname.split('.').pop().toLowerCase();
    if (!['csv','ofx','pdf','xlsx','txt','png','jpg','jpeg'].includes(fileType)) throw new HTTPError(415, 'Use CSV, OFX, XLSX, TXT tabular, PDF ou imagem PNG/JPEG. Outros formatos não são convertidos.');
    if (['png','jpg','jpeg'].includes(fileType)) {
      const capabilities=await getImportCapabilities();
      if(!capabilities.ocr.available)throw new HTTPError(422,capabilities.ocr.reason);
    }
    const options = parseOptions(req.body.parser_options);
    job = checked(await supabase.rpc('reserve_import_job', {
      p_actor: req.user.id, p_id: randomUUID(), p_account: account.id, p_hash: sha256(req.file.buffer),
      p_filename: req.file.originalname.replace(/[\\/\x00-\x1f]/g, '_').slice(0, 240), p_type: fileType, p_size: req.file.size, p_options: options,
    }));
    if (job.existing) return res.status(200).json({ success: true, existing: true, status: job.status, importId: job.id, message: 'Este documento já possui um lote nesta conta. Consulte o histórico para revisar ou retentar.' });
    checked(await supabase.storage.from(IMPORT_BUCKET).upload(job.storage_path, req.file.buffer, { contentType: 'application/octet-stream', upsert: job.reupload === true, cacheControl: '0' }));
    const queued = checked(await supabase.rpc('enqueue_import_job', { p_actor: req.user.id, p_import: job.id }));
    return res.status(202).json({ success: true, status: queued.status, importId: queued.id, message: 'Documento salvo na fila. Os saldos só mudarão após a conferência e aprovação do lote.' });
  } catch (error) {
    if (job && !job.existing) {
      // A database outage leaves uploading; claim_import_job expires it explicitly.
      await supabase.from('imports').update({ status: 'failed', last_error_code: 'UPLOAD_FAILED', error_message: 'Não foi possível salvar ou enfileirar o arquivo.', updated_at: new Date().toISOString() }).eq('id', job.id).eq('status', 'uploading');
    }
    return fail(res, error);
  }
});

router.get('/capabilities',async (_req,res)=>res.json(await getImportCapabilities()));

router.get('/:id/convert',async (req,res)=>{
  try {
    const job=await requireRecordAccess(supabase,'imports',req.params.id,req.user.id);
    if(!['needs_review','completed','reversed'].includes(job.status))throw new HTTPError(409,'Aguarde a extração completa para converter o documento.');
    if(!['csv','ofx'].includes(req.query.format))throw new HTTPError(400,'Escolha CSV ou OFX.');
    const rows=[];
    for(let offset=0;offset<Number(job.total_transactions);offset+=500) {
      const page=checked(await supabase.from('import_rows').select('row_number,date,description,amount_cents,source_identity').eq('import_id',job.id).order('row_number').range(offset,offset+499));
      rows.push(...page);
    }
    const content=convertStatement(rows,job,req.query.format);
    return res.json({filename:`lume-conversao-${job.id}.${req.query.format}`,media_type:req.query.format==='csv'?'text/csv;charset=utf-8':'application/x-ofx;charset=utf-8',content,review_required:true,notice:'Conversão das linhas extraídas para conferência. Não comprova conferência, saldo bancário ou aprovação. Identificadores de conversão representam documento e linha; não foram emitidos pelo banco.'});
  }catch(error){return fail(res,error);}
});

router.get('/history', async (req, res) => {
  try {
    const scope = await resolveScope(supabase, req.user.id, req.query.workspace);
    const limit = pageNumber(req.query.limit, 30, 100) || 1;
    const offset = pageNumber(req.query.offset, 0);
    const rows = checked(await scopeQuery(supabase.from('imports').select('*'), scope).order('created_at', { ascending: false }).range(offset, offset + limit - 1));
    return res.json((await enrichFinancialRows(supabase,rows,scope,{accounts:true})).map(publicJob));
  } catch (error) { return fail(res, error); }
});

router.get('/pending', async (req, res) => {
  try {
    const scope = await resolveScope(supabase, req.user.id, req.query.workspace);
    const limit = pageNumber(req.query.limit, 100, 500) || 1;
    const offset = pageNumber(req.query.offset, 0);
    let query = scopeQuery(supabase.from('import_rows').select('*, imports!inner(status,filename,workspace_id)', { count: 'exact' }), scope).in('imports.workspace_id',scope.ids)
      .eq('imports.status', 'needs_review').order('import_id').order('row_number').range(offset, offset + limit - 1);
    if (req.query.import_id) query = query.eq('import_id', assertUUID(req.query.import_id));
    const result = await query; checked(result);
    return res.json({ transactions: await enrichFinancialRows(supabase,result.data||[],scope,{accounts:true}), total: result.count || 0, count: result.count || 0, limit, offset });
  } catch (error) { return fail(res, error); }
});

router.get('/rows/:id/candidates', async (req, res) => {
  try {
    const row = await requireRecordAccess(supabase, 'import_rows', req.params.id, req.user.id);
    const fields = 'id,date,description,amount,account_id,economic_kind,accounts(name,type)';
    const base = () => supabase.from('transactions').select(fields, { count: 'exact' }).eq('workspace_id', row.workspace_id)
      .eq('ledger_status', 'posted').eq('is_reconciled', true).eq('legacy_needs_review', false);
    const day = delta => new Date(new Date(`${row.date}T12:00:00Z`).getTime() + delta * 86400000).toISOString().slice(0, 10);
    const amount = centsToDecimal(row.amount_cents);
    const opposite = centsToDecimal(-BigInt(row.amount_cents));
    const standard = () => base().eq('economic_kind', 'standard').eq('is_internal_transfer', false).is('linked_transaction_id', null).is('transfer_group_id', null).is('reversal_of', null);
    const [duplicates, transfers, refunds] = await Promise.all([
      base().eq('account_id', row.account_id).eq('date', row.date).eq('amount', amount).order('id').limit(20),
      standard().neq('account_id', row.account_id).eq('amount', opposite).gte('date', day(-3)).lte('date', day(3)).order('date', { ascending: false }).order('id').limit(20),
      (BigInt(row.amount_cents) > 0n ? standard().lte('amount', opposite) : standard().gte('amount', opposite))
        .eq('account_id', row.account_id).lte('date', row.date).order('date', { ascending: false }).order('id').limit(20),
    ]);
    [duplicates, transfers, refunds].forEach(checked);
    const referenceIds = [...new Set([...transfers.data, ...refunds.data].map(item => item.id))];
    const previousRefunds = referenceIds.length ? checked(await supabase.from('transactions').select('reversal_of,amount').in('reversal_of', referenceIds).eq('ledger_status', 'posted')) : [];
    const used = new Map();
    for (const refund of previousRefunds) {
      const cents = BigInt(parseAmountCents(String(refund.amount)));
      used.set(refund.reversal_of, (used.get(refund.reversal_of) || 0n) + (cents < 0n ? -cents : cents));
    }
    const requested = BigInt(row.amount_cents) < 0n ? -BigInt(row.amount_cents) : BigInt(row.amount_cents);
    return res.json({
      duplicates: duplicates.data, transfers: transfers.data.filter(item => !used.has(item.id)),
      refunds: refunds.data.filter(item => {
        const cents = BigInt(parseAmountCents(String(item.amount)));
        return (cents < 0n ? -cents : cents) - (used.get(item.id) || 0n) >= requested;
      }),
      truncated: [duplicates, transfers, refunds].some(result => result.count > 20), limit: 20,
    });
  } catch (error) { return fail(res, error); }
});

router.patch('/rows/:id', async (req, res) => {
  try {
    assertUUID(req.params.id);
    const patch = req.body;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new HTTPError(400, 'Revisão inválida.');
    for (const field of ['category_id', 'duplicate_of', 'reversal_of', 'linked_transaction_id']) if (patch[field] !== undefined && patch[field] !== null) assertUUID(patch[field]);
    for (const field of ['distinct_confirmed', 'learn_rule']) if (patch[field] !== undefined && typeof patch[field] !== 'boolean') throw new HTTPError(400, 'Confirmação deve ser booleana.');
    return res.json(checked(await supabase.rpc('update_import_row', { p_actor: req.user.id, p_row: req.params.id, p_patch: patch })));
  } catch (error) { return fail(res, error); }
});

async function approve(actor, body) {
  assertUUID(body.import_id);
  if (!Array.isArray(body.ids) || !body.ids.length || body.ids.length > MAX_IMPORT_ROWS || new Set(body.ids).size !== body.ids.length) throw new HTTPError(400, 'Selecione explicitamente todas as linhas do lote.');
  body.ids.forEach(assertUUID);
  const balance = body.balance_check;
  if (!balance || balance.source_confirmed !== true) throw new HTTPError(400, 'Confira conta, documento, período e saldos antes de aprovar.');
  const checkedBalance = {
    opening_balance: centsToDecimal(parseAmountCents(String(balance.opening_balance ?? ''))),
    closing_balance: centsToDecimal(parseAmountCents(String(balance.closing_balance ?? ''))),
    period_start: parseStatementDate(balance.period_start), period_end: parseStatementDate(balance.period_end), source_confirmed: true,
  };
  return checked(await supabase.rpc('approve_import_rows', { p_actor: actor, p_import: body.import_id, p_ids: body.ids, p_balance: checkedBalance }));
}

router.patch('/reconcile-all', async (req, res) => {
  try { return res.json({ success: true, ...await approve(req.user.id, req.body) }); }
  catch (error) { return fail(res, error); }
});

// Compatibility endpoint only works for a one-row batch, never implicit approval.
router.patch('/reconcile/:id', async (req, res) => {
  try {
    if (req.body.approved !== true) throw new HTTPError(400, 'Use a revisão do lote; aprovação precisa ser explícita.');
    const row = await requireRecordAccess(supabase, 'import_rows', req.params.id, req.user.id, 'write');
    if (req.body.import_id !== row.import_id) throw new HTTPError(400, 'Informe o lote correto.');
    return res.json(await approve(req.user.id, { ...req.body, ids: [row.id] }));
  } catch (error) { return fail(res, error); }
});

router.get('/:id/source', async (req, res) => {
  try {
    const job = await requireRecordAccess(supabase, 'imports', req.params.id, req.user.id);
    if (!job.storage_path || job.source_deleted_at) throw new HTTPError(410, 'O arquivo original não está disponível. A proveniência das linhas permanece no lote.');
    const source = checked(await supabase.storage.from(IMPORT_BUCKET).createSignedUrl(job.storage_path, 300));
    return res.json({ url: source.signedUrl, expires_in: 300 });
  } catch (error) { return fail(res, error); }
});

router.post('/:id/reverse', async (req, res) => {
  try {
    assertUUID(req.params.id);
    if (typeof req.body.reason !== 'string' || req.body.reason.trim().length < 5) throw new HTTPError(400, 'Informe o motivo da reversão.');
    return res.json(checked(await supabase.rpc('reverse_import_job', { p_actor: req.user.id, p_import: req.params.id, p_reason: req.body.reason })));
  } catch (error) { return fail(res, error); }
});

router.post('/:id/cancel', async (req, res) => {
  try {
    const job = await requireRecordAccess(supabase, 'imports', req.params.id, req.user.id, 'write');
    const data = checked(await supabase.from('imports').update({ status: 'cancelled', lease_token: null, lease_until: null, updated_at: new Date().toISOString() }).eq('id', job.id).in('status', ['uploading','queued','processing','needs_review','failed']).select().maybeSingle());
    if (!data) throw new HTTPError(409, 'Lote concluído precisa ser revertido, não cancelado.');
    return res.json(publicJob(data));
  } catch (error) { return fail(res, error); }
});

router.post('/:id/retry', async (req, res) => {
  try {
    const job = await requireRecordAccess(supabase, 'imports', req.params.id, req.user.id, 'write');
    const data = checked(await supabase.rpc('retry_import_job', { p_actor: req.user.id, p_import: job.id, p_options: parseOptions(req.body.parser_options || job.parser_options) }));
    return res.json(publicJob(data));
  } catch (error) { return fail(res, error); }
});

export default router;
