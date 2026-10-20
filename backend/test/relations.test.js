import test from 'node:test';
import assert from 'node:assert/strict';
import { enrichFinancialRows } from '../src/services/relations.js';
test('legacy cross-workspace references never expose labels through service role',async()=>{
 const db={from(table){return {select(){return this;},in(){return this;},or(){return this;},then(resolve,reject){return Promise.resolve({data:table==='accounts'?[{id:'foreign-account',workspace_id:'other',name:'Private bank'}]:[{id:'foreign-category',workspace_id:'other',name:'Private medical category'},{id:'system',workspace_id:null,user_id:null,is_system:true,name:'Official'}],error:null}).then(resolve,reject);}};}};
 const rows=await enrichFinancialRows(db,[{workspace_id:'family',account_id:'foreign-account',category_id:'foreign-category'},{workspace_id:'family',category_id:'system'}],{ids:['family','other']},{accounts:true});
 assert.equal(rows[0].accounts,null);assert.equal(rows[0].categories,null);assert.equal(rows[0].account_id,null);assert.equal(rows[0].category_id,null);assert.equal(rows[0].relation_needs_review,true);
 assert.equal(rows[1].categories.name,'Official');assert.equal(rows[1].category_id,'system');
});
