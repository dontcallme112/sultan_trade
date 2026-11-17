import test from 'node:test';
import assert from 'node:assert/strict';
import {createDocumentAI} from '../ai.js';
const document={text:'Количество: 20 штук\nГарантия: 12 месяцев',sha256:'fixture'};
const env={OPENAI_API_KEY:'test-only',OPENAI_MODEL:'test-model'};
const row={type:'quantity',text:'20 штук',evidenceLine:1,quote:'Количество: 20 штук'};
const response=rows=>({ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({requirements:rows})}]}]})});
test('no credentials: no provider call',async()=>{
 const ai=createDocumentAI({env:{},fetchImpl:()=>assert.fail('network')});
 assert.equal(ai.status().status,'not_connected');await assert.rejects(ai.analyze(document,'u'),{code:'NOT_CONNECTED'});
});
test('fixed endpoint, structured schema, storage disabled, verified citation stays draft',async()=>{
 const ai=createDocumentAI({env,fetchImpl:async(url,options)=>{
 assert.equal(url,'https://api.openai.com/v1/responses');const body=JSON.parse(options.body);
 assert.equal(body.store,false);assert.equal(body.text.format.strict,true);assert.equal(body.model,'test-model');return response([row]);}});
 const result=await ai.analyze(document,'u');assert.equal(result.requirements[0].evidence_verified,true);assert.equal(result.requirements[0].verified,false);assert.equal(result.sha256,'fixture');
});
test('reject hallucinated quote, bad line, unexpected type and incomplete answer',async()=>{
 for(const invalid of [{...row,quote:'Не существует'},{...row,evidenceLine:9},{...row,type:'execute'}]){
 const ai=createDocumentAI({env,fetchImpl:async()=>response([invalid])});await assert.rejects(ai.analyze(document,'u'),{code:'AI_FAILED'});}
 const ai=createDocumentAI({env,fetchImpl:async()=>({ok:true,json:async()=>({status:'incomplete'})})});await assert.rejects(ai.analyze(document,'u'),{code:'AI_FAILED'});
});
test('quota counts failed attempts and resets after hour; limits input before network',async()=>{
 let time=0,calls=0;const ai=createDocumentAI({env,now:()=>time,fetchImpl:async()=>{calls++;return {ok:false};}});
 await assert.rejects(ai.analyze({text:'x'.repeat(60001)},'u'),{code:'AI_INPUT_LIMIT'});assert.equal(calls,0);
 for(let i=0;i<5;i++)await assert.rejects(ai.analyze(document,'u'));
 await assert.rejects(ai.analyze(document,'u'),{code:'AI_RATE_LIMIT'});assert.equal(calls,5);
 time=3600001;await assert.rejects(ai.analyze(document,'u'),{code:'AI_FAILED'});assert.equal(calls,6);
});
test('concurrent requests for the same user are blocked',async()=>{
 let release;const ai=createDocumentAI({env,fetchImpl:()=>new Promise(r=>{release=r;})});
 const first=ai.analyze(document,'u');await assert.rejects(ai.analyze(document,'u'),{code:'AI_BUSY'});release(response([row]));await first;
});
