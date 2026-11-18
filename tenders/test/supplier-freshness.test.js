import test from 'node:test';
import assert from 'node:assert/strict';
import {compareSuppliers} from '../suppliers.js';
import {makeApp} from './helpers.js';
const start=Date.parse('2026-11-01T00:00:00Z'),day=86400000;
const inputs=()=>({model:'A',requirements:[],offers:[{supplier:'Fixture supplier',model:'A',url:'https://example.com/fixture',currency:'KZT',unitPrice:100,quantity:1,observedAt:'2026-11-01',shipping:{mode:'unknown'},customs:{mode:'unknown'},availabilityConfirmed:false,deliveryConfirmed:false}]});

test('price freshness uses elapsed seven days, not rounded age; confirmations require real booleans',()=>{
 const input=inputs();input.offers[0].availabilityConfirmed='false';input.offers[0].deliveryConfirmed='yes';
 const first=compareSuppliers(input,{now:start+7*day});assert.equal(first.rows[0].stale,false);
 const later=compareSuppliers(input,{now:start+7*day+1});assert.equal(later.rows[0].stale,true);assert.equal(later.rows[0].ageDays,7);
 assert.ok(later.rows[0].unknown.includes('availability'));assert.ok(later.rows[0].unknown.includes('delivery_date'));
 assert.equal(later.evaluatedAt,new Date(start+7*day+1).toISOString());assert.equal(later.freshnessDays,7);
});

test('saved supplier comparisons refresh on reads without writes or cross-user access; invalid saved inputs preserve finance',async()=>{
 let clock=start;const {service,store}=makeApp({now:()=>clock});
 await store.upsertLots([{source:'test',external_id:'1',title:'Fixture'}]);const id=(await store.listLots())[0].id;
 await service.saveWorkspace('u1',id,{supplierAnalysis:inputs()});
 const key='workspace:u1:'+id,original=structuredClone(await store.getSetting(key));
 clock=start+8*day;
 const refreshed=await service.getWorkspace('u1',id);assert.equal(refreshed.supplierAnalysis.results.rows[0].stale,true);assert.equal(refreshed.supplierAnalysis.results.rows[0].ageDays,8);
 assert.deepEqual(await store.getSetting(key),original);assert.equal((await service.getWorkspace('u2',id)).supplierAnalysis,undefined);
 const report=await service.report('u1',id);assert.equal(report.suppliers[0].stale,true);
 const bad={...original,finance:{inputs:{fixture:'preserved'}},supplierAnalysis:{inputs:{offers:[{}]},results:{rows:[{unitPrice:999999}]}}};await store.setSetting(key,bad);
 const rejected=await service.getWorkspace('u1',id);assert.equal(rejected.supplierAnalysis.results,null);assert.match(rejected.supplierAnalysis.error,/Пересчитайте/);assert.deepEqual(rejected.finance,bad.finance);assert.deepEqual(await store.getSetting(key),bad);
});
