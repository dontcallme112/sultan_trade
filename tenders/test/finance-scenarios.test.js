import test from 'node:test';
import assert from 'node:assert/strict';
import {financeScenarios} from '../finance-scenarios.js';
import {calculateFinance} from '../finance.js';
import {finance} from './finance-fixture.js';
import {makeApp,listen} from './helpers.js';
test('scenario taxes are recomputed, inputs unchanged and target differs from break-even',()=>{
 const f=finance();f.targetNetProfit=100;f.importVat={amount:100,recoverable:true};const before=structuredClone(f);
 const r=financeScenarios({finance:f,discountPercent:10,costIncreasePercent:20});
 assert.deepEqual(f,before);assert.deepEqual(r.rows[0].results,calculateFinance(f));
 assert.equal(r.rows[1].results.revenueNet,900);assert.equal(r.rows[1].results.netProfit,6);
 assert.equal(r.rows[2].results.costTotal,1056);assert.equal(r.rows[2].results.importVatPaid,120);assert.equal(r.rows[2].results.importVatCredit,120);
 assert.equal(r.rows[3].results.netProfit,-156);assert.equal(r.rows[3].belowBreakEven,true);
 assert.ok(r.rows[0].results.minimumBidGross>r.rows[0].breakEvenBidGross);
 const atMinimum=calculateFinance({...f,targetNetProfit:0,bidGross:r.rows[0].breakEvenBidGross});assert.ok(atMinimum.netProfit>=0);
});
test('non-VAT, nonrecoverable import tax, zero bid and uncertain inputs remain explicit',()=>{
 const f=finance();f.vatPayer=false;f.importVat={amount:100,recoverable:false};
 const r=financeScenarios({finance:f,discountPercent:100,costIncreasePercent:10});
 assert.equal(r.rows[2].results.outputVat,0);assert.equal(r.rows[2].results.importVatCredit,0);assert.equal(r.rows[2].results.importVatPaid,110);
 assert.equal(r.rows[1].bidGross,0);assert.equal(r.rows[1].results.marginPercent,null);assert.equal(r.rows[1].results.completeness,'requires_review');
 for(const v of ['',null,-1,101,true,Infinity])assert.throws(()=>financeScenarios({finance:f,discountPercent:v,costIncreasePercent:0}));
 assert.throws(()=>financeScenarios({finance:f,discountPercent:0,costIncreasePercent:201}));
 f.tax.from='2027-01-01';assert.throws(()=>financeScenarios({finance:f,discountPercent:0,costIncreasePercent:0}));
});
test('scenario endpoint is staff only and never writes a workspace',async()=>{
 const {app,store}=makeApp();store.setSetting=()=>{throw Error('Must not persist scenarios');};const {call,close}=await listen(app);
 try{
  const body={finance:finance(),discountPercent:5,costIncreasePercent:10};
  assert.equal((await call('POST','/api/tenders/finance/scenarios',{body})).status,401);
  assert.equal((await call('POST','/api/tenders/finance/scenarios',{body,token:'token:u:outsider@example.com'})).status,403);
  const r=await call('POST','/api/tenders/finance/scenarios',{body,token:'token:u:boss@example.com'});assert.equal(r.status,200);assert.equal(r.json.rows.length,4);
 }finally{await close();}
});
