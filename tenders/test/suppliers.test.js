import test from 'node:test';
import assert from 'node:assert/strict';
import {compareSuppliers,calculateExtendedRating,supplierSources} from '../suppliers.js';
import {calculateFinance} from '../finance.js';
import {makeApp,listen} from './helpers.js';
const now=Date.parse('2026-11-17T12:00:00Z');
const base=()=>({supplier:'Test supplier',model:'A-10',url:'https://example.com/product',currency:'CNY',unitPrice:100,quantity:3,packSize:2,fxRate:70,fxDate:'2026-11-17',observedAt:'2026-11-17',shipping:{mode:'weight',weightKg:10,rateKztKg:1000,fixedKzt:500},customs:{mode:'import',basis:'Test broker rates, not real tax advice',from:'2026-01-01',to:'2026-12-31',freightToBorder:8000,valueAdjustment:0,dutyPercent:10,feesKzt:2000,vatBaseAdditions:2000,vatPercent:16},parameters:{power:{value:'20',unit:'W',source:'datasheet page 2'}},availabilityConfirmed:false,deliveryConfirmed:false});
test('landed cash: pack rounding, FX, shipping, duty, fees, import VAT are counted once',()=>{
 const result=compareSuppliers({model:'A-10',requirements:[{key:'power',op:'min',value:'15',unit:'W'}],offers:[base()]},{now}).rows[0];
 assert.equal(result.purchaseQuantity,4);assert.equal(result.goodsKzt,28000);assert.equal(result.shippingKzt,10500);
 assert.equal(result.customs.value,36000);assert.equal(result.customs.duty,3600);assert.equal(result.customs.importVat,6656);assert.equal(result.totalCashKzt,50756);
 assert.equal(result.checks[0].status,'matches');assert.equal(result.modelMatch,true);assert.equal(result.fullCompliance,false);
});
test('unknown shipping/customs stay unknown; no zero default or fabricated quote',()=>{
 const o=base();o.shipping={mode:'unknown'};o.customs={mode:'unknown'};
 const r=compareSuppliers({model:'A-100',requirements:[],offers:[o]},{now}).rows[0];assert.equal(r.totalCashKzt,null);assert.equal(r.modelMatch,false);assert.ok(r.unknown.includes('customs'));
 assert.equal(supplierSources()[2].state,'manual_only');assert.equal(supplierSources()[3].state,'not_connected');
});
test('parameter mismatch or wrong units cannot become full compliance',()=>{
 const o=base();o.parameters.power.unit='kW';
 assert.equal(compareSuppliers({model:'A-10',requirements:[{key:'power',op:'min',value:'15',unit:'W'}],offers:[o]},{now}).rows[0].checks[0].status,'unknown');
 o.parameters.power.unit='W';o.parameters.power.value='10';assert.equal(compareSuppliers({model:'A-10',requirements:[{key:'power',op:'min',value:'15',unit:'W'}],offers:[o]},{now}).rows[0].checks[0].status,'fails');
});
test('reject unavailable price, missing FX date, invalid tax period and border freight double counting',()=>{
 for(const mutate of [o=>o.unitPrice=1,o=>o.fxDate='',o=>o.observedAt='2027-01-01',o=>o.customs.from='2027-01-01',o=>o.customs.freightToBorder=20000]){const o=base();mutate(o);assert.throws(()=>compareSuppliers({model:'',offers:[o]},{now}),{status:400});}
});
test('rating returns unknown with no evidence and separately exposes low coverage',()=>{
 assert.equal(calculateExtendedRating().score,null);
 const r=calculateExtendedRating({criteria:{profit:{score:100,evidence:'Forecast inputs, not verified'}}});assert.equal(r.score,100);assert.equal(r.coverage,.15);assert.equal(r.preliminary,true);assert.equal(r.unknown.length,8);
 assert.throws(()=>calculateExtendedRating({criteria:{profit:{score:100,evidence:''}}}),{status:400});
});
test('import VAT credit changes cost/profit without changing initial cash expenses',()=>{
 const input={date:'2026-11-17',tax:{from:'2026-01-01',to:'2026-12-31',vatPercent:0,citPercent:0},vatPayer:true,bidGross:100000,costs:Object.fromEntries(['equipment','delivery','customs','installation','salary','other','reserve','financing'].map(k=>[k,{gross:k==='equipment'?50000:0,vatPercent:0,recoverable:false}])),importVat:{amount:8000,recoverable:true}};
 const credit=calculateFinance(input);assert.equal(credit.costTotal,50000);assert.equal(credit.netProfit,50000);assert.equal(credit.cashExpenses,58000);assert.equal(credit.importVatCredit,8000);
 input.importVat.recoverable=false;const noCredit=calculateFinance(input);assert.equal(noCredit.costTotal,58000);assert.equal(noCredit.netProfit,42000);assert.equal(noCredit.cashExpenses,58000);
});
test('protected comparison route; settings survive partial saves and stay user-private',async()=>{
 const {app,service}=makeApp(),http=await listen(app);try{
 assert.equal((await http.call('POST','/api/tenders/suppliers/compare',{body:{model:'',offers:[]}})).status,401);
 const sync=await service.sync('portal-file',[{lot_number:'SUP-1',name_ru:'Test lot'}]);assert.equal(sync.inserted,1);const lot=(await service.list('u1')).items[0];
 const inputs={model:'A-10',requirements:[],offers:[{...base(),currency:'KZT',observedAt:'2026-09-30',shipping:{mode:'fixed',amount:1000},customs:{mode:'none',reason:'Domestic purchase'}}]};
 await service.saveWorkspace('u1',lot.id,{supplierAnalysis:inputs});await service.saveWorkspace('u1',lot.id,{extendedRating:{criteria:{}}});await service.saveWorkspace('u1',lot.id,{offers:[]});
 assert.ok((await service.getWorkspace('u1',lot.id)).supplierAnalysis);assert.ok((await service.getWorkspace('u1',lot.id)).extendedRating);assert.equal((await service.getWorkspace('u2',lot.id)).supplierAnalysis,undefined);
 const before=await service.getWorkspace('u1',lot.id);await assert.rejects(service.saveWorkspace('u1',lot.id,{supplierAnalysis:{model:'',offers:[{}]}}));assert.deepEqual(await service.getWorkspace('u1',lot.id),before);
 }finally{await http.close();}
});

