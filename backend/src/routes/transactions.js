import { mutate } from '../services/mutations.js';
import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';
import { transactionSchema,scopedBody,positiveMoney,date } from '../domain/schemas.js';
import { resolveScope,scopeQuery,requireRecordAccess,assertCategoryAccess,checked,handleError,HTTPError } from '../services/access.js';
import { getFinancialSnapshot } from '../services/financialFacts.js';
import { enrichFinancialRows } from '../services/relations.js';
export function createTransactionsRouter(db=supabase,auth=authMiddleware){
 const router=Router();router.use(auth);
 router.get('/',async(req,res)=>{try{
  const scope=await resolveScope(db,req.user.id,req.query.workspace);
  const page=z.coerce.number().int().min(1).parse(req.query.page||1),limit=z.coerce.number().int().min(1).max(500).parse(req.query.limit||100);
  const sort=z.enum(['date','amount','description','created_at']).parse(req.query.sort||'date');
  let q=scopeQuery(db.from('transactions').select('*',{count:'exact'}),scope).eq('ledger_status','posted').order(sort,{ascending:req.query.order==='asc'}).order('id');
  if(req.query.status==='pending')q=q.eq('is_reconciled',false);else q=q.eq('is_reconciled',true);
  if(req.query.month&&req.query.year){const m=z.coerce.number().int().min(1).max(12).parse(req.query.month),y=z.coerce.number().int().min(1900).max(2200).parse(req.query.year);q=q.gte('date',`${y}-${String(m).padStart(2,'0')}-01`).lte('date',new Date(Date.UTC(y,m,0)).toISOString().slice(0,10));}
  for(const field of ['category_id','account_id','member_id','import_id'])if(req.query[field])q=q.eq(field,z.string().uuid().parse(req.query[field]));
  if(req.query.type)q=q.eq('type',z.enum(['income','expense','transfer']).parse(req.query.type));
  if(req.query.uncategorized==='true')q=q.is('category_id',null);
  if(req.query.search)q=q.ilike('description',`%${String(req.query.search).slice(0,200).replace(/[%_]/g,'')}%`);
  const {data,error,count}=await q.range((page-1)*limit,page*limit-1);if(error)throw error;
  const rows=await enrichFinancialRows(db,data,scope,{accounts:true});
  res.json(req.query.import_id?rows:{transactions:rows,total:count,page,totalPages:Math.ceil(count/limit)});
 }catch(e){handleError(res,e);}});
 router.get('/summary',async(req,res)=>{try{
  const data=await getFinancialSnapshot(db,req.user.id,req.query);res.json({...data.stats,balance:data.stats.periodBalance,byCategory:data.byCategory,coverage:data.coverage,totalTransactions:data.coverage?.transactionCount});
 }catch(e){handleError(res,e);}});
 const transfer=z.object({source_account_id:z.string().uuid(),destination_account_id:z.string().uuid(),amount:positiveMoney,date,description:z.string().trim().min(1).max(255),fee_amount:positiveMoney.optional()}).strict();
 router.post('/transfers',async(req,res)=>{try{
  const {fields}=scopedBody(req.body);const p=transfer.parse(fields);
  const source=await requireRecordAccess(db,'accounts',p.source_account_id,req.user.id,'write');const dest=await requireRecordAccess(db,'accounts',p.destination_account_id,req.user.id,'write');
  if(source.workspace_id!==dest.workspace_id)throw new HTTPError(400,'Movimento entre entidades exige classificação explícita de aporte, retirada ou empréstimo em cada espaço.');
  res.status(201).json(checked(await db.rpc('create_transfer',{p_actor:req.user.id,p_source:source.id,p_destination:dest.id,p_amount:p.amount,p_date:p.date,p_description:p.description,p_fee:p.fee_amount||0})));
 }catch(e){handleError(res,e);}});
 router.patch('/transfers/link',async(req,res)=>{try{
  const {fields}=scopedBody(req.body);const p=z.object({source_transaction_id:z.string().uuid(),destination_transaction_id:z.string().uuid()}).strict().parse(fields);
  res.json(checked(await db.rpc('link_transfer',{p_actor:req.user.id,p_source:p.source_transaction_id,p_destination:p.destination_transaction_id})));
 }catch(e){handleError(res,e);}});
 async function validated(payload,current,userId){
  const effective={...current,...payload};const account=await requireRecordAccess(db,'accounts',effective.account_id,userId,'write');
  if(current.workspace_id && current.workspace_id!==account.workspace_id)throw new HTTPError(403,'A conta precisa pertencer ao mesmo espaço.');
  await assertCategoryAccess(db,effective.category_id,userId,account.workspace_id);
  if(effective.member_id&&(!current.id||('member_id' in payload&&payload.member_id!==current.member_id))){const m=checked(await db.from('workspace_members').select('user_id').eq('workspace_id',account.workspace_id).eq('user_id',effective.member_id).maybeSingle());if(!m)throw new HTTPError(403,'Membro não pertence ao espaço.');}
  if(effective.type==='transfer'||effective.economic_kind==='transfer'){
   if(!current.linked_transaction_id)throw new HTTPError(400,'Use o pareamento para confirmar uma transferência.');
   if(['amount','date','account_id','type','economic_kind'].some(k=>k in payload&&payload[k]!==current[k]))throw new HTTPError(409,'Uma transferência vinculada exige reversão do par antes de alterar valores.');
  }
  const kind=effective.economic_kind||'standard';
  if(kind==='standard'&&((effective.type==='income'&&effective.amount<=0)||(effective.type==='expense'&&effective.amount>=0)))throw new HTTPError(400,'Sinal incompatível com o movimento.');
  if(kind==='refund'){
   if(!effective.reversal_of)throw new HTTPError(400,'Selecione o lançamento original do estorno.');
   const original=await requireRecordAccess(db,'transactions',effective.reversal_of,userId,'write');
   if(original.workspace_id!==account.workspace_id||original.account_id!==account.id)throw new HTTPError(403,'Estorno fora da conta original.');
  }else if(effective.reversal_of)throw new HTTPError(400,'Referência de estorno exige natureza estorno.');
  return account;
 }
 router.post('/',async(req,res)=>{try{
  const {workspace,fields}=scopedBody(req.body);const payload=transactionSchema.parse(fields);const account=await validated(payload,{},req.user.id);
  if(workspace&&workspace!==account.workspace_id)throw new HTTPError(403,'Conta e espaço incompatíveis.');
  res.status(201).json(await mutate(db,req.user.id,'transactions','insert',account.workspace_id,payload));
 }catch(e){handleError(res,e);}});
 router.put('/:id',async(req,res)=>{try{
  const {workspace,fields}=scopedBody(req.body);const payload=transactionSchema.partial().parse(fields);
  if(!Object.keys(payload).length)throw new HTTPError(400,'Informe os campos a alterar.');
  const row=await requireRecordAccess(db,'transactions',req.params.id,req.user.id,'write');
  if(workspace&&workspace!==row.workspace_id)throw new HTTPError(403,'Espaço imutável.');
  if(row.ledger_status!=='posted')throw new HTTPError(409,'Lançamento anulado não pode ser editado.');
  await validated(payload,row,req.user.id);
  res.json(await mutate(db,req.user.id,'transactions','update',row.workspace_id,payload,row.id));
 }catch(e){handleError(res,e);}});
 router.post('/:id/review',async(req,res)=>{try{
  const {workspace,fields}=scopedBody(req.body);const payload=transactionSchema.parse(fields);
  const row=await requireRecordAccess(db,'transactions',req.params.id,req.user.id,'write');
  if(workspace&&workspace!==row.workspace_id)throw new HTTPError(403,'Espaço imutável.');
  await validated(payload,row,req.user.id);
  res.json(await mutate(db,req.user.id,'transactions','review',row.workspace_id,payload,row.id));
 }catch(e){handleError(res,e);}});
 router.delete('/:id',async(req,res)=>{try{
  const row=await requireRecordAccess(db,'transactions',req.params.id,req.user.id,'write');
  res.json(checked(await db.rpc('void_transaction',{p_actor:req.user.id,p_transaction:row.id})));
 }catch(e){handleError(res,e);}});
 return router;
}
export default createTransactionsRouter();
