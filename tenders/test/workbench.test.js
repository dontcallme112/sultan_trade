import test from 'node:test';
import assert from 'node:assert/strict';
import {makeApp,listen} from './helpers.js';
import {finance} from './finance-fixture.js';
const token='token:u1:boss@example.com',second='token:u2:second@example.com';
test('preview has no writes; import skips invalid data, deduplicates, and accepts >200k safely',async t=>{
 const m=makeApp();const h=await listen(m.app);t.after(h.close);
 const call=(path,body)=>h.call('POST','/api/tenders'+path,{token,body});
 const row={lot_number:'L-1',name_ru:'IP-камеры',total_price:1000,offer_end_date:'2027-01-01',url:'https://goszakup.gov.kz/ru/announce/index/1'};
 const payload={results:[row,row,{...row,lot_number:'L-2',total_price:'oops'}]};
 const p=await call('/import/preview',payload);assert.equal(p.status,200);assert.equal(p.json.accepted,1);assert.equal(p.json.duplicates,1);assert.equal(p.json.skipped,1);
 assert.equal((await m.store.listLots()).length,0);assert.equal((await m.store.listLog()).length,0);
 const r=await call('/import',payload);assert.equal(r.json.inserted,1);assert.equal(r.json.skipped,1);
 assert.equal((await m.service.list('u1')).items[0].source_url,row.url);
 const big={results:[{...row,lot_number:'L-3',description_ru:'x'.repeat(220000),url:'javascript:alert(1)'}]};assert.equal((await call('/import/preview',big)).status,200);
 await call('/import',big);assert.equal((await m.service.list('u1')).items.find(x=>x.number==='L-3').source_url,null);
 assert.equal((await call('/import/preview',{results:[{...row,total_price:-1}]})).status,400);
});
test('workspace persists independently per user; invalid save preserves previous calculation',async t=>{
 const m=makeApp({allowed:['boss@example.com','second@example.com']});await m.service.sync('demo');const h=await listen(m.app);t.after(h.close);
 const lot=(await m.service.list('u1')).items[0];const url='/api/tenders/'+lot.id+'/workspace';
 assert.equal((await h.call('GET',url)).status,401);
 const body={finance:finance(),offers:[{supplier:'Supplier',model:'X-1',unitPrice:100,quantity:2,currency:'KZT',observedAt:'2026-11-17',url:'https://example.com/quote'}]};
 const saved=await h.call('PUT',url,{token,body});assert.equal(saved.status,200);assert.equal(saved.json.finance.results.netProfit,86);
 assert.equal((await h.call('GET',url,{token:second})).json.finance,null);
 const invalid=await h.call('PUT',url,{token,body:{finance:{...finance(),tax:null}}});assert.equal(invalid.status,400);
 assert.equal((await h.call('GET',url,{token})).json.finance.results.netProfit,86);
 await h.call('PUT',url,{token,body:{offers:[]}});assert.equal((await h.call('GET',url,{token})).json.finance.results.netProfit,86);
 assert.equal((await h.call('PUT','/api/tenders/missing/workspace',{token,body})).status,404);
});
test('document endpoint is authenticated and extracts real text in a worker',async t=>{
 const m=makeApp();await m.service.sync('demo');const h=await listen(m.app);t.after(h.close);
 const lot=(await m.service.list('u1')).items[0];const url='/api/tenders/'+lot.id+'/documents/extract';
 const body={name:'spec.txt',base64:Buffer.from('Не менее 16 камер. Гарантия 24 месяца.').toString('base64')};
 assert.equal((await h.call('POST',url,{body})).status,401);
 const r=await h.call('POST',url,{token,body});assert.equal(r.status,200);assert.equal(r.json.mode,'rules_draft');assert.ok(r.json.text.includes('16 камер'));
 const large={...body,base64:Buffer.from('Не менее 16 камер.\n'.repeat(14000)).toString('base64')};assert.equal((await h.call('POST',url,{token,body:large})).status,200);
});