test('decimal parameter and model identifiers are never collapsed into other numbers',()=>{
 const o=base();o.model='A1.5';o.parameters.power.value='1.5';
 const row=compareSuppliers({model:'A15',requirements:[{key:'power',op:'eq',value:'15',unit:'W'}],offers:[o]},{now}).rows[0];
 assert.equal(row.modelMatch,false);assert.equal(row.checks[0].status,'fails');
 assert.throws(()=>calculateExtendedRating(null),{status:400});
});

test('catalog uses dealer source field through existing mapper; USD and source timestamp stay explicit',async()=>{
 const {createTenderCatalogSearch}=await import('../catalog.js');
 const calls=[];const q={select(fields){assert.ok(fields.includes('price1'));return this;},limit(n){assert.equal(n,20);return this;},eq(k,v){calls.push([k,v]);return this;},ilike(k,v){calls.push([k,v]);return this;},then(resolve){return Promise.resolve({data:[{article:'123',name:'Fixture',price1:500,synced_at:'2026-01-01T00:00:00Z'},{article:'124',name:'USD fixture',price_usd:10}]}).then(resolve);}};
 const search=createTenderCatalogSearch({db:{from(name){assert.equal(name,'products');return q;}},normalizePrice:p=>({price:p.price1})});
 const rows=await search('123');assert.equal(rows[0].price,500);assert.equal(rows[0].updatedAt,'2026-01-01T00:00:00Z');assert.equal(rows[1].price,10);assert.equal(rows[1].currency,'USD');assert.equal(rows[1].updatedAt,null);assert.deepEqual(calls[0],['article','123']);
 await search('A%_');assert.equal(calls[1][0],'name');assert.equal(calls[1][1],'%A'+String.fromCharCode(92)+'%'+String.fromCharCode(92)+'_%');
});

test('malformed requirement collections reject instead of silently losing constraints',()=>{
 assert.throws(()=>compareSuppliers({model:'',offers:[],requirements:{power:'16'}}),{status:400});
});
