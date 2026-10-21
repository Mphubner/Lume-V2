import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';
import { scopedBody,nonnegativeMoney } from '../domain/schemas.js';
import { resolveScope,scopeQuery,checked,handleError,fetchAll } from '../services/access.js';
import { sumMoney } from '../domain/money.js';
const router=Router();router.use(authMiddleware);
const schema=z.object({target_amount:nonnegativeMoney.optional(),current_amount:nonnegativeMoney.optional(),monthly_income:nonnegativeMoney.optional(),months_target:z.coerce.number().int().min(1).max(60).optional()}).strict();
router.get('/',async(req,res)=>{try{
 const scope=await resolveScope(supabase,req.user.id,req.query.workspace);
 const rows=await fetchAll(()=>scopeQuery(supabase.from('emergency_reserve').select('*'),scope).order('id'));
 res.json({target_amount:sumMoney(rows.map(r=>r.target_amount)),current_amount:sumMoney(rows.map(r=>r.current_amount)),monthly_income:sumMoney(rows.map(r=>r.monthly_income)),months_target:rows[0]?.months_target??6,measurement:'manual',workspace_id:scope.id});
}catch(e){handleError(res,e);}});
router.post('/update',async(req,res)=>{try{
 const {workspace,fields}=scopedBody(req.body);const payload=schema.parse(fields);
 const scope=await resolveScope(supabase,req.user.id,workspace||req.query.workspace,'write');
 res.json(checked(await supabase.rpc('set_reserve',{p_actor:req.user.id,p_workspace:scope.id,p_values:payload})));
}catch(e){handleError(res,e);}});
export default router;
