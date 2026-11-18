import test from 'node:test';
import assert from 'node:assert/strict';
import {oneCPackage,oneCStatus} from '../onec/exchange.js';
import {makeApp,listen} from './helpers.js';
import {finance} from './finance-fixture.js';
const report=()=>({generatedAt:'2026-11-18T00:00:00Z',lot:{id:'fixture-id',title:'Fixture lot',currency:'USD',budget:100.25,quantity:2},finance:null});
test('1C preparation retains source identity/currency, unknown values and stable content hashes',()=>{
 const first=oneCPackage([report()]);assert.equal(first.mode,'preparation_only');assert.equal(first.postingAllowed,false);assert.equal(first.items[0].referenceBudget.amount,'100.25');assert.equal(first.items[0].referenceBudget.currency,'USD');assert.equal(first.items[0].customer.bin,null);assert.equal(first.items[0].accountingMapping.nomenclatureRef,null);
 const again=report();again.generatedAt='2026-11-19T00:00:00Z';assert.equal(oneCPackage([again]).contentHash,first.contentHash);again.lot.budget=200;assert.notEqual(oneCPackage([again]).items[0].contentHash,first.items[0].contentHash);assert.equal(oneCPackage([again]).items[0].externalKey,first.items[0].externalKey);
 assert.equal(oneCPackage([{...report(),lot:{id:'x',title:'Unknown'}}]).items[0].referenceBudget.amount,null);assert.equal(oneCStatus().connected,false);
});
test('1C package is employee-private, filtered, read-only and cannot authorize posting',async t=>{
 const m=makeApp(),s=await listen(m.app);t.after(s.close);await m.store.upsertLots([{source:'test',external_id:'1',title:'OneC fixture',currency:'KZT',total_price:1160,quantity:2}]);const id=(await m.store.listLots())[0].id;await m.service.saveWorkspace('u1',id,{finance:{...finance(),confirmedCosts:true}});
 const token='token:u1:boss@example.com',path='/api/tenders/onec/package.json';for(const [opts,expected] of [[{},401],[{token:'token:u2:shopper@example.com'},403],[{secret:'S3CRET'},401]])assert.equal((await s.call('GET',path,opts)).status,expected);
 const result=await s.call('GET',path,{token});assert.equal(result.status,200);assert.equal(result.json.items.length,1);assert.equal(result.json.preparedByUserId,'u1');assert.equal(result.json.items[0].analysis.netProfit,'86.00');assert.equal(result.json.items[0].analysis.accountingDocument,false);
 const other=oneCPackage(await m.service.listReport('u2',{}));assert.equal(other.items[0].analysis,null);assert.equal((await s.call('GET',path+'?search=missing',{token})).status,422);
 assert.equal((await s.call('GET','/api/tenders/onec/status',{token})).json.postingEnabled,false);assert.equal((await s.call('GET','/api/tenders/onec/reader.bsl')).status,401);
});
