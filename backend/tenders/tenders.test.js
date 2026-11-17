import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DemoStore } from './store.js';
import { createTenderRouter } from './router.js';
import { tenderAuth } from './auth.js';
import { demoTenders, scoreTender, filterTenders } from './domain.js';

test('rating exposes uncertainty and all business categories', () => {
  assert.equal(scoreTender({ title:'Камеры NVR' }).score,100);
  assert.equal(scoreTender({ title:'Поставка бумаги' }).score,0);
  assert.equal(scoreTender({ title:'Сервер' }).coverage,0.2);
  assert.ok(scoreTender({ title:'Сервер' }).unknown.includes('Прибыль'));
});
test('filters respect expiry, amounts, source status, keywords and validation', () => {
  const rows = demoTenders().map(t=>({...t,rating:scoreTender(t),favorite:true,workflow:'new'}));
  assert.equal(filterTenders(rows,{search:'NVR',min:'4000000',region:'Астана'}).length,1);
  assert.equal(filterTenders(rows,{active:'true'},Date.parse('2030-01-01')).length,0);
  assert.equal(filterTenders(rows,{category:'it',favorite:'true',status:'new'}).length,1);
  assert.throws(()=>filterTenders(rows,{min:'NaN'}));
  assert.throws(()=>filterTenders(rows,{min:'9',max:'1'}));
  assert.throws(()=>filterTenders(rows,{before:'invalid'}));
});
test('API: sync, deduplication, persistence, isolation, history, failure log, RBAC', async t => {
  const dir = await mkdtemp(join(tmpdir(),'tender-test-'));
  const path = join(dir,'state.json');
  const app = express(); app.use(express.json());
  app.use('/api/tenders',createTenderRouter({ store:new DemoStore(path),demo:true,authenticate:(req,res,next)=>{
    if (!req.headers['x-user']) return res.status(401).end();
    req.user={id:req.headers['x-user'],role:req.headers['x-role'] || 'analyst'};next();
  }}));
  const server = app.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r));
  t.after(async()=>{ await new Promise(r=>server.close(r)); await rm(dir,{recursive:true,force:true}); });
  const call = async(path='',method='GET',body,user='a',role='admin')=>{
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api/tenders${path}`,{
      method,headers:{'content-type':'application/json',...(user?{'x-user':user,'x-role':role}:{})},body:body?JSON.stringify(body):undefined});
    return {status:response.status,body:response.status===401?null:await response.json()};
  };
  assert.equal((await call('','GET',null,null)).status,401);
  assert.equal((await call('/access','GET',null,null)).status,401);
  assert.equal((await call('/connection','GET',null,null)).status,401);
  assert.equal((await call('/access')).body.allowed,true);
  assert.equal((await call('/sync','POST',{source:'demo'},'a','viewer')).status,403);
  assert.equal((await call('/sync','POST',{source:'demo'})).body.changed,4);
  assert.equal((await call('/sync','POST',{source:'demo'})).body.changed,0);
  assert.equal((await call()).body.total,4);
  assert.equal((await call('?min=oops')).status,400);
  assert.equal((await call('?page=-1')).status,400);
  await call('/demo%3A1','PATCH',{favorite:true,workflow:'preparing'});
  assert.equal((await call('?favorite=true')).body.total,1);
  assert.equal((await call('?favorite=true','GET',null,'b')).body.total,0);
  assert.equal((await new DemoStore(path).all('preferences'))[0].workflow,'preparing');
  assert.equal((await call('/demo%3A1')).body.history.length,2);
  assert.equal((await call('/demo%3A1','GET',null,'b')).body.history.length,1);
  assert.equal((await call('/demo%3A1','PATCH',{workflow:'invalid'})).status,400);
  assert.equal((await call('/missing','PATCH',{favorite:true})).status,404);
  assert.equal((await call('/demo%3A1','PATCH',{favorite:false},'a','viewer')).status,403);
  assert.equal((await call('/sync','POST',{source:'goszakup'})).status,503);
  assert.equal((await call('/sync-runs')).body.runs.filter(r=>r.status==='error').length,1);
});
test('production authentication fails closed and ignores self-claimed roles',async()=>{
  let nextCalled=false;
  const res={status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
  await tenderAuth(null)({},res,()=>{nextCalled=true;});assert.equal(res.code,503);
  const client={auth:{getUser:async()=>({data:{user:{id:'u',user_metadata:{role:'admin'}}}})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:null})})})})};
  await tenderAuth(client)({headers:{authorization:'Bearer test'}},res,()=>{nextCalled=true;});
  assert.equal(res.code,403);assert.equal(nextCalled,false);
});

test('employee access uses server membership, including revocation and expired sessions', async () => {
  let membership = { role: 'viewer' };
  let expired = false;
  const client = {
    auth: { getUser: async () => ({ data: { user: expired ? null : { id: 'employee', user_metadata: { role: 'admin' } } }, error: expired ? new Error('expired') : null }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: membership, error: null }) }) }) }),
  };
  const auth = tenderAuth(client);
  const res = { status(code) { this.code = code; return this; }, json() { return this; } };
  const req = { headers: { authorization: 'Bearer valid' } };
  let allowed = false;
  await auth(req, res, () => { allowed = true; });
  assert.equal(allowed, true);
  assert.equal(req.user.role, 'viewer');
  membership = null; allowed = false;
  await auth(req, res, () => { allowed = true; });
  assert.equal(allowed, false); assert.equal(res.code, 403);
  expired = true;
  await auth(req, res, () => { allowed = true; });
  assert.equal(res.code, 401); assert.equal(allowed, false);
});
