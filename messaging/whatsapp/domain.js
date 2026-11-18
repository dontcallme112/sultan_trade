import {createHmac,timingSafeEqual} from 'node:crypto';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
export const WA_PATH='/api/integrations/whatsapp/webhook';
export function sameSecret(a,b){if(typeof a!=='string'||typeof b!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
export function verifySignature(raw,signature,secret){return Buffer.isBuffer(raw)&&typeof secret==='string'&&secret.length>0&&sameSecret(signature,'sha256='+createHmac('sha256',secret).update(raw).digest('hex'));}
const phone=v=>typeof v==='string'&&/^[1-9][0-9]{7,14}$/.test(v);
export function normalizeWebhook(body,{phoneId,wabaId,now=Date.now()}={}){
 if(body?.object!=='whatsapp_business_account'||!Array.isArray(body.entry))fail('Некорректное событие WhatsApp');
 const contacts=[],messages=[],statuses=[];
 for(const entry of body.entry){
  if(entry.id!==wabaId)fail('Событие относится к другому бизнес-аккаунту',403);
  for(const change of entry.changes||[]){const v=change.value;if(change.field!=='messages')continue;
   if(v?.metadata?.phone_number_id!==phoneId)fail('Событие относится к другому номеру',403);
   for(const m of v.messages||[]){
    const seconds=Number(m.timestamp);if(!phone(m.from)||typeof m.id!=='string'||!m.id||m.id.length>300||/[\u0000-\u001f]/.test(m.id)||!Number.isFinite(seconds)||seconds<0||seconds*1000>now+300000)fail('Некорректные данные сообщения');
    const timestamp=new Date(seconds*1000).toISOString(),text=m.type==='text'?String(m.text?.body||''):null;
    contacts.push({wa_id:m.from,display_name:(v.contacts||[]).find(c=>c.wa_id===m.from)?.profile?.name||null,last_inbound_at:timestamp,opt_out:text!=null&&/^(стоп|stop|отписаться)$/i.test(text.trim())});
    messages.push({wa_id:m.from,provider_message_id:m.id,kind:m.type||'unknown',text_body:text,provider_payload:m,provider_timestamp:timestamp});
   }
   for(const s of v.statuses||[]){if(!['sent','delivered','read','failed'].includes(s.status)||typeof s.id!=='string'||!s.id||s.id.length>300)continue;
    statuses.push({provider_message_id:s.id,status:s.status,outbox_id:/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s.biz_opaque_callback_data||'')?s.biz_opaque_callback_data:null});
   }
  }
 }
 return {contacts,messages,statuses};
}
export function validateDraft(input){
 if(!input||!phone(input.to))fail('Нужен номер WhatsApp в международном формате без знака +');
 if(input.kind==='text'){
  if(typeof input.text!=='string'||!input.text.trim()||input.text.length>4096)fail('Сообщение: от 1 до 4096 символов');
  return {to:input.to,kind:'text',text:input.text};
 }
 if(input.kind==='template'){
  if(!/^[a-z0-9_]{1,512}$/.test(input.name||'')||!/^[a-z]{2}(?:_[A-Z]{2})?$/.test(input.language||'')||!Array.isArray(input.parameters)||input.parameters.length>20||input.parameters.some(v=>typeof v!=='string'||v.length>2000))fail('Некорректные параметры шаблона');
  return {to:input.to,kind:'template',name:input.name,language:input.language,parameters:input.parameters};
 }
 fail('Поддерживаются текст и утверждённые шаблоны');
}
export function authorizeDelivery(draft,contact,template,{now=Date.now()}={}){
 if(!contact||contact.wa_id!==draft.to||contact.consent_status==='revoked')fail('Получатель не согласован или отказался от сообщений',409);
 if(draft.kind==='text'){
  const at=Date.parse(contact.last_inbound_at);if(!Number.isFinite(at)||at>now+300000||now-at>=24*3600000)fail('Вне 24-часового окна требуется утверждённый шаблон и согласие',409);
 }else if(contact.consent_status!=='granted'||!contact.consent_at||!contact.consent_source||template?.status!=='approved'||template.name!==draft.name||template.language!==draft.language)fail('Для бизнес-сообщения нужны согласие и утверждённый шаблон',409);
 return true;
}
export function assertApprovalTransition(state){if(state!=='draft')fail('Повторная отправка или утверждение этой записи запрещены',409);return 'approved';}
