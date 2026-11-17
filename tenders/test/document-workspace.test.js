import test from 'node:test';
import assert from 'node:assert/strict';
import {makeApp,listen} from './helpers.js';
import {checkedDocument} from '../document-workspace.js';
const text='Количество: 16 шт.\nПамять не менее 16 GB\nГарантия 24 месяца';
const doc=(sha='a'.repeat(64))=>({sha256:sha,name:'fixture.txt',format:'txt',text,mode:'rules_draft',requirements:[{type:'quantity',text:'Количество: 16 шт.',evidence:{line:1,quote:'Количество: 16 шт.'},verified:false}],warnings:[]});
async function fixture(){const x=makeApp();await x.service.sync('portal-file',[{lot_number:'DOC-1',name_ru:'Document fixture'}]);const id=(await x.service.list('u1')).items[0].id;return {...x,id};}
test('document persistence is private, citation checked and independent of financial workspace saves',async()=>{
 const {service,id}=await fixture(),d=service.documentWorkspace;
 const saved=await d.save('u1',id,doc());assert.ok(saved.revision);assert.equal((await d.get('u2',id)).document,null);
 const reviewed=await d.review('u1',id,saved.document.sha256,saved.revision,{'0':{value:'16 units',url:'https://example.com/spec',status:'matches'}});assert.equal(reviewed.review[0].status,'matches');
 await service.saveWorkspace('u1',id,{offers:[]});assert.equal((await d.get('u1',id)).review[0].status,'matches');
 assert.throws(()=>checkedDocument({...doc(),requirements:[{...doc().requirements[0],evidence:{line:1,quote:'Not present'}}]}),{status:400});
 await assert.rejects(d.review('u1',id,saved.document.sha256,saved.revision,{'0':{value:'16',url:'',status:'matches'}}),{status:400});assert.equal((await d.get('u1',id)).review[0].url,'https://example.com/spec');
});
test('replacing the same file invalidates stale review and AI writes by revision',async()=>{
 const {service,id}=await fixture(),d=service.documentWorkspace;
 const old=await d.save('u1',id,doc());const next=await d.save('u1',id,{...doc(),mode:'ai_draft'});assert.notEqual(old.revision,next.revision);
 await assert.rejects(d.review('u1',id,old.document.sha256,old.revision,{}),{status:409});
 await assert.rejects(d.save('u1',id,doc(),{expectedSha:old.document.sha256,expectedRevision:old.revision}),{status:409});
 assert.equal((await d.get('u1',id)).document.mode,'ai_draft');
});
test('concurrent document writes cannot overwrite a newer revision with an old review',async()=>{
 const {service,id}=await fixture(),d=service.documentWorkspace;const first=await d.save('u1',id,doc());
 const next=d.save('u1',id,doc('b'.repeat(64)));const stale=d.review('u1',id,first.document.sha256,first.revision,{});await next;await assert.rejects(stale,{status:409});assert.equal((await d.get('u1',id)).document.sha256,'b'.repeat(64));
});
test('transfer retains exact citation and prior rating; duplicates and stale document reject without writes',async()=>{
 const {service,id}=await fixture();await service.saveWorkspace('u1',id,{extendedRating:{criteria:{}}});const saved=await service.documentWorkspace.save('u1',id,doc());
 const payload={sha256:saved.document.sha256,revision:saved.revision,rows:[{index:0,key:'quantity',op:'min',value:'16',unit:'шт.'}]};
 await assert.rejects(service.transferDocumentRequirements('u1',id,{...payload,rows:[null]}),{status:400});
 const w=await service.transferDocumentRequirements('u1',id,payload);assert.ok(w.extendedRating);const r=w.supplierAnalysis.inputs.requirements[0];assert.equal(r.evidence.quote,'Количество: 16 шт.');assert.equal(r.evidence.documentSha256,saved.document.sha256);
 await assert.rejects(service.transferDocumentRequirements('u1',id,payload),{status:409});assert.equal((await service.getWorkspace('u1',id)).supplierAnalysis.inputs.requirements.length,1);
 await service.documentWorkspace.save('u1',id,doc('c'.repeat(64)));await assert.rejects(service.transferDocumentRequirements('u1',id,{...payload,rows:[{index:0,key:'other',op:'eq',value:'16',unit:''}]}),{status:409});
});
test('imported document is explicitly selected, not copied on GET',async()=>{
 const {service,store,id}=await fixture();await store.upsertLots([{...await store.getLot(id),extra:{documents:[doc()]}}]);
 const before=await service.documentWorkspace.get('u1',id);assert.equal(before.available.length,1);assert.equal(before.document,null);
 const copied=await service.documentWorkspace.useImported('u1',id,doc().sha256);assert.equal(copied.document.origin,'imported_specification');assert.equal(copied.document.ai.status,'not_connected');
});
test('HTTP extraction stays backward-compatible and saves server result; consent and sign-in are enforced',async()=>{
 const {app,id}=await fixture(),http=await listen(app),token='token:u1:boss@example.com';try{
 assert.equal((await http.call('GET',`/api/tenders/${id}/documents`)).status,401);
 const result=await http.call('POST',`/api/tenders/${id}/documents/extract`,{token,body:{name:'fixture.txt',base64:Buffer.from(text).toString('base64')}});assert.equal(result.status,200);assert.equal(result.json.text,text);assert.equal(result.json.document.text,text);
 const get=await http.call('GET',`/api/tenders/${id}/documents`,{token});assert.equal(get.json.revision,result.json.revision);
 assert.equal((await http.call('POST',`/api/tenders/${id}/documents/analyze`,{token,body:{sha256:get.json.document.sha256,revision:get.json.revision}})).status,400);
 assert.equal((await http.call('GET',`/api/tenders/${id}/documents`,{secret:'S3CRET'})).status,401);
 }finally{await http.close();}
});

test('consented AI route uses saved server text and persists only the current revision',async()=>{
 let seen;const ai={status:()=>({status:'ready'}),analyze:async document=>{seen=document;return {...document,mode:'ai_draft'};}};
 const {app,service}=makeApp({ai});await service.sync('portal-file',[{lot_number:'AI-1',name_ru:'AI route fixture'}]);const id=(await service.list('u1')).items[0].id;
 const saved=await service.documentWorkspace.save('u1',id,doc());const http=await listen(app);try{
 const r=await http.call('POST',`/api/tenders/${id}/documents/analyze`,{token:'token:u1:boss@example.com',body:{consent:true,sha256:saved.document.sha256,revision:saved.revision,text:'forged browser text'}});
 assert.equal(r.status,200);assert.equal(seen.text,text);assert.equal(r.json.document.mode,'ai_draft');assert.notEqual(r.json.revision,saved.revision);
 const stale=await http.call('POST',`/api/tenders/${id}/documents/analyze`,{token:'token:u1:boss@example.com',body:{consent:true,sha256:saved.document.sha256,revision:saved.revision}});assert.equal(stale.status,409);
 }finally{await http.close();}
});

test('parameter transfer accepts a saved comparison that omitted optional requirements',async()=>{
 const {service,id}=await fixture();await service.saveWorkspace('u1',id,{supplierAnalysis:{model:'',offers:[]}});const d=await service.documentWorkspace.save('u1',id,doc());
 const result=await service.transferDocumentRequirements('u1',id,{sha256:d.document.sha256,revision:d.revision,rows:[{index:0,key:'Quantity',op:'min',value:'16',unit:'шт.'}]});assert.equal(result.supplierAnalysis.inputs.requirements.length,1);
});
