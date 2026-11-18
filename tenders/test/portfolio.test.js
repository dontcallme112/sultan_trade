import test from 'node:test';
import assert from 'node:assert/strict';
import {financialPortfolio} from '../portfolio.js';
import {makeApp,listen} from './helpers.js';
import {finance} from './finance-fixture.js';
const at='2026-11-18T00:00:00Z';
const row=(id,netProfit,state='Приём заявок',confirmed=true)=>({lot:{id,title:id,sourceStatus:state,deadline:'2026-12-01T00:00:00Z'},finance:netProfit==null?null:{inputs:{date:'2026-11-18'},results:{completeness:confirmed?'user_confirmed':'unconfirmed',netProfit,marginPercent:5}}});
test('portfolio sums only open confirmed scenarios, retaining loss, zero, missing and closed distinctions',()=>{
 const p=financialPortfolio([row('positive',0.1),row('loss',-0.2),row('zero',0),row('closed',999,'Закупка завершена'),row('unknown',888,'Опубликовано'),row('draft',777,'Приём заявок',false),row('missing',null)],{evaluatedAt:at});
 assert.equal(p.summary.openKnownProfit,'-0.10');assert.equal(p.summary.openConfirmed,3);assert.equal(p.summary.openNonPositive,2);assert.equal(p.summary.openWithoutConfirmedFinance,2);assert.equal(p.rows.find(r=>r.id==='draft').netProfit,null);assert.equal(p.rows.find(r=>r.id==='missing').netProfit,null);
 assert.equal(financialPortfolio([row('missing',null)],{evaluatedAt:at}).summary.openKnownProfit,null);assert.equal(financialPortfolio([],{evaluatedAt:at}).summary.selected,0);
});
test('private filtered portfolio covers all pages, recalculates saved inputs and never includes another employees costs',async t=>{
 const m=makeApp({now:()=>Date.parse(at)}),s=await listen(m.app);t.after(s.close);await m.store.upsertLots(Array.from({length:26},(_,i)=>({source:'test',external_id:String(i),title:'Portfolio '+i,status_raw:'Приём заявок',deadline_at:'2026-12-01T00:00:00Z'})));const lots=await m.store.listLots();
 await m.service.saveWorkspace('u1',lots[0].id,{finance:{...finance(),confirmedCosts:true}});await m.service.saveWorkspace('u2',lots[1].id,{finance:{...finance(),confirmedCosts:true}});await m.service.saveWorkspace('u1',lots[2].id,{finance:{...finance(),confirmedCosts:false}});
 const original=structuredClone(await m.store.getSetting('workspace:u1:'+lots[0].id));
 const token='token:u1:boss@example.com',path='/api/tenders/portfolio';for(const [opts,expected] of [[{},401],[{secret:'S3CRET'},401],[{token:'token:u2:shopper@example.com'},403]])assert.equal((await s.call('GET',path,opts)).status,expected);
 const p=(await s.call('GET',path+'?page=2&limit=1',{token})).json;assert.equal(p.rows.length,26);assert.equal(p.summary.openKnownProfit,'86.00');assert.equal(p.summary.confirmed,1);assert.equal(p.summary.unconfirmed,1);assert.equal(p.rows.find(r=>r.id===lots[1].id).netProfit,null);
 assert.deepEqual(await m.store.getSetting('workspace:u1:'+lots[0].id),original);assert.equal((await s.call('GET',path+'?search=missing',{token})).json.summary.selected,0);
});
