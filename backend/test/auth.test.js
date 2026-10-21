import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthMiddleware } from '../src/middleware/auth.js';

function fixture(user,profileError=null) {
 let profileReads=0;
 const client={auth:{getUser:async()=>({data:{user},error:null})},from(){profileReads++;return{select(){return this;},eq(){return this;},single:async()=>({data:profileError?null:{role:'user',plan:'free',plan_status:'inactive'},error:profileError})};}};
 return {client,reads:()=>profileReads};
}
async function invoke(client) {
 const req={headers:{authorization:'Bearer synthetic_only'}},res={code:200,status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
 let accepted=false;await createAuthMiddleware(client)(req,res,()=>{accepted=true;});return{req,res,accepted};
}
test('unconfirmed or anonymous identity cannot access API facts even with a valid session',async()=>{
 for(const user of [{id:'fixture',email:'fixture@example.invalid'}, {id:'fixture',email_confirmed_at:'2026-10-20'}]) {
  const db=fixture(user),result=await invoke(db.client);
  assert.equal(result.res.code,403);assert.equal(result.res.body.code,'email_not_confirmed');assert.equal(result.accepted,false);assert.equal(db.reads(),0);
 }
});
test('confirmed identity still requires verified profile permissions',async()=>{
 const user={id:'fixture',email:'fixture@example.invalid',email_confirmed_at:'2026-10-20'};
 const valid=await invoke(fixture(user).client);assert.equal(valid.accepted,true);assert.equal(valid.req.user.emailConfirmed,true);assert.equal(valid.req.user.role,'user');
 const failed=await invoke(fixture(user,{code:'08006'}).client);assert.equal(failed.accepted,false);assert.equal(failed.res.code,503);
 const missing=await invoke(fixture(null).client);assert.equal(missing.res.code,401);assert.equal(missing.accepted,false);
});
