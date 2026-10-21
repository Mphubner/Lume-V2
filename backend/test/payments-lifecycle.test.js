import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createPaymentsRouter } from '../src/routes/payments.js';
const id='30000000-0000-4000-8000-000000000001';
const intent={id,user_id:id,plan_id:'individual',status:'pending',price_id:'price_fixture',amount:'39.90',created_at:new Date().toISOString()};
async function call(db,provider,path='/create-subscription',body={planId:'individual',billingCycle:'month',idempotencyKey:id}){
 const before=process.env.BILLING_ENABLED,secret=process.env.STRIPE_WEBHOOK_SECRET;
 process.env.BILLING_ENABLED='true';process.env.STRIPE_WEBHOOK_SECRET='fixture_only';
 const app=express();app.use(express.json());app.use(createPaymentsRouter(db,provider,(req,_res,next)=>{req.user={id,email:'fixture@example.invalid'};next();}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{const res=await fetch('http://127.0.0.1:'+server.address().port+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:res.status,body:await res.json()};}
 finally{await new Promise(r=>server.close(r));if(before===undefined)delete process.env.BILLING_ENABLED;else process.env.BILLING_ENABLED=before;if(secret===undefined)delete process.env.STRIPE_WEBHOOK_SECRET;else process.env.STRIPE_WEBHOOK_SECRET=secret;}
}
function fixtures({priceAmount=3990,providerFailure=false,persistenceFailure=false,existingIntent=intent,eventFailure=false}={}){
 const calls=[],writes=[];
 const db={writes,async rpc(name,args){calls.push({name,args});return name==='begin_checkout'?{data:existingIntent,error:null}:{data:true,error:eventFailure?{code:'08006'}:null};},
 from(table){return {select(){return this;},eq(){return this;},in(){return this;},update(payload){writes.push({table,payload});return this;},maybeSingle(){return Promise.resolve({data:null,error:null});},then(resolve,reject){return Promise.resolve({data:[],error:persistenceFailure?{code:'08006'}:null}).then(resolve,reject);}};}};
 const provider={prices:{async retrieve(price){calls.push({name:'price',price});return {active:true,currency:'brl',unit_amount:priceAmount,recurring:{interval:'month',interval_count:1}};}},checkout:{sessions:{async create(payload,options){calls.push({name:'checkout',payload,options});if(providerFailure)throw new Error('synthetic_timeout');return {id:'cs_fixture',url:'https://checkout.stripe.com/c/pay/fixture'};},async retrieve(){return {status:'expired'};}}},
 webhooks:{constructEvent(){return {id:'evt_fixture',created:100,type:'customer.subscription.updated',data:{object:{id:'sub_fixture'}}};}},
 subscriptions:{async retrieve(){return {id:'sub_fixture',customer:'cus_fixture',status:'active',metadata:{lume_intent_id:id},items:{data:[{price:{id:'price_fixture'},current_period_start:100,current_period_end:200}]}};}}};
 return {db,provider,calls,writes};
}
test('hosted checkout uses server price, durable intent and stable provider key',async()=>{
 const f=fixtures();const res=await call(f.db,f.provider);assert.equal(res.status,200);assert.match(res.body.checkoutUrl,/checkout.stripe.com/);
 const create=f.calls.find(c=>c.name==='checkout');assert.equal(create.payload.mode,'subscription');assert.equal(create.payload.line_items[0].price,'price_fixture');assert.equal(create.options.idempotencyKey,'lume-checkout-'+id);assert.ok(!create.payload.payment_method);
 assert.equal(f.writes[0].payload.status,'open');
});
test('catalog mismatch prevents provider mutation',async()=>{
 const f=fixtures({priceAmount:1990});const res=await call(f.db,f.provider);assert.equal(res.status,409);assert.ok(!f.calls.some(c=>c.name==='checkout'));
});
test('unknown provider result remains unknown and never claims cancellation or success',async()=>{
 const f=fixtures({providerFailure:true});const res=await call(f.db,f.provider);assert.equal(res.status,500);assert.equal(f.writes[0].payload.status,'unknown');assert.ok(!res.body.checkoutUrl);
});
test('provider success followed by persistence failure is not acknowledged as a saved checkout',async()=>{
 const f=fixtures({persistenceFailure:true});const res=await call(f.db,f.provider);assert.equal(res.status,500);assert.ok(!res.body.checkoutUrl);
});
test('expired checkout returns an explicit recoverable code without creating a second session',async()=>{
 const f=fixtures({existingIntent:{...intent,status:'open',provider_session_id:'cs_fixture',checkout_url:'https://checkout.stripe.com/expired'}});
 const res=await call(f.db,f.provider);assert.equal(res.status,409);assert.equal(res.body.code,'checkout_expired');assert.ok(!f.calls.some(c=>c.name==='checkout'));
});
test('signed subscription event with database failure is returned for provider retry',async()=>{
 const f=fixtures({eventFailure:true});const res=await call(f.db,f.provider,'/webhook',{});assert.equal(res.status,500);assert.ok(!res.body.received);assert.ok(f.calls.some(c=>c.name==='apply_subscription_event'));
});
