import test from 'node:test';
import assert from 'node:assert/strict';
import { withImportCategorySuggestions, applyImportCategorySuggestions } from '../src/services/importCategorization.js';

const workspace='10000000-0000-4000-8000-000000000001';
const jobId='20000000-0000-4000-8000-000000000001';
const rowId='30000000-0000-4000-8000-000000000001';
const categoryId='40000000-0000-4000-8000-000000000001';
const row={id:rowId,import_id:jobId,workspace_id:workspace,description:'Compra no débito - Supermercado Exemplo',amount_cents:'-1250',amount:'-12.50',economic_kind:'standard',category_id:null,source:{line:7}};
const category={id:categoryId,name:'Alimentação',type:'expense',subcategories:['Mercado'],is_system:true,user_id:null,workspace_id:null};
const job={id:jobId,workspace_id:workspace,status:'needs_review'};
function fixture(overrides={}) {
 const tables={categories:[category],ai_rules:[],transactions:[],import_rows:[row],...overrides};
 const calls=[];
 const db={from(table){
  let records=[...(tables[table]||[])];
  const q={select(){return q;},or(){return q;},order(){return q;},
   eq(key,value){records=records.filter(r=>r[key]===value);return q;},
   in(key,values){records=records.filter(r=>values.includes(r[key]));return q;},
   is(key,value){records=records.filter(r=>value===null?r[key]==null:r[key]===value);return q;},
   not(key,_operator,value){records=records.filter(r=>value===null?r[key]!=null:r[key]!==value);return q;},
   limit(n){records=records.slice(0,n);return q;},
   range(start,end){return Promise.resolve({data:records.slice(start,end+1),error:null});},
   then(resolve,reject){return Promise.resolve({data:records,error:null}).then(resolve,reject);},
  };return q;
 },async rpc(name,args){calls.push({name,args});return {data:{categorized:args.p_suggestions.length,skipped:0,review_required:true},error:null};}};
 return {db,calls};
}
test('pending suggestions preserve original source and amounts and make no writes',async()=>{
 const {db,calls}=fixture();const before=structuredClone(row);
 const proposed=await withImportCategorySuggestions(db,[row],{ids:[workspace]});
 assert.equal(proposed[0].category_suggestion.category_id,categoryId);
 assert.equal(proposed[0].category_suggestion.subcategory,'Mercado');
 assert.equal(proposed[0].category_id,null);assert.equal(proposed[0].source,row.source);
 assert.deepEqual(row,before);assert.equal(calls.length,0);
 await assert.rejects(withImportCategorySuggestions(db,[row],{ids:['other']}),e=>e.status===403);
});
test('category application recalculates only selected authorized rows and never posts financial entries',async()=>{
 const {db,calls}=fixture();const result=await applyImportCategorySuggestions(db,{actor:'actor',job,ids:[rowId]});
 assert.equal(result.categorized,1);assert.equal(result.review_required,true);
 assert.deepEqual(calls,[{name:'apply_import_category_suggestions',args:{p_actor:'actor',p_import:jobId,p_suggestions:[{id:rowId,category_id:categoryId,subcategory:'Mercado'}]}}]);
});
test('foreign rows, repeated IDs and completed jobs cannot enter category application',async()=>{
 const {db,calls}=fixture();
 await assert.rejects(applyImportCategorySuggestions(db,{actor:'actor',job,ids:[rowId,rowId]}),e=>e.status===400);
 await assert.rejects(applyImportCategorySuggestions(db,{actor:'actor',job:{...job,status:'completed'},ids:[rowId]}),e=>e.status===409);
 await assert.rejects(applyImportCategorySuggestions(db,{actor:'actor',job,ids:['30000000-0000-4000-8000-000000000099']}),e=>e.status===403);
 assert.equal(calls.length,0);
});
test('manual categories and uncertain or transfer rows are skipped without a write',async()=>{
 for(const change of [{category_id:categoryId},{economic_kind:'transfer'},{linked_transaction_id:'linked'},{reversal_of:'original'},{description:'Pix recebido - Pessoa Exemplo',amount_cents:'1250',amount:'12.50'}]){
  const {db,calls}=fixture({import_rows:[{...row,...change}]});
  const result=await applyImportCategorySuggestions(db,{actor:'actor',job,ids:[rowId]});
  assert.equal(result.categorized,0);assert.equal(result.skipped,1);assert.equal(calls.length,0);
 }
});
test('database failure does not report successful category changes',async()=>{
 const {db}=fixture();db.rpc=async()=>({data:null,error:Object.assign(new Error('transaction rolled back'),{code:'P0001'})});
 await assert.rejects(applyImportCategorySuggestions(db,{actor:'actor',job,ids:[rowId]}),/rolled back/);
});
