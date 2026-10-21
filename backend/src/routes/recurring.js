import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';
import { createScopedCrud } from '../services/scopedCrud.js';
import { recurringSchema,scopedBody,date } from '../domain/schemas.js';
import { resolveScope,scopeQuery,checked,fetchAll,requireRecordAccess,handleError,HTTPError } from '../services/access.js';
import { occurrencesBetween } from '../domain/recurrence.js';
import { sumMoney,today } from '../domain/money.js';
import { enrichFinancialRows } from '../services/relations.js';
const router=Router();router.use(authMiddleware);
router.get('/',async(req,res)=>{try{
 const scope=await resolveScope(supabase,req.user.id,req.query.workspace),now=today();
 const year=z.coerce.number().int().min(1900).max(2200).parse(req.query.year||now.slice(0,4)),month=z.coerce.number().int().min(1).max(12).parse(req.query.month||now.slice(5,7));
 const start=`${year}-${String(month).padStart(2,'0')}-01`,end=new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
 const bills=await enrichFinancialRows(supabase,await fetchAll(()=>scopeQuery(supabase.from('recurring_bills').select('*'),scope).order('id')),scope);
 const paid=await fetchAll(()=>scopeQuery(supabase.from('recurring_occurrences').select('*,transactions(*)'),scope).gte('due_date',start).lte('due_date',end).order('id'));
 const items=bills.map(b=>({...b,occurrences:b.start_date?occurrencesBetween(b,start,end,paid.filter(p=>p.recurring_id===b.id),{asOf:now}):[],schedule_complete:Boolean(b.start_date)}));
 const occurrences=items.flatMap(b=>b.occurrences.map(o=>({...o,amount:b.amount,recurring_id:b.id})));
 res.json({bills:items,occurrences,stats:{totalMonthly:sumMoney(occurrences.map(o=>o.amount)),paidThisMonth:occurrences.filter(o=>o.paid_at).length,pending:occurrences.filter(o=>!o.paid_at).length,overdue:occurrences.filter(o=>!o.paid_at&&o.due_date<now).length},coverage:{incompleteSchedules:items.filter(b=>!b.schedule_complete).length}});
}catch(e){handleError(res,e);}});
router.post('/:id/confirm',async(req,res)=>{try{
 const {fields}=scopedBody(req.body);const p=z.object({due_date:date,transaction_id:z.string().uuid()}).strict().parse(fields);
 const bill=await requireRecordAccess(supabase,'recurring_bills',req.params.id,req.user.id,'write');
 if(!bill.start_date||!occurrencesBetween(bill,p.due_date,p.due_date).length)throw new HTTPError(400,'Data não corresponde a uma ocorrência prevista.');
 res.json(checked(await supabase.rpc('confirm_recurring_occurrence',{p_actor:req.user.id,p_recurring:bill.id,p_due:p.due_date,p_transaction:p.transaction_id||null})));
}catch(e){handleError(res,e);}});
router.use(createScopedCrud({table:'recurring_bills',schema:recurringSchema},supabase,(req,res,next)=>next()));
router.delete('/:id/occurrences/:dueDate',async(req,res)=>{try{
 const bill=await requireRecordAccess(supabase,'recurring_bills',req.params.id,req.user.id,'write');
 const due=date.parse(req.params.dueDate);
 res.json(checked(await supabase.rpc('unconfirm_recurring_occurrence',{p_actor:req.user.id,p_recurring:bill.id,p_due:due})));
}catch(e){handleError(res,e);}});
export default router;
