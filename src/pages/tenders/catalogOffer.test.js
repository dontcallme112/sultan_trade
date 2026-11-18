import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogOffer,offerEquipmentTotal} from './catalogOffer.js';
const product={source:'Fixture',name:'A',price:100,currency:'USD',updatedAt:'2026-11-01T12:00:00Z',url:'https://example.com/product'};
test('catalog keeps source currency/date; missing FX never becomes zero tenge',()=>{
 const offer=catalogOffer(product);assert.equal(offer.currency,'USD');assert.equal(offer.observedAt,'2026-11-01');assert.equal(offer.fxRate,'');assert.equal(offer.fxDate,'');assert.equal(offerEquipmentTotal(offer),null);
 assert.equal(offerEquipmentTotal({...offer,fxRate:500,fxDate:'2026-11-18'}),50000);
 assert.equal(offerEquipmentTotal({...offer,fxRate:500}),null);
});
test('incomplete and placeholder catalog products cannot be added; valid KZT requires no FX',()=>{
 for(const patch of [{currency:''},{updatedAt:null},{updatedAt:'invalid'},{price:1},{price:null}])assert.equal(catalogOffer({...product,...patch}),null);
 const offer=catalogOffer({...product,currency:'KZT'});assert.equal(offerEquipmentTotal(offer),100);
 for(const patch of [{unitPrice:''},{quantity:0},{fxRate:Infinity,currency:'USD',fxDate:'2026-11-18'}])assert.equal(offerEquipmentTotal({...offer,...patch}),null);
});
