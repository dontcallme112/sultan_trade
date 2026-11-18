import test from 'node:test';
import assert from 'node:assert/strict';
import {parseODataMetadata,createOneCOData} from '../onec/odata.js';
import {makeApp,listen} from './helpers.js';
const xml=`<?xml version="1.0" encoding="utf-8"?><edmx:Edmx xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx" Version="1.0"><edmx:DataServices><Schema xmlns="http://schemas.microsoft.com/ado/2009/11/edm" Namespace="Fixture"><EntityContainer Name="FixtureContainer"><EntitySet Name="Catalog_Fixture" EntityType="Fixture.Catalog_Fixture"/></EntityContainer></Schema></edmx:DataServices></edmx:Edmx>`;
const env=()=>({ONEC_READONLY_ENABLED:'true',ONEC_ENVIRONMENT:'test',ONEC_ODATA_URL:'https://onec.example.com/test/odata/standard.odata/',ONEC_ALLOWED_HOST:'onec.example.com',ONEC_USERNAME:'fixture-user',ONEC_PASSWORD:'fixture-secret'});
test('metadata parsing requires namespace-aware EDMX, refuses DTD/entities, malformed/HTML/oversized/deep XML',()=>{
 assert.deepEqual(parseODataMetadata(xml).entitySets,[{name:'Catalog_Fixture',type:'Fixture.Catalog_Fixture'}]);
 for(const value of ['<html>Sign in</html>','<Edmx/>','<!DOCTYPE x [<!ENTITY x SYSTEM "file:///etc/passwd">]>'+xml,xml.slice(0,-5),'x'.repeat(1024*1024+1)])assert.throws(()=>parseODataMetadata(value));
 assert.throws(()=>parseODataMetadata(xml.replace('<EntitySet Name=', '<EntitySet Name="Duplicate" EntityType="Fixture.X"/><EntitySet Name="Duplicate" EntityType="Fixture.Y"/><EntitySet Name=')));
});
test('probe sends only GET metadata to configured host, never follows redirects or exposes credentials; limits repeat calls',async()=>{
 const calls=[];let clock=0;const connector=createOneCOData({env:env(),now:()=>clock,fetchImpl:async(url,options)=>{calls.push({url,options});return new Response(xml,{headers:{'content-type':'application/xml'}});}});
 assert.equal(connector.status().state,'ready_to_check');await assert.rejects(connector.probe(null),{status:401});
 const result=await connector.probe('u1');assert.equal(result.entitySetCount,1);assert.equal(result.postingEnabled,false);assert.equal(calls[0].url,'https://onec.example.com/test/odata/standard.odata/$metadata');assert.equal(calls[0].options.method,'GET');assert.equal(calls[0].options.redirect,'error');assert.match(calls[0].options.headers.Authorization,/^Basic /);
 assert.equal(connector.status().state,'metadata_readable');assert.ok(!JSON.stringify(connector.status()).includes('fixture-secret'));await assert.rejects(connector.probe('u1'),{status:429});clock=60001;await connector.probe('u1');assert.equal(calls.length,2);
});
test('disabled, production, HTTP, wrong host, embedded password and query configuration never call network',async()=>{
 for(const patch of [{ONEC_READONLY_ENABLED:'false'},{ONEC_ENVIRONMENT:'production'},{ONEC_ODATA_URL:'http://onec.example.com/test/odata/standard.odata/'},{ONEC_ALLOWED_HOST:'other.example.com'},{ONEC_ODATA_URL:'https://user:pass@onec.example.com/test/odata/standard.odata/'},{ONEC_ODATA_URL:'https://onec.example.com/test/odata/standard.odata/?target=evil'}]){
  const connector=createOneCOData({env:{...env(),...patch},fetchImpl:async()=>{throw Error('must not run');}});await assert.rejects(connector.probe('u1'),{status:409});
 }
});
test('upstream auth, HTML, XML entities and oversized streams fail safely without leaking body or credentials',async()=>{
 for(const response of [()=>new Response('fixture-secret',{status:401}),()=>new Response('<html>fixture-secret</html>'),()=>new Response('<!DOCTYPE html>'+xml),()=>new Response('x'.repeat(1024*1024+1))]){
  const connector=createOneCOData({env:env(),fetchImpl:async()=>response()});await assert.rejects(connector.probe('u1'),e=>e.status===502&&!e.message.includes('fixture-secret'));assert.equal(connector.status().lastCheck.ok,false);
 }
});
test('probe route requires company employee login and ignores client-supplied targets',async t=>{
 let calls=0;const connector=createOneCOData({env:env(),fetchImpl:async()=>{calls++;return new Response(xml);}}),m=makeApp({onec:connector}),s=await listen(m.app);t.after(s.close);
 const path='/api/tenders/onec/probe';assert.equal((await s.call('POST',path)).status,401);assert.equal((await s.call('POST',path,{secret:'S3CRET'})).status,401);assert.equal((await s.call('POST',path,{token:'token:u2:shopper@example.com'})).status,403);
 const result=await s.call('POST',path,{token:'token:u1:boss@example.com',body:{url:'http://127.0.0.1/admin'}});assert.equal(result.status,200);assert.equal(calls,1);assert.equal(result.json.entitySetCount,1);
});
test('offline metadata preview works without credentials and never marks network connection successful',async t=>{
 const connector=createOneCOData({env:{},fetchImpl:async()=>{throw Error('must not call');}}),m=makeApp({onec:connector}),s=await listen(m.app);t.after(s.close);const path='/api/tenders/onec/metadata/preview',token='token:u1:boss@example.com';
 assert.equal((await s.call('POST',path,{body:{xml}})).status,401);
 const result=await s.call('POST',path,{token,body:{xml}});assert.equal(result.status,200);assert.equal(result.json.origin,'file');assert.equal(result.json.postingEnabled,false);assert.equal(connector.status().state,'not_configured');
 assert.equal((await s.call('POST',path,{token,body:{xml:'<!DOCTYPE x>'+xml}})).status,400);
 const large=xml.replace('<edmx:DataServices>','<edmx:DataServices><!--'+'x'.repeat(220000)+'-->');assert.equal((await s.call('POST',path,{token,body:{xml:large}})).status,200);
});
