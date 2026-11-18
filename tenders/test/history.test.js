import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore, createSupabaseStore } from '../store.js';
import { makeApp, listen } from './helpers.js';

test('history records source business changes and shared workflow; ignores sync, score and private fields', async () => {
  const store = createMemoryStore();
  const row = {source:'test',external_id:'1',title:'Cable',quantity:10,total_price:100};
  await store.upsertLots([row]);
  const id = (await store.listLots())[0].id;
  await store.upsertLots([{...row,score:80,extra:{document:'private'}}]);
  assert.equal((await store.history(id)).items.length,1);
  await store.upsertLots([{...row,total_price:120}]);
  await store.setState(id,{status:'review',updated_by:'user-1'});
  await store.setState(id,{status:'review',updated_by:'user-2'});
  await store.setState(id,{note:'Check licence',updated_by:'user-2'});
  const h = (await store.history(id)).items;
  assert.equal(h.length,4);
  assert.equal(h[0].actor_id,'user-2');
  assert.equal(h[0].before_data.status,'review');
  assert.equal(h[2].before_data.total_price,100);
  assert.equal(h[2].after_data.total_price,120);
  assert.equal(h[3].before_data,null);
  assert.equal('extra' in h[3].after_data,false);
  h[0].after_data.note='changed';
  assert.equal((await store.history(id)).items[0].after_data.note,'Check licence');
  for(let i=0;i<60;i++) await store.setState(id,{note:String(i)});
  assert.equal((await store.history(id)).items.length,50);
  assert.equal((await store.history(id)).items[0].after_data.note,'59');
});

test('history endpoint denies guests and unrelated accounts; missing lot is 404', async t => {
  const m = makeApp(), server = await listen(m.app); t.after(server.close);
  await m.store.upsertLots([{source:'test',external_id:'1',title:'Cable'}]);
  const id=(await m.store.listLots())[0].id, path=`/api/tenders/${id}/history`;
  assert.equal((await server.call('GET',path)).status,401);
  assert.equal((await server.call('GET',path,{token:'token:u2:shopper@example.com'})).status,403);
  const result=await server.call('GET',path,{token:'token:u1:boss@example.com'});
  assert.equal(result.status,200); assert.equal(result.json.items.length,1);
  assert.equal((await server.call('GET','/api/tenders/missing/history',{token:'token:u1:boss@example.com'})).status,404);
});

test('Supabase history handles only missing schema as not enabled; permission/network errors remain errors', async () => {
  for(const code of ['PGRST205','42P01','42501','57014']) {
    const q={select(){return this;},eq(){return this;},order(){return this;},limit(){return Promise.resolve({error:{code,message:'secret database details'}});}};
    const store=createSupabaseStore({from:()=>q});
    if(['PGRST205','42P01'].includes(code)) assert.deepEqual(await store.history('id'),{available:false,items:[]});
    else await assert.rejects(store.history('id'),e=>!e.message.includes('secret'));
  }
});
