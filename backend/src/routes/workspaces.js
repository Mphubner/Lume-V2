import { Router } from 'express';
import { randomBytes,createHash } from 'node:crypto';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';
import { resolveScope,listWorkspaces,checked,assertUUID,handleError,HTTPError } from '../services/access.js';
const router=Router();router.use(authMiddleware);
router.get('/',async(req,res)=>{try{res.json(await listWorkspaces(supabase,req.user.id));}catch(e){handleError(res,e);}});
router.post('/',async(req,res)=>{try{
 const {name,kind}=z.object({name:z.string().trim().min(2).max(100),kind:z.enum(['family','business'])}).strict().parse(req.body);
 res.status(201).json(checked(await supabase.rpc('create_workspace',{p_actor:req.user.id,p_name:name,p_kind:kind})));
}catch(e){handleError(res,e);}});
async function owner(req){const scope=await resolveScope(supabase,req.user.id,assertUUID(req.params.id),'write');if(scope.role!=='owner')throw new HTTPError(403,'Somente o titular pode gerenciar membros.');return scope;}
router.get('/:id/members',async(req,res)=>{try{
 const scope=await resolveScope(supabase,req.user.id,assertUUID(req.params.id));
 const members=checked(await supabase.from('workspace_members').select('user_id,role,created_at,profiles(id,full_name,email)').eq('workspace_id',scope.id));
 res.json(members);
}catch(e){handleError(res,e);}});
router.get('/:id/invitations',async(req,res)=>{try{await owner(req);res.json(checked(await supabase.from('workspace_invitations').select('id,email,role,expires_at,accepted_at,revoked_at').eq('workspace_id',req.params.id)));}catch(e){handleError(res,e);}});
router.post('/:id/invitations',async(req,res)=>{try{
 await owner(req);const p=z.object({email:z.string().email().max(254),role:z.enum(['editor','viewer']).default('editor'),workspace:z.string().optional()}).strict().parse(req.body);
 const token=randomBytes(32).toString('base64url'),hash=createHash('sha256').update(token).digest('hex');
 const invitation=checked(await supabase.rpc('create_workspace_invitation',{p_actor:req.user.id,p_workspace:req.params.id,p_email:p.email.toLowerCase(),p_role:p.role,p_token_hash:hash}));
 const base=(process.env.FRONTEND_URL||'http://localhost:5173').split(',')[0];
 res.status(201).json({...invitation,invite_url:`${base}/convite?token=${encodeURIComponent(token)}`,delivery:'share_link',message:'Convite criado. Compartilhe o link com o destinatário; nenhum acesso foi concedido ainda.'});
}catch(e){handleError(res,e);}});
router.post('/invitations/accept',async(req,res)=>{try{
 if(!req.user.emailConfirmed)throw new HTTPError(403,'Confirme seu e-mail antes de aceitar o convite.');
 const {token}=z.object({token:z.string().regex(/^[A-Za-z0-9_-]{43}$/),workspace:z.string().optional()}).strict().parse(req.body);
 res.json(checked(await supabase.rpc('accept_workspace_invitation',{p_actor:req.user.id,p_email:req.user.email.toLowerCase(),p_token_hash:createHash('sha256').update(token).digest('hex')})));
}catch(e){handleError(res,e);}});
router.delete('/:id/invitations/:invitationId',async(req,res)=>{try{await owner(req);checked(await supabase.from('workspace_invitations').update({revoked_at:new Date().toISOString()}).eq('id',assertUUID(req.params.invitationId)).eq('workspace_id',req.params.id));res.json({success:true});}catch(e){handleError(res,e);}});
router.patch('/:id/members/:userId',async(req,res)=>{try{await owner(req);const {role}=z.object({role:z.enum(['editor','viewer']),workspace:z.string().optional()}).strict().parse(req.body);res.json(checked(await supabase.rpc('change_workspace_member',{p_actor:req.user.id,p_workspace:req.params.id,p_member:assertUUID(req.params.userId),p_role:role})));}catch(e){handleError(res,e);}});
router.delete('/:id/members/:userId',async(req,res)=>{try{await owner(req);res.json(checked(await supabase.rpc('change_workspace_member',{p_actor:req.user.id,p_workspace:req.params.id,p_member:assertUUID(req.params.userId),p_role:null})));}catch(e){handleError(res,e);}});
export default router;
