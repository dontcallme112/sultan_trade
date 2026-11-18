import test from 'node:test';
import assert from 'node:assert/strict';
import {tenderReadiness} from '../readiness.js';
import {makeApp,listen} from './helpers.js';
import {finance} from './finance-fixture.js';
const base=()=>({generatedAt:'2026-11-18T00:00:00Z',lot:{},suppliers:[],finance:null,document:null});
test('missing evidence is unknown, contradictions are problems, and leadership decision is always manual',()=>{
 const empty=tenderReadiness(base());assert.equal(empty.documented,0);assert.equal(empty.unknown,5);assert.equal(empty.checks.at(-1).state,'manual');
 const complete=base();Object.assign(complete.lot,{budget:1000,sourceStatus:'Приём заявок',deadline:'2026-12-01T00:00:00Z'});complete.document={requirements:[{review:{status:'matches'}}]};complete.finance={results:{completeness:'user_confirmed',netProfit:100}};complete.suppliers=[{modelMatch:true,stale:false,currentPriceAgeDays:1,totalCashKzt:500,checks:[{status:'matches'}],unknown:[]}];
 const prepared=tenderReadiness(complete);assert.equal(prepared.documented,5);assert.equal(prepared.problems,0);assert.equal(prepared.checks.at(-1).state,'manual');
 complete.lot.sourceStatus='Закупка завершена';complete.document.requirements[0].review.status='fails';complete.finance.results.netProfit=-1;assert.equal(tenderReadiness(complete).problems,3);
 complete.suppliers[0].stale=true;assert.equal(tenderReadiness(complete).checks.find(c=>c.key==='suppliers').state,'unknown');
});
test('checklist is protected and uses only the current employees saved evidence without writes',async t=>{
 const m=makeApp(),s=await listen(m.app);t.after(s.close);await m.store.upsertLots([{source:'test',external_id:'1',title:'Fixture'}]);const id=(await m.store.listLots())[0].id,path=`/api/tenders/${id}/readiness`;
 assert.equal((await s.call('GET',path)).status,401);assert.equal((await s.call('GET',path,{token:'token:u2:shopper@example.com'})).status,403);assert.equal((await s.call('GET',path,{secret:'S3CRET'})).status,401);
 await m.service.saveWorkspace('u1',id,{finance:{...finance(),confirmedCosts:true}});const original=structuredClone(await m.store.getSetting('workspace:u1:'+id));
 const own=(await s.call('GET',path,{token:'token:u1:boss@example.com'})).json;assert.equal(own.checks.find(c=>c.key==='finance').state,'documented');
 const other=await m.service.report('u2',id);assert.equal(tenderReadiness(other).checks.find(c=>c.key==='finance').state,'unknown');assert.deepEqual(await m.store.getSetting('workspace:u1:'+id),original);
});
