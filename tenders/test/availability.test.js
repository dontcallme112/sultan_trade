import test from 'node:test';
import assert from 'node:assert/strict';
import {procurementAvailability,scoreLot} from '../scoring.js';
import {makeApp,listen,NOW} from './helpers.js';
import {buildTenderReport} from '../report.js';
const future=new Date(NOW+86400000).toISOString(),past=new Date(NOW-1).toISOString();

test('application acceptance requires a recognised open status AND a valid future deadline',()=>{
 for(const row of [{},{deadline_at:future},{status_raw:'Приём заявок'}, {status_raw:'Приём заявок',deadline_at:'bad'}, {status_raw:'Опубликовано',deadline_at:future},{status_raw:'Обсуждение (приём заявок)',deadline_at:future},{status_raw:'Приём заявок не начат',deadline_at:future},{status_raw:'Приём заявок будет начат',deadline_at:future}])assert.equal(procurementAvailability(row,NOW).state,'unknown',JSON.stringify(row));
 for(const status_raw of ['Приём заявок','Прием ценовых предложений','Опубликовано (приём заявок)','Өтінімдерді қабылдау'])assert.equal(procurementAvailability({status_raw,deadline_at:future},NOW).state,'open');
 for(const row of [{deadline_at:past},{deadline_at:new Date(NOW).toISOString()}, {status_raw:'Закупка завершена',deadline_at:future},{status_raw:'Закупка не состоялась'},{status_raw:'Аяқталды'},{status_raw:'Приём заявок приостановлен',deadline_at:future}]) {
  const expected=row.status_raw?.includes('приостановлен')?'unknown':'closed';assert.equal(procurementAvailability(row,NOW).state,expected);
 }
});

test('missing/invalid deadlines never award a positive status/deadline factor',()=>{
 for(const deadline_at of [undefined,'not-a-date']) {
  const score=scoreLot({title:'Cable',directions:['electrical'],status_raw:'Приём заявок',deadline_at},undefined,NOW);
  assert.equal(score.factors.find(f=>f.key==='status').value,null);
  assert.equal(score.factors.find(f=>f.key==='deadline').value,null);
  assert.ok(score.missing.includes('status'));
 }
});

test('API filters unknown/open/closed independently and recomputes time-sensitive scores without writes',async t=>{
 let clock=NOW;const m=makeApp({now:()=>clock}),server=await listen(m.app);t.after(server.close);
 await m.store.upsertLots([
  {source:'test',external_id:'unknown',title:'Missing deadline',score:100,score_confidence:100,status_raw:'Приём заявок'},
  {source:'test',external_id:'open',title:'Open',status_raw:'Приём заявок',deadline_at:future},
  {source:'test',external_id:'closed',title:'Closed',status_raw:'Закупка завершена'}
 ]);
 const token='token:u1:boss@example.com';
 const result=(await server.call('GET','/api/tenders',{token})).json;
 assert.equal(result.summary.open,1);assert.equal(result.summary.closed,1);assert.equal(result.summary.unknown,1);
 const unknown=result.items.find(l=>l.title==='Missing deadline');assert.equal(unknown.is_open,false);assert.ok(unknown.rating.unknown.includes('Статус закупки'));assert.notEqual(unknown.score_confidence,100);
 for(const state of ['open','closed','unknown'])assert.equal((await server.call('GET',`/api/tenders?availability=${state}`,{token})).json.total,1);
 assert.equal((await server.call('GET','/api/tenders?onlyOpen=true',{token})).json.total,1);
 assert.equal((await server.call('GET','/api/tenders?availability=invalid',{token})).status,400);
 const before=(await m.store.history(unknown.id)).items.length;
 clock=NOW+2*86400000;
 assert.equal((await server.call('GET','/api/tenders?availability=open',{token})).json.total,0);
 assert.equal((await server.call('GET','/api/tenders?availability=closed',{token})).json.total,2);
 assert.equal((await m.store.history(unknown.id)).items.length,before);
});

test('JSON report explicitly warns when acceptance is unknown',()=>{
 const report=buildTenderReport({lot:{id:'fixture',title:'Cable',status_raw:'Приём заявок',extra:{}},workspace:{},documentWorkspace:{},generatedAt:new Date(NOW).toISOString()});
 assert.ok(report.warnings.some(w=>w.includes('Приём заявок не подтверждён')));
});
