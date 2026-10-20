import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';
import { accountSchema,scopedBody } from '../domain/schemas.js';
import { resolveScope,scopeQuery,fetchAll,checked,handleError } from '../services/access.js';
const router=Router();router.use(authMiddleware);
router.get('/',async(req,res)=>{try{res.json(checked(await supabase.from('profiles').select('*').eq('id',req.user.id).single()));}catch(e){handleError(res,e);}});
const profileSchema=z.object(Object.fromEntries(['full_name','phone','cpf','cep','street','street_number','complement','neighborhood','city','state','objective'].map(k=>[k,z.string().max(k==='objective'?500:255).nullable().optional()]))).strict();
router.put('/',async(req,res)=>{try{const {fields}=scopedBody(req.body);res.json(checked(await supabase.from('profiles').update(profileSchema.parse(fields)).eq('id',req.user.id).select().single()));}catch(e){handleError(res,e);}});
router.post('/onboarding',async(req,res)=>{try{
 const {workspace,fields}=scopedBody(req.body);const p=z.object({account:accountSchema,objective:z.string().trim().max(500).optional()}).strict().parse(fields);
 const scope=await resolveScope(supabase,req.user.id,workspace||req.query.workspace,'write');
 res.json(checked(await supabase.rpc('complete_onboarding',{p_actor:req.user.id,p_workspace:scope.id,p_account:p.account,p_objective:p.objective||null})));
}catch(e){handleError(res,e);}});
router.get('/export',async(req,res)=>{try{
 const scope=await resolveScope(supabase,req.user.id,req.query.workspace);
 const tables=['accounts','transactions','categories','recurring_bills','debts','goals','budgets','emergency_reserve'];
 const values=await Promise.all(tables.map(table=>fetchAll(()=>scopeQuery(supabase.from(table).select('*'),scope).order('id'))));
 res.setHeader('Content-Disposition','attachment; filename="lume-dados.json"');res.json({exported_at:new Date().toISOString(),workspace_ids:scope.ids,data:Object.fromEntries(tables.map((t,i)=>[t,values[i]]))});
}catch(e){handleError(res,e);}});
router.post('/privacy-request',async(req,res)=>{try{
 const {fields}=scopedBody(req.body);const {kind}=z.object({kind:z.enum(['deletion','access','correction'])}).strict().parse(fields);
 res.status(201).json(checked(await supabase.from('privacy_requests').insert({user_id:req.user.id,kind,status:'pending'}).select().single()));
}catch(e){handleError(res,e);}});
export default router;
