import test from 'node:test';import assert from 'node:assert/strict';
import {purchaseQuantityStatus} from '../purchase-quantity.js';
test('quantity checks use requested amount, retain decimals and never infer grouped product quantities',()=>{
 assert.equal(purchaseQuantityStatus({quantity:5},{quantity:1,purchaseQuantity:10}),'insufficient');
 assert.equal(purchaseQuantityStatus({quantity:2.5},{quantity:2.5}),'sufficient');
 assert.equal(purchaseQuantityStatus({quantity:2.5},{quantity:3}),'sufficient');
 for(const lot of [{quantity:null},{quantity:0},{quantity:NaN},{quantity:1,number:'123-ОЛ-1'},{quantity:1,extra:{enstru:[{},{}]}}])assert.equal(purchaseQuantityStatus(lot,{quantity:10}),'unknown');
 assert.equal(purchaseQuantityStatus({quantity:1},{quantity:null}),'unknown');
});
