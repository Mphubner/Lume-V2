import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createTransactionsRouter } from '../src/routes/transactions.js';
import { createPaymentsRouter } from '../src/routes/payments.js';
import { createApp,validateConfiguration } from '../src/server.js';
import { normalizeSubscription } from '../src/services/stripeService.js';

const user='10000000-0000-4000-8000-000000000001', workspace='10000000-0000-4000-8000-000000000002',account='10000000-0000-4000-8000-000000000003';
const authenticate=(req,_res,next)=>{req.user={id:user,email:'fixture@example.invalid'};next();};
async function request(router,path,body,method='POST'){
 const app=express();app.use(express.json());app.use(router);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{const res=await fetch('http://127.0.0.1:'+server.address().port+path,{method,headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:res.status,body:await res.json()};}
 finally{await new Promise(r=>server.close(r));}
}
function dbFixture({role='owner',accountWorkspace=workspace,error=null}={}){
 const writes=[];return {writes,
 from(table){const query={select(){return this;},eq(){return this;},in(){return this;},order(){return this;},limit(){return this;},
  update(payload){writes.push({table,payload});return this;},maybeSingle(){return Promise.resolve({data:table==='accounts'?{id:account,workspace_id:accountWorkspace,account_type:'personal'}:null,error});},
  then(resolve,reject){return Promise.resolve({data:table==='workspace_members'?[{role,workspaces:{id:workspace,name:'Family',kind:'family',owner_id:user}}]:[],error}).then(resolve,reject);}};return query;},
 async rpc(name,args){writes.push({name,args});return {data:{id:'result',...args.p_payload},error};}};
}
const transaction={description:'Pix cliente',amount:500,type:'income',date:'2026-01-02',account_id:account,workspace};
test('transaction API rejects protected fields before invoking persistence',async()=>{
 for(const extra of [{user_id:user},{is_reconciled:true},{workspace_id:account},{ledger_status:'posted'},{linked_transaction_id:account}]){
  const db=dbFixture();const res=await request(createTransactionsRouter(db,authenticate),'/',{...transaction,...extra});
  assert.equal(res.status,400);assert.equal(db.writes.length,0);
 }
});
test('viewer and foreign account cannot publish a transaction',async()=>{
 for(const options of [{role:'viewer'},{accountWorkspace:account}]){
  const db=dbFixture(options);const res=await request(createTransactionsRouter(db,authenticate),'/',transaction);
  assert.equal(res.status,403);assert.equal(db.writes.length,0);
 }
});
test('external Pix keeps signed amount and uses atomic audited mutation',async()=>{
 const db=dbFixture();const res=await request(createTransactionsRouter(db,authenticate),'/',transaction);
 assert.equal(res.status,201);assert.equal(db.writes[0].name,'mutate_financial_record');
 assert.equal(db.writes[0].args.p_actor,user);assert.equal(db.writes[0].args.p_payload.amount,500);
 assert.equal(db.writes[0].args.p_payload.type,'income');assert.ok(!Object.hasOwn(db.writes[0].args.p_payload,'user_id'));
});
test('direction mismatch and unpaired transfer fail instead of changing signs',async()=>{
 for(const patch of [{amount:-500},{type:'transfer',economic_kind:'transfer'}]){
  const db=dbFixture();const res=await request(createTransactionsRouter(db,authenticate),'/',{...transaction,...patch});
  assert.equal(res.status,400);assert.equal(db.writes.length,0);
 }
});
test('database failure is an error, not an empty or demo response',async()=>{
 const res=await request(createTransactionsRouter(dbFixture({error:{code:'08006'}}),authenticate),'/',transaction);assert.equal(res.status,500);assert.ok(!res.body.transactions);
});
test('production refuses missing configuration and insecure frontend origin',()=>{
 assert.throws(()=>validateConfiguration({NODE_ENV:'production'}),/obrigatória/);
 assert.throws(()=>validateConfiguration({NODE_ENV:'production',SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture',FRONTEND_URL:'http://fixture.invalid'}),/HTTPS/);
});
test('readiness distinguishes a living process from an unavailable database',async()=>{
 const app=createApp({db:null});const live=await request(app,'/health',undefined,'GET');const ready=await request(app,'/ready',undefined,'GET');
 assert.equal(live.status,200);assert.equal(ready.status,503);assert.equal(ready.body.status,'not_ready');
});
test('readiness rejects an older schema and a failed worker without requiring external AI',async()=>{
 const dbFor=version=>({rpc:async()=>({data:{schema_version:version},error:null})});
 const old=await request(createApp({db:dbFor('202610190006')}),'/ready',undefined,'GET');assert.equal(old.status,503);
 const failed=await request(createApp({db:dbFor('202610210009'),workerState:()=>({enabled:true,healthy:false})}),'/ready',undefined,'GET');assert.equal(failed.status,503);
 const ready=await request(createApp({db:dbFor('202610210009'),workerState:()=>({enabled:true,healthy:true})}),'/ready',undefined,'GET');
 assert.equal(ready.status,200);assert.equal(ready.body.schema_version,'202610210009');assert.equal(ready.body.planner.available,true);assert.equal(ready.body.ai.dependencyVerification,'not_checked');
});
test('subscription normalizer uses the item billing period and rejects multiple items',()=>{
 const sub={id:'sub_1',customer:'cus_1',status:'active',items:{data:[{price:{id:'price_1'},current_period_start:100,current_period_end:200}]}};
 assert.equal(normalizeSubscription(sub).current_period_end,new Date(200000).toISOString());
 assert.throws(()=>normalizeSubscription({...sub,items:{data:[{},{}]}}));
});
test('billing requires explicit enablement and rejects client-controlled payment details',async()=>{
 const old=process.env.BILLING_ENABLED;process.env.BILLING_ENABLED='false';
 try{const db=dbFixture();const res=await request(createPaymentsRouter(db,{},authenticate),'/create-subscription',{});assert.equal(res.status,503);assert.equal(db.writes.length,0);
 process.env.BILLING_ENABLED='true';const bad=await request(createPaymentsRouter(db,{},authenticate),'/create-subscription',{planId:'family',idempotencyKey:account,paymentMethodId:'pm_untrusted'});assert.equal(bad.status,400);assert.equal(db.writes.length,0);
 }finally{if(old===undefined)delete process.env.BILLING_ENABLED;else process.env.BILLING_ENABLED=old;}
});
test('unsigned payment webhook never writes or acknowledges a subscription',async()=>{
 const old=process.env.STRIPE_WEBHOOK_SECRET;process.env.STRIPE_WEBHOOK_SECRET='fixture_only';const db=dbFixture();
 try{const provider={webhooks:{constructEvent(){throw new Error('invalid');}}};const res=await request(createPaymentsRouter(db,provider,authenticate),'/webhook',{});assert.equal(res.status,400);assert.equal(db.writes.length,0);}
 finally{if(old===undefined)delete process.env.STRIPE_WEBHOOK_SECRET;else process.env.STRIPE_WEBHOOK_SECRET=old;}
});
