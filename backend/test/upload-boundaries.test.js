import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createBoundedUpload } from '../src/routes/import.js';
function response(){const res=new EventEmitter();res.status=code=>{res.code=code;return res;};res.json=body=>{res.body=body;return res;};return res;}
test('upload admission rejects repeated user and fifth concurrent source before buffering',()=>{
 let buffered=0;const callbacks=[];
 const guard=createBoundedUpload((_req,_res,callback)=>{buffered++;callbacks.push(callback);});
 const first=response();let continued=false;
 guard({user:{id:'a'}},first,()=>{continued=true;});
 const repeat=response();guard({user:{id:'a'}},repeat,()=>assert.fail('same user entered buffer'));
 assert.equal(repeat.code,429);assert.equal(buffered,1);
 for(const id of ['b','c','d'])guard({user:{id}},response(),()=>{});
 const fifth=response();guard({user:{id:'e'}},fifth,()=>assert.fail('global cap exceeded'));
 assert.equal(fifth.code,429);assert.equal(buffered,4);
 callbacks[0]();assert.equal(continued,true);first.emit('finish');
 const after=response();guard({user:{id:'a'}},after,()=>{});assert.equal(buffered,5);assert.equal(after.code,undefined);
});
test('invalid upload releases its slot and reports the real size failure',()=>{
 let attempts=0;const guard=createBoundedUpload((_req,_res,callback)=>{attempts++;callback({code:'LIMIT_FILE_SIZE'});});
 const one=response(),two=response();guard({user:{id:'same'}},one,()=>assert.fail());guard({user:{id:'same'}},two,()=>assert.fail());
 assert.equal(one.code,413);assert.equal(two.code,413);assert.equal(attempts,2);
});
