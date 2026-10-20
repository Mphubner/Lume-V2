import { mutate } from './mutations.js';
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';
import { scopedBody } from '../domain/schemas.js';
import { resolveScope,scopeQuery,checked,requireRecordAccess,assertCategoryAccess,fetchAll,handleError,HTTPError } from './access.js';

export function createScopedCrud({table,schema,present=rows=>rows,defaults=fields=>fields}, db=supabase, auth=authMiddleware) {
  const router=Router(); router.use(auth);
  router.get('/',async(req,res)=>{try {
    const scope=await resolveScope(db,req.user.id,req.query.workspace);
    const rows=await fetchAll(()=>scopeQuery(db.from(table).select('*'),scope).order('id'));
    res.json(present(rows));
  }catch(error){handleError(res,error);}});
  router.post('/',async(req,res)=>{try {
    const {workspace,fields}=scopedBody(req.body);
    const payload=defaults(schema.parse(fields));
    const scope=await resolveScope(db,req.user.id,workspace || req.query.workspace,'write');
    if(payload.category_id) await assertCategoryAccess(db,payload.category_id,req.user.id,scope.id);
    const result=await mutate(db,req.user.id,table,'insert',scope.id,payload);
    res.status(201).json(result);
  }catch(error){handleError(res,error);}});
  router.put('/:id',async(req,res)=>{try {
    const {workspace,fields}=scopedBody(req.body);
    if(!Object.keys(fields).length) throw new HTTPError(400,'Informe os campos a alterar.');
    const payload=schema.partial().parse(fields);
    const row=await requireRecordAccess(db,table,req.params.id,req.user.id,'write');
    if(workspace && workspace!==row.workspace_id) throw new HTTPError(403,'Não é permitido mover registros entre espaços pela edição.');
    if(payload.category_id) await assertCategoryAccess(db,payload.category_id,req.user.id,row.workspace_id);
    res.json(await mutate(db,req.user.id,table,'update',row.workspace_id,payload,row.id));
  }catch(error){handleError(res,error);}});
  router.delete('/:id',async(req,res)=>{try {
    const row=await requireRecordAccess(db,table,req.params.id,req.user.id,'write');
    await mutate(db,req.user.id,table,'delete',row.workspace_id,{},row.id);
    res.json({success:true});
  }catch(error){handleError(res,error);}});
  return router;
}
