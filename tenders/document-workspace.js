import {randomUUID} from 'node:crypto';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const https=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}};
export function validateDocumentReview(document,rows){
 if(!rows||typeof rows!=='object'||Array.isArray(rows)||Object.keys(rows).length>200)fail('Некорректная таблица проверки');
 const out={};for(const [key,row] of Object.entries(rows)){
  if(!/^\d+$/.test(key)||!document.requirements[Number(key)]||!row||!['unknown','matches','partial','fails'].includes(row.status))fail('Неизвестное требование или статус');
  if(typeof row.value!=='string'||row.value.length>1000||typeof row.url!=='string'||row.url.length>2000)fail('Проверьте параметр и источник');
  if(row.url&&!https(row.url))fail('Источник должен быть публичной ссылкой https://');
  if(row.status==='matches'&&(!row.value.trim()||!https(row.url)))fail('Для соответствия нужны параметр и подтверждающий источник');
  out[key]={status:row.status,value:row.value,url:row.url};
 }
 return out;
}
export function checkedDocument(document){
 if(!document||typeof document.text!=='string'||!document.text.trim()||document.text.length>300000||!Array.isArray(document.requirements)||document.requirements.length>200||!/^[a-f0-9]{64}$/.test(document.sha256||''))fail('Некорректные данные документа');
 const lines=document.text.split('\n');
 for(const r of document.requirements)if(typeof r.text!=='string'||typeof r.type!=='string'||typeof r.evidence?.quote!=='string'||!r.evidence.quote||!Number.isInteger(r.evidence.line)||!lines[r.evidence.line-1]?.includes(r.evidence.quote))fail('Цитата требования отсутствует в документе');
 return document;
}
export function createDocumentWorkspace({store,now=Date.now}){
 const locks=new Map();
 const key=(user,id)=>'document:'+user+':'+id;
 async function locked(user,id,fn){
  const k=key(user,id),prior=locks.get(k)||Promise.resolve();let release;const pending=new Promise(r=>{release=r;});const chain=prior.then(()=>pending);locks.set(k,chain);await prior;
  try{return await fn();}finally{release();if(locks.get(k)===chain)locks.delete(k);}
 }
 async function lot(user,id){if(!user)fail('Нужен вход пользователя',401);const row=await store.getLot(id);if(!row)fail('Лот не найден',404);return row;}
 async function get(user,id){
  const row=await lot(user,id),value=await store.getSetting(key(user,id));
  return {...(value||{document:null,review:{},savedAt:null}),available:(row.extra?.documents||[]).filter(d=>typeof d.sha256==='string'&&typeof d.name==='string').slice(0,10).map(d=>({name:d.name,sha256:d.sha256,format:d.format||'pdf'}))};
 }
 async function saveNow(user,id,document,{expectedSha,expectedRevision}={}){
  const before=await get(user,id);if(expectedSha&&before.document?.sha256!==expectedSha)fail('Документ изменился. Обновите карточку.',409);
  if(expectedRevision&&before.revision!==expectedRevision)fail('Версия ТЗ изменилась. Обновите карточку.',409);
  checkedDocument(document);const same=before.document?.sha256===document.sha256&&JSON.stringify(before.document?.requirements)===JSON.stringify(document.requirements);
  const value={revision:randomUUID(),document,review:same?before.review:{},savedAt:new Date(now()).toISOString(),audit:[...(before.audit||[]).slice(-19),{at:new Date(now()).toISOString(),actor:user,action:'save_document',sha256:document.sha256}]};
  if(JSON.stringify(value).length>1000000)fail('Текст и требования слишком велики для сохранения');
  await store.setSetting(key(user,id),value);return {...value,available:before.available};
 }
 async function reviewNow(user,id,sha256,revision,rows){
  const before=await get(user,id);if(!before.document||before.document.sha256!==sha256||before.revision!==revision)fail('Документ изменился. Обновите карточку.',409);
  const value={...before,review:validateDocumentReview(before.document,rows),savedAt:new Date(now()).toISOString(),audit:[...(before.audit||[]).slice(-19),{at:new Date(now()).toISOString(),actor:user,action:'save_review',sha256}]};delete value.available;
  await store.setSetting(key(user,id),value);return {...value,available:before.available};
 }
 async function useImported(user,id,sha256){
  const row=await lot(user,id),document=(row.extra?.documents||[]).find(d=>d.sha256===sha256);
  if(!document)fail('ТЗ не найдено в карточке',404);
  return save(user,id,{...document,lineCount:document.text?.split('\n').length,origin:'imported_specification',ai:{status:'not_connected',message:'ТЗ из карточки. AI-анализ не выполнялся.'}});
 }
 const save=(user,id,...args)=>locked(user,id,()=>saveNow(user,id,...args));
 const review=(user,id,...args)=>locked(user,id,()=>reviewNow(user,id,...args));
 return {get,save,review,useImported};
}
