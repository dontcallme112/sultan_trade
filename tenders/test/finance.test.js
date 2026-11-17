import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateFinance,validateOffers,COST_KEYS} from '../finance.js';
import {finance} from './finance-fixture.js';
test('VAT cash is separate from profit; risk reserve is added back for CIT',()=>{
 const r=calculateFinance(finance());
 assert.equal(r.revenueNet,1000);assert.equal(r.costTotal,880);assert.equal(r.grossProfit,390);
 assert.equal(r.preTax,120);assert.equal(r.taxableProfit,170);assert.equal(r.corporateTax,34);assert.equal(r.netProfit,86);
 assert.equal(r.inputVat,112);assert.equal(r.outputVat,160);assert.equal(r.vatBalance,48);assert.equal(r.marginPercent,8.6);assert.equal(r.minimumBidGross,1035.3);
 const minimum=finance();minimum.bidGross=r.minimumBidGross;assert.equal(calculateFinance(minimum).netProfit,0);
 for(const amount of [111.11,137.42,580.37]){const f=finance();f.costs.equipment.gross=amount;f.bidGross=calculateFinance(f).minimumBidGross;assert.ok(calculateFinance(f).netProfit>=0);}
});
test('target profit, loss, non-VAT payer, unconfirmed zero costs and effective dates',()=>{
 const f=finance();f.targetNetProfit=100;f.bidGross=calculateFinance(f).minimumBidGross;assert.equal(calculateFinance(f).netProfit,100);
 f.bidGross=580;assert.equal(calculateFinance(f).corporateTax,0);assert.ok(calculateFinance(f).netProfit<0);
 f.vatPayer=false;assert.equal(calculateFinance(f).inputVat,0);assert.equal(calculateFinance(f).outputVat,0);
 f.date='2027-01-01';assert.throws(()=>calculateFinance(f),/не действуют/);
 f.date='2026-02-30';assert.throws(()=>calculateFinance(f),/дату/);
});
test('invalid and missing financial data do not silently become zero',()=>{
 const f=finance();for(const key of COST_KEYS){const x=structuredClone(f);delete x.costs[key];assert.throws(()=>calculateFinance(x));}
 f.tax.vatPercent='';assert.throws(()=>calculateFinance(f));f.tax.vatPercent=16;f.costs.equipment.gross=-1;assert.throws(()=>calculateFinance(f));
});
test('supplier quotes retain source, price date, manual status and explicit FX',()=>{
 const quote={supplier:'Поставщик',model:'Exact-1',currency:'CNY',unitPrice:100,quantity:2,fxRate:70,fxDate:'2026-11-17',observedAt:'2026-11-17',url:'https://example.com/product'};
 const row=validateOffers([quote])[0];assert.equal(row.totalKzt,14000);assert.equal(row.verification,'manual_unverified');assert.equal(row.url,quote.url);
 assert.throws(()=>validateOffers([{...quote,fxRate:''}]));assert.throws(()=>validateOffers([{...quote,url:'javascript:alert(1)'}]));
 assert.throws(()=>validateOffers([{...quote,observedAt:'2026-02-30'}]));
});
