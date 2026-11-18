import test from 'node:test';
import assert from 'node:assert/strict';
import {createTenderScheduler} from '../scheduler.js';
import {createTenderService} from '../service.js';
import {createMemoryStore} from '../store.js';
const settle=()=>new Promise(r=>setImmediate(r));
test('scheduler runs only connected APIs, waits for sources, retries errors and cancels timers',async()=>{
 let ready=false,calls=[],pending=[],cleared=[];
 const service={sources:async()=>[{id:'demo',kind:'demo',state:'ready'},{id:'file',kind:'file',state:'ready'},{id:'official',kind:'api',state:ready?'ready':'needs_connection'}],sync:async id=>{calls.push(id);throw Error('secret upstream detail');}};
 const scheduler=createTenderScheduler({service,now:()=>0,setTimer:(fn,ms)=>{pending.push({fn,ms});return pending.length;},clearTimer:id=>cleared.push(id)});
 scheduler.start();scheduler.start();await settle();assert.equal(scheduler.status().state,'waiting_for_source');assert.equal(calls.length,0);assert.equal(pending.length,1);
 ready=true;pending[0].fn();await settle();assert.deepEqual(calls,['official']);assert.equal(pending.length,2);assert.ok(scheduler.status().lastError);assert.ok(!JSON.stringify(scheduler.status()).includes('secret'));scheduler.stop();assert.equal(scheduler.status().state,'stopped');assert.equal(cleared.length,1);
});
test('invalid/disabled intervals never call sources',async()=>{
 for(const intervalMinutes of [0,-1,1,Infinity,'bad',1441]){const s=createTenderScheduler({service:{sources:()=>{throw Error('must not run');}},intervalMinutes});s.start();await settle();assert.equal(s.status().state,'disabled');s.stop();}
});
test('manual/automatic sync overlap is rejected without duplicate writes or log entries',async()=>{
 let release;const wait=new Promise(r=>release=r),store=createMemoryStore(),service=createTenderService({store,adapters:new Map([['official',{fetch:async()=>{await wait;return [];}}]])});
 const first=service.sync('official');await assert.rejects(service.sync('official'),{status:409});release();await first;assert.equal((await store.listLog()).length,1);await service.sync('official');assert.equal((await store.listLog()).length,2);
});
