import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import { supabase } from '../config/supabase.js';
import { stripe } from '../services/stripeService.js';
import { checked,handleError,fetchAll,assertUUID,HTTPError } from '../services/access.js';
import { nonnegativeMoney } from '../domain/schemas.js';
import { sumMoney,toCents } from '../domain/money.js';
const router=Router();router.use(authMiddleware,adminMiddleware);
const run=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){handleError(res,e);}};
router.get('/kpis',run(async(req,res)=>{
 const users=await fetchAll(()=>supabase.from('profiles').select('id,plan,plan_status,created_at,granted_by').order('id'));
 const subscriptions=await fetchAll(()=>supabase.from('subscriptions').select('id,user_id,plan_id,status').eq('status','active').order('id'));
 const plans=checked(await supabase.from('plans').select('id,price,interval'));
 const prices=new Map(plans.map(p=>[p.id,p.interval==='month'?Number(p.price):null]));
 const paying=new Set(subscriptions.map(s=>s.user_id));
 const mrr=sumMoney(subscriptions.map(s=>prices.get(s.plan_id)||0));
 res.json({mrr,arr:mrr*12,mrrBasis:'active_subscriptions_current_catalog',mrrComplete:subscriptions.every(s=>prices.has(s.plan_id)),
  payingUsers:paying.size,trialUsers:users.filter(u=>u.plan_status==='trial').length,
  freeUsers:users.filter(u=>!paying.has(u.id)).length,newUsersWeek:users.filter(u=>Date.parse(u.created_at)>Date.now()-7*86400000).length,
  totalUsers:users.length,conversionRate:users.length?100*paying.size/users.length:0});
}));
router.get('/users',run(async(req,res)=>{
 const search=String(req.query.search||'').toLowerCase().slice(0,100);
 const users=await fetchAll(()=>supabase.from('profiles').select('id,email,full_name,plan,plan_status,role,created_at,granted_by').order('id'));
 res.json(users.filter(u=>!search||u.email?.toLowerCase().includes(search)||u.full_name?.toLowerCase().includes(search)));
}));
router.post('/grant-access',run(async(req,res)=>{
 const body=z.object({user_id:z.string().uuid(),plan:z.string().min(1).max(100)}).strict().parse(req.body);
 const plan=checked(await supabase.from('plans').select('id').eq('id',body.plan).eq('is_active',true).maybeSingle());
 if(!plan)throw new HTTPError(400,'Plano indisponível.');
 res.json(checked(await supabase.rpc('grant_pilot_access',{p_actor:req.user.id,p_user_id:body.user_id,p_plan:body.plan})));
}));
router.get('/settings',run(async(req,res)=>res.json({payment_gateway:'stripe',billing_enabled:process.env.BILLING_ENABLED==='true',
 stripe_configured:Boolean(process.env.STRIPE_SECRET_KEY&&process.env.STRIPE_WEBHOOK_SECRET),
 ai_enabled:process.env.AI_ENABLED==='true',ai_model:process.env.AI_MODEL||null,whatsapp_enabled:false,email_enabled:false,source:'environment'})));
router.put('/settings',(_req,res)=>res.status(405).json({error:'Configure integrações nas variáveis da hospedagem. Segredos não são armazenados ou exibidos neste painel.'}));
router.get('/traffic',run(async(req,res)=>{
 const since=new Date(Date.now()-30*86400000).toISOString();
 const views=await fetchAll(()=>supabase.from('page_views').select('id,page,device_type,visitor_id,created_at').gte('created_at',since).order('id'));
 const week=views.filter(v=>Date.parse(v.created_at)>=Date.now()-7*86400000),pages={},devices={desktop:0,mobile:0,tablet:0};
 for(const v of views){pages[v.page]=(pages[v.page]||0)+1;if(Object.hasOwn(devices,v.device_type))devices[v.device_type]++;}
 res.json({last7Days:{views:week.length,unique:new Set(week.map(v=>v.visitor_id).filter(Boolean)).size},last30Days:{views:views.length,unique:new Set(views.map(v=>v.visitor_id).filter(Boolean)).size},topPages:Object.entries(pages).sort((a,b)=>b[1]-a[1]).map(([page,count])=>({page,count})),devices});
}));
const planSchema=z.object({id:z.string().regex(/^[a-z][a-z0-9_-]{1,79}$/),name:z.string().trim().min(1).max(100),price:nonnegativeMoney,
 max_accounts:z.number().int().min(-1).max(10000).optional(),max_transactions:z.number().int().min(-1).max(1000000).optional(),
 max_members:z.number().int().min(1).max(10).optional(),features:z.array(z.string().max(200)).max(30).optional(),is_active:z.boolean().optional(),
 stripe_price_id:z.string().regex(/^price_[a-zA-Z0-9]+$/).nullable().optional()}).strict();
async function verifyPrice(plan){
 if(!plan.stripe_price_id)return;
 if(!stripe)throw new HTTPError(503,'Configure Stripe antes de vincular preços.');
 const price=await stripe.prices.retrieve(plan.stripe_price_id);
 if(!price.active||price.currency!=='brl'||price.unit_amount!==toCents(plan.price)||price.recurring?.interval!=='month'||price.recurring?.interval_count!==1)throw new HTTPError(409,'Preço Stripe deve ser mensal em BRL e igual ao catálogo.');
}
router.get('/plans',run(async(req,res)=>res.json(checked(await supabase.from('plans').select('*').order('price')))));
router.post('/plans',run(async(req,res)=>{
 const plan=planSchema.parse(req.body);await verifyPrice(plan);
 res.status(201).json(checked(await supabase.from('plans').insert({...plan,interval:'month'}).select().single()));
}));
router.put('/plans/:id',run(async(req,res)=>{
 const patch=planSchema.omit({id:true}).partial().parse(req.body);
 if(!Object.keys(patch).length)throw new HTTPError(400,'Informe os campos.');
 const current=checked(await supabase.from('plans').select('*').eq('id',req.params.id).single());
 await verifyPrice({...current,...patch});
 res.json(checked(await supabase.from('plans').update({...patch,updated_at:new Date().toISOString()}).eq('id',current.id).select().single()));
}));
router.delete('/plans/:id',run(async(req,res)=>{
 checked(await supabase.from('plans').update({is_active:false}).eq('id',req.params.id));res.json({success:true,archived:true});
}));
router.get('/users/:id',run(async(req,res)=>{
 const id=assertUUID(req.params.id),profile=checked(await supabase.from('profiles').select('id,email,full_name,role,plan,plan_status,created_at').eq('id',id).single());
 const tx=await supabase.from('transactions').select('id',{count:'exact',head:true}).eq('user_id',id);checked(tx);
 const accounts=await supabase.from('accounts').select('id',{count:'exact',head:true}).eq('user_id',id);checked(accounts);
 const bills=await supabase.from('recurring_bills').select('id',{count:'exact',head:true}).eq('user_id',id);checked(bills);
 res.json({...profile,stats:{transactionCount:tx.count,accountCount:accounts.count,recurringCount:bills.count}});
}));
export default router;
