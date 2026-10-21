import { Router } from 'express';
import { supabase } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { checked,handleError,resolveScope,scopeQuery,fetchAll,assertUUID } from '../services/access.js';
import { occurrencesBetween } from '../domain/recurrence.js';
import { today } from '../domain/money.js';
import { addDays } from '../domain/financial.js';
const router=Router();router.use(authMiddleware);
router.get('/',async(req,res)=>{try{
 const scope=await resolveScope(supabase,req.user.id,req.query.workspace);
 const rows=checked(await scopeQuery(supabase.from('notifications').select('*').eq('user_id',req.user.id),scope).order('created_at',{ascending:false}).limit(50));
 res.json(rows);
}catch(e){handleError(res,e);}});
router.put('/:id/read',async(req,res)=>{try{
 const row=checked(await supabase.from('notifications').select('id,workspace_id').eq('id',assertUUID(req.params.id)).eq('user_id',req.user.id).single());
 await resolveScope(supabase,req.user.id,row.workspace_id);
 checked(await supabase.from('notifications').update({is_read:true}).eq('id',row.id).eq('user_id',req.user.id));
 res.json({success:true});
}catch(e){handleError(res,e);}});
router.post('/generate',async(req,res)=>{try{
 const scope=await resolveScope(supabase,req.user.id,req.body?.workspace||req.query.workspace);
 const bills=await fetchAll(()=>scopeQuery(supabase.from('recurring_bills').select('*'),scope).eq('status','active').order('id'));
 const settlements=await fetchAll(()=>scopeQuery(supabase.from('recurring_occurrences').select('*,transactions(*)'),scope).order('id'));
 const start=today(),end=addDays(start,3);
 const due=bills.flatMap(b=>occurrencesBetween(b,start,end,settlements,{asOf:start})).filter(o=>o.status!=='paid');
 if(due.length)checked(await supabase.rpc('create_due_notifications',{p_user_id:req.user.id,p_occurrences:due.map(o=>({workspace_id:o.workspace_id,source_key:'due:'+o.recurring_id+':'+o.due_date,title:'Vencimento: '+o.name,message:'Valor previsto R$ '+o.amount.toFixed(2)+' em '+o.due_date+'. Confirme o pagamento na recorrência.'}))}));
 res.json({success:true,channel:'in_app',evaluated:due.length,external_delivery:false});
}catch(e){handleError(res,e);}});
export default router;
