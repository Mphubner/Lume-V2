import { mutate } from '../services/mutations.js';
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';
import { categorySchema,scopedBody } from '../domain/schemas.js';
import { resolveScope,checked,handleError,HTTPError,requireRecordAccess,assertCategoryAccess,fetchAll } from '../services/access.js';
const router=Router();router.use(authMiddleware);
router.get('/',async(req,res)=>{try{
 const scope=await resolveScope(supabase,req.user.id,req.query.workspace);
 const rows=await fetchAll(()=>supabase.from('categories').select('*').or(`and(is_system.eq.true,user_id.is.null,workspace_id.is.null),workspace_id.in.(${scope.ids.join(',')})`).order('id'));
 res.json(rows.sort((a,b)=>a.name.localeCompare(b.name)));
}catch(e){handleError(res,e);}});
router.post('/',async(req,res)=>{try{
 const {workspace,fields}=scopedBody(req.body);const payload=categorySchema.parse(fields);
 const scope=await resolveScope(supabase,req.user.id,workspace||req.query.workspace,'write');
 if(payload.parent_id)await assertCategoryAccess(supabase,payload.parent_id,req.user.id,scope.id);
 res.status(201).json(await mutate(supabase,req.user.id,'categories','insert',scope.id,payload));
}catch(e){handleError(res,e);}});
router.put('/:id',async(req,res)=>{try{
 const {workspace,fields}=scopedBody(req.body);const payload=categorySchema.partial().parse(fields);
 const row=await requireRecordAccess(supabase,'categories',req.params.id,req.user.id,'write');
 if(row.is_system || (workspace&&workspace!==row.workspace_id))throw new HTTPError(403,'Catálogo de sistema e espaço não são editáveis.');
 if(payload.parent_id===row.id)throw new HTTPError(400,'Categoria não pode ser o próprio grupo.');
 if(payload.parent_id)await assertCategoryAccess(supabase,payload.parent_id,req.user.id,row.workspace_id);
 res.json(await mutate(supabase,req.user.id,'categories','update',row.workspace_id,payload,row.id));
}catch(e){handleError(res,e);}});
router.delete('/:id',async(req,res)=>{try{
 const row=await requireRecordAccess(supabase,'categories',req.params.id,req.user.id,'write');
 if(row.is_system)throw new HTTPError(403,'Categoria de sistema não pode ser excluída.');
 const {count,error}=await supabase.from('transactions').select('id',{count:'exact',head:true}).eq('category_id',row.id);if(error)throw error;
 if(count)throw new HTTPError(409,'Categoria em uso. Reclassifique os lançamentos antes de excluir.');
 await mutate(supabase,req.user.id,'categories','delete',row.workspace_id,{},row.id);res.json({success:true});
}catch(e){handleError(res,e);}});
export default router;
