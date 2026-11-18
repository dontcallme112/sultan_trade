import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import express from 'express';
import {normalizeWebhook,validateDraft,authorizeDelivery,assertApprovalTransition,WA_PATH} from '../../messaging/whatsapp/domain.js';
import {createWhatsAppService} from '../../messaging/whatsapp/service.js';
import {createWhatsAppWebhookRouter} from '../../messaging/whatsapp/router.js';
import {createCloudSender} from '../../messaging/whatsapp/provider.js';
import {createWhatsAppWorker} from '../../messaging/whatsapp/worker.js';
import {makeApp,listen} from './helpers.js';
const now=Date.parse('2026-11-18T12:00:00Z');
const env=()=>({WHATSAPP_MODE:'enabled',WHATSAPP_VERIFY_TOKEN:'fixture-verify',WHATSAPP_APP_SECRET:'fixture-secret',WHATSAPP_PHONE_NUMBER_ID:'123',WHATSAPP_WABA_ID:'456'});
const event=()=>({object:'whatsapp_business_account',entry:[{id:'456',changes:[{field:'messages',value:{metadata:{phone_number_id:'123'},contacts:[{wa_id:'15555550100',profile:{name:'Fixture'}}],messages:[{id:'wamid.fixture.1',from:'15555550100',timestamp:String(Math.floor(now/1000)),type:'text',text:{body:'Hello fixture'}}]}}]}]});
const id='00000000-0000-4000-8000-000000000001';
test('WhatsApp default preparation neither uses storage nor starts network/send paths',async()=>{
 let calls=0;const service=createWhatsAppService({env:{},store:{health:async()=>{calls++;}},fetchImpl:async()=>{calls++;}});service.start();service.stop();assert.equal((await service.status()).mode,'prepared');assert.equal((await service.status()).sendingEnabled,false);assert.equal(calls,0);assert.equal(service.preview({to:'15555550100',kind:'text',text:'Fixture'},id).sent,false);await assert.rejects(service.draft({to:'15555550100',kind:'text',text:'Fixture'},id),{status:409});
});
test('webhook verifies raw HMAC, account/phone, challenge and durable acceptance; storage failures never ACK',async t=>{
 const saved=new Map();let unavailable=false;
 const service=createWhatsAppService({env:env(),now:()=>now,store:{enqueue:async(key,payload)=>{if(unavailable)throw Error('secret storage detail');saved.set(key,payload);}}});const app=express();app.use(createWhatsAppWebhookRouter(service));app.use(express.json());const s=await listen(app);t.after(s.close);
 const verification=await fetch(s.base+WA_PATH+'?hub.mode=subscribe&hub.verify_token=fixture-verify&hub.challenge=123');assert.equal(verification.status,200);assert.equal(await verification.text(),'123');assert.equal((await fetch(s.base+WA_PATH+'?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123')).status,403);
 const post=async(body,sign=true)=>{const raw=JSON.stringify(body);return fetch(s.base+WA_PATH,{method:'POST',headers:{'Content-Type':'application/json','X-Hub-Signature-256':sign?'sha256='+createHmac('sha256','fixture-secret').update(raw).digest('hex'):'sha256=wrong'},body:raw});};
 assert.equal((await post(event(),false)).status,401);assert.equal(saved.size,0);assert.equal((await post(event())).status,200);assert.equal((await post(event())).status,200);assert.equal(saved.size,1);
 const wrong=event();wrong.entry[0].changes[0].value.metadata.phone_number_id='999';assert.equal((await post(wrong)).status,403);assert.equal(saved.size,1);
 unavailable=true;assert.equal((await post(event())).status,503);
});
test('inbound text never grants consent; opt-out is explicit; outbound rules enforce session/template and approval',()=>{
 const input=event();input.entry[0].changes[0].value.messages[0].text.body='СТОП';const n=normalizeWebhook(input,{phoneId:'123',wabaId:'456',now});assert.equal(n.contacts[0].opt_out,true);assert.equal(n.contacts[0].consent_status,undefined);
 const draft=validateDraft({to:'15555550100',kind:'text',text:'Fixture'}),contact={wa_id:draft.to,consent_status:'unknown',last_inbound_at:new Date(now-1000).toISOString()};assert.equal(authorizeDelivery(draft,contact,null,{now}),true);
 assert.throws(()=>authorizeDelivery(draft,{...contact,last_inbound_at:new Date(now-24*3600000).toISOString()},null,{now}));assert.throws(()=>authorizeDelivery(draft,{...contact,consent_status:'revoked'},null,{now}));
 const template=validateDraft({to:draft.to,kind:'template',name:'fixture',language:'en_US',parameters:['Fixture']});assert.throws(()=>authorizeDelivery(template,contact,{status:'approved',name:'fixture',language:'en_US'},{now}));assert.equal(authorizeDelivery(template,{...contact,consent_status:'granted',consent_at:new Date(now).toISOString(),consent_source:'Fixture customer request'},{status:'approved',name:'fixture',language:'en_US'},{now}),true);
 assert.equal(assertApprovalTransition('draft'),'approved');for(const state of ['approved','sent','uncertain'])assert.throws(()=>assertApprovalTransition(state));
});
test('Cloud API sender requires explicit connection/send flags; ambiguous network results cannot be retried blindly',async()=>{
 let calls=0;const disabled=createCloudSender({env:{},fetchImpl:async()=>{calls++;}});await assert.rejects(disabled.send({to:'15555550100',kind:'text',text:'Fixture'},id));assert.equal(calls,0);
 const configured={...env(),WHATSAPP_SEND_ENABLED:'true',WHATSAPP_GRAPH_VERSION:'v99.0',WHATSAPP_ACCESS_TOKEN:'fixture-access-token'};
 const sender=createCloudSender({env:configured,fetchImpl:async(url,options)=>{calls++;assert.equal(url,'https://graph.facebook.com/v99.0/123/messages');assert.equal(options.redirect,'error');assert.equal(JSON.parse(options.body).biz_opaque_callback_data,id);return new Response(JSON.stringify({messages:[{id:'wamid.out'}]}));}});assert.equal((await sender.send({to:'15555550100',kind:'text',text:'Fixture'},id)).providerMessageId,'wamid.out');
 const timeout=createCloudSender({env:configured,fetchImpl:async()=>{throw Error('secret upstream detail');}});await assert.rejects(timeout.send({to:'15555550100',kind:'text',text:'Fixture'},id),e=>e.uncertain===true&&!e.message.includes('secret'));
});
test('worker rechecks approvals and policy; uncertain sends require manual reconciliation',async()=>{
 let sent=0,outcome=null;const item={id,lock_token:id,approved_at:new Date(now).toISOString(),approved_by:id,contact_id:id,payload:{to:'15555550100',kind:'text',text:'Fixture'}};
 const store={claimInbox:async()=>null,claimOutbox:async()=>item,contact:async()=>({wa_id:'15555550100',last_inbound_at:new Date(now).toISOString(),consent_status:'unknown'}),finishOutbox:async(_item,state)=>{outcome=state;}};
 const worker=createWhatsAppWorker({store,now:()=>now,sender:{enabled:true,send:async()=>{sent++;throw Object.assign(Error('network'),{uncertain:true});}}});await worker.tick();assert.equal(sent,1);assert.equal(outcome,'uncertain');
 item.approved_at='bad';await worker.tick();assert.equal(sent,1);assert.equal(outcome,'failed');
});
test('WhatsApp staff status and preview are protected, prepare only, and do not send notifications',async t=>{
 const m=makeApp(),s=await listen(m.app);t.after(s.close);assert.equal((await s.call('GET','/api/tenders/whatsapp/status')).status,401);const token='token:u1:boss@example.com';assert.equal((await s.call('GET','/api/tenders/whatsapp/status',{token})).json.mode,'prepared');
 const preview=await s.call('POST','/api/tenders/whatsapp/drafts/preview',{token,body:{to:'15555550100',kind:'text',text:'Fixture'}});assert.equal(preview.status,200);assert.equal(preview.json.sent,false);assert.equal(preview.json.queued,false);
});
