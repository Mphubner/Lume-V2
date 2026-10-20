import { mutate } from '../services/mutations.js';
import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';
import { accountSchema,scopedBody,money,date } from '../domain/schemas.js';
import { resolveScope,requireRecordAccess,checked,handleError,HTTPError } from '../services/access.js';
import { getFinancialSnapshot } from '../services/financialFacts.js';
const router=Router();router.use(authMiddleware);
router.get('/',async(req,res)=>{try{const snapshot=await getFinancialSnapshot(supabase,req.user.id,req.query);res.json(snapshot.accounts.map(a=>({...a,opening_balance:a.opening,balance:a.current,balance_known:a.known})));}catch(e){handleError(res,e);}});
router.post('/',async(req,res)=>{try{
 const {workspace,fields}=scopedBody(req.body);const payload=accountSchema.parse(fields);
 const scope=await resolveScope(supabase,req.user.id,workspace||req.query.workspace,'write');
 res.status(201).json(await mutate(supabase,req.user.id,'accounts','insert',scope.id,{...payload,account_type:scope.kind==='business'?'business':'personal'}));
}catch(e){handleError(res,e);}});
router.put('/:id',async(req,res)=>{try{
 const {workspace,fields}=scopedBody(req.body);const payload=accountSchema.partial().parse(fields);
 if(!Object.keys(payload).length)throw new HTTPError(400,'Informe os campos a alterar.');
 const row=await requireRecordAccess(supabase,'accounts',req.params.id,req.user.id,'write');
 if(workspace&&workspace!==row.workspace_id)throw new HTTPError(403,'Espaço imutável.');
 if(('balance' in payload)!==('balance_date' in payload))throw new HTTPError(400,'Saldo-base e data-base devem ser alterados juntos.');
 if('account_type' in payload&&payload.account_type!==row.account_type)throw new HTTPError(400,'Use um espaço separado para outra entidade econômica.');
 res.json(await mutate(supabase,req.user.id,'accounts','update',row.workspace_id,payload,row.id));
}catch(e){handleError(res,e);}});
router.delete('/:id',async(req,res)=>{try{
 const row=await requireRecordAccess(supabase,'accounts',req.params.id,req.user.id,'write');
 // Financial sources remain traceable; delete in the UI archives an account.
 await mutate(supabase,req.user.id,'accounts','update',row.workspace_id,{is_active:false},row.id);res.json({success:true,archived:true});
}catch(e){handleError(res,e);}});
router.post('/:id/reconcile',async(req,res)=>{try{
 const row=await requireRecordAccess(supabase,'accounts',req.params.id,req.user.id,'write');
 const {fields}=scopedBody(req.body);const p=z.object({as_of:date,expected_balance:money}).strict().parse(fields);
 res.json(checked(await supabase.rpc('reconcile_account',{p_actor:req.user.id,p_account:row.id,p_as_of:p.as_of,p_expected:p.expected_balance})));
}catch(e){handleError(res,e);}});
export default router;
