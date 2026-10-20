import { Router } from 'express';
import { z } from 'zod';
import { supabase } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { stripe, billingOrigin, normalizeSubscription } from '../services/stripeService.js';
import { checked, handleError, HTTPError, uuidPattern } from '../services/access.js';
import { toCents } from '../domain/money.js';
const checkoutSchema = z.object({planId:z.string().min(1).max(100),billingCycle:z.literal('month').default('month'),idempotencyKey:z.string().uuid()}).strict();
export function createPaymentsRouter(db=supabase,provider=stripe,auth=authMiddleware) {
 const router=Router();
 const enabled=()=>{if(process.env.BILLING_ENABLED!=='true'||!provider||!db)throw new HTTPError(503,'Cobrança desativada durante a validação privada.');};
 router.get('/subscription',auth,async(req,res)=>{try{
  const rows=checked(await db.from('subscriptions').select('id,plan_id,status,current_period_end,cancel_at_period_end,created_at').eq('user_id',req.user.id).order('created_at',{ascending:false}).limit(1));
  res.json(rows[0]||null);
 }catch(e){handleError(res,e);}});
 router.post('/create-subscription',auth,async(req,res)=>{try{
  enabled(); const input=checkoutSchema.parse(req.body);
  const intent=checked(await db.rpc('begin_checkout',{p_user_id:req.user.id,p_plan_id:input.planId,p_request_key:input.idempotencyKey}));
  if(intent.status==='open' && intent.provider_session_id){
   const currentSession=await provider.checkout.sessions.retrieve(intent.provider_session_id);
   if(currentSession.status==='open'&&currentSession.url)return res.json({checkoutUrl:currentSession.url,status:'open'});
   if(currentSession.status==='expired')checked(await db.from('checkout_intents').update({status:'expired',updated_at:new Date().toISOString()}).eq('id',intent.id).eq('status','open'));
   return res.status(409).json({error:currentSession.status==='expired'?'Checkout expirado. Inicie uma nova solicitação.':'Checkout concluído; aguarde a confirmação da assinatura.',code:currentSession.status==='expired'?'checkout_expired':'checkout_completed'});
  }
  if(['completed','expired'].includes(intent.status))return res.status(409).json({error:'Solicitação encerrada. Atualize o estado da assinatura.',code:'checkout_'+intent.status});
  if(Date.now()-Date.parse(intent.created_at)>23*3600000)throw new HTTPError(409,'Cobrança pendente de conciliação. Não crie outra assinatura.');
  const price=await provider.prices.retrieve(intent.price_id);
  if(!price.active||price.currency!=='brl'||price.recurring?.interval!=='month'||price.recurring?.interval_count!==1||price.unit_amount!==toCents(intent.amount))throw new HTTPError(409,'Preço do provedor diverge do catálogo. Cobrança bloqueada.');
  let session;
  try {
   session=await provider.checkout.sessions.create({mode:'subscription',customer_email:req.user.email,client_reference_id:intent.id,
    metadata:{lume_intent_id:intent.id},subscription_data:{metadata:{lume_intent_id:intent.id}},line_items:[{price:intent.price_id,quantity:1}],
    success_url:billingOrigin()+'/configuracoes?payment=success',cancel_url:billingOrigin()+'/checkout?payment=cancelled',
    expires_at:Math.floor(Date.parse(intent.created_at)/1000)+24*3600}, {idempotencyKey:'lume-checkout-'+intent.id});
  }catch(e){checked(await db.from('checkout_intents').update({status:'unknown',updated_at:new Date().toISOString()}).eq('id',intent.id).in('status',['pending','unknown']));throw e;}
  checked(await db.from('checkout_intents').update({status:'open',provider_session_id:session.id,checkout_url:session.url,updated_at:new Date().toISOString()}).eq('id',intent.id).in('status',['pending','unknown']));
  if(!session.url)throw new HTTPError(409,'Sessão encerrada; consulte sua assinatura.');
  res.json({checkoutUrl:session.url,status:'open'});
 }catch(e){handleError(res,e);}});
 async function current(userId){
  const rows=checked(await db.from('subscriptions').select('*').eq('user_id',userId).not('status','in','(canceled,incomplete_expired)').order('created_at',{ascending:false}).limit(2));
  if(rows.length!==1)throw new HTTPError(409,'Assinatura indisponível ou exige conciliação.');return rows[0];
 }
 router.post('/cancel',auth,async(req,res)=>{try{
  if(!provider)throw new HTTPError(503,'Cobrança indisponível.');
  const sub=await current(req.user.id);
  const updated=await provider.subscriptions.update(sub.stripe_subscription_id,{cancel_at_period_end:true},{idempotencyKey:'lume-cancel-'+sub.stripe_subscription_id});
  checked(await db.from('subscriptions').update({cancel_at_period_end:Boolean(updated.cancel_at_period_end)}).eq('id',sub.id));
  res.json({success:true,cancel_at_period_end:true,message:'Cancelamento agendado para o fim do período pago.'});
 }catch(e){handleError(res,e);}});
 router.post('/portal',auth,async(req,res)=>{try{
  if(!provider)throw new HTTPError(503,'Cobrança indisponível.');const sub=await current(req.user.id);
  if(!sub.stripe_customer_id)throw new HTTPError(409,'Cliente de cobrança não conciliado.');
  const session=await provider.billingPortal.sessions.create({customer:sub.stripe_customer_id,return_url:billingOrigin()+'/configuracoes'});res.json({url:session.url});
 }catch(e){handleError(res,e);}});
 router.post('/webhook',async(req,res)=>{
  if(!provider||!process.env.STRIPE_WEBHOOK_SECRET||!db)return res.status(503).json({error:'Webhook não configurado.'});
  let event;try{event=provider.webhooks.constructEvent(req.body,req.headers['stripe-signature'],process.env.STRIPE_WEBHOOK_SECRET);}catch{return res.status(400).json({error:'Assinatura inválida.'});}
  try{
   const object=event.data.object;
   if(event.type==='checkout.session.expired'){
    const id=object.metadata?.lume_intent_id;
    if(uuidPattern.test(id||''))checked(await db.from('checkout_intents').update({status:'expired',provider_session_id:object.id,updated_at:new Date().toISOString()}).eq('id',id).in('status',['open','pending','unknown']));
   }else{
    const subId=event.type.startsWith('customer.subscription.')?object.id
     :event.type==='checkout.session.completed'?object.subscription
     :['invoice.payment_failed','invoice.payment_succeeded'].includes(event.type)?(object.parent?.subscription_details?.subscription||object.subscription):null;
    if(subId){
     const sub=await provider.subscriptions.retrieve(typeof subId==='string'?subId:subId.id);
     const intentId=sub.metadata?.lume_intent_id;
     const existing=checked(await db.from('subscriptions').select('id').eq('stripe_subscription_id',sub.id).maybeSingle());
     if(existing||uuidPattern.test(intentId||''))checked(await db.rpc('apply_subscription_event',{p_event_id:event.id,p_type:event.type,p_created:event.created,p_intent_id:uuidPattern.test(intentId||'')?intentId:null,p_subscription:normalizeSubscription(sub)}));
    }
   }
   res.json({received:true});
  }catch(e){handleError(res,e);}
 });
 return router;
}
export default createPaymentsRouter();
