import test from 'node:test';import assert from 'node:assert/strict';
import {lotQuantity,quantityWarning} from './lotQuantity.js';
import {catalogOffer,offerEquipmentTotal} from './catalogOffer.js';
test('single product lot quantity is retained and undersupply is visible',()=>{
 assert.equal(lotQuantity({quantity:12}),12);assert.match(quantityWarning({quantity:12},1),/меньше/);assert.equal(quantityWarning({quantity:12},12),'');assert.equal(lotQuantity({quantity:2.5}),2.5);
 const o=catalogOffer({name:'Item',price:100,currency:'KZT',updatedAt:'2026-11-19',url:'https://example.com'},12);assert.equal(offerEquipmentTotal(o),1200);
});
test('unknown and grouped quantities never silently become one item',()=>{
 for(const lot of [{quantity:null},{quantity:0},{quantity:'12'},{quantity:1,number:'123-ОЛ-1'},{quantity:1,extra:{enstru:[{},{}]}}]){assert.equal(lotQuantity(lot),null);assert.match(quantityWarning(lot,''),/уточнения/);}
 const o=catalogOffer({name:'Item',price:100,currency:'KZT',updatedAt:'2026-11-19'},'');assert.equal(offerEquipmentTotal(o),null);
});
