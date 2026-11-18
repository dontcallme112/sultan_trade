import {validateDraft} from './domain.js';
export function createCloudSender({env=process.env,fetchImpl=fetch}={}){
 const enabled=env.WHATSAPP_MODE==='enabled'&&env.WHATSAPP_SEND_ENABLED==='true'&&/^v[0-9]+\.[0-9]+$/.test(env.WHATSAPP_GRAPH_VERSION||'')&&/^[0-9]+$/.test(env.WHATSAPP_PHONE_NUMBER_ID||'')&&Boolean(env.WHATSAPP_ACCESS_TOKEN);
 return {enabled,async send(input,outboxId){
  if(!enabled)throw Object.assign(new Error('Отправка WhatsApp выключена'),{status:409,uncertain:false});
  const d=validateDraft(input);if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(outboxId))throw Object.assign(new Error('Нет идентификатора очереди'),{uncertain:false});
  const payload={messaging_product:'whatsapp',recipient_type:'individual',to:d.to,type:d.kind,biz_opaque_callback_data:outboxId};
  if(d.kind==='text')payload.text={body:d.text,preview_url:false};else payload.template={name:d.name,language:{code:d.language},...(d.parameters.length?{components:[{type:'body',parameters:d.parameters.map(text=>({type:'text',text}))}]}:{})};
  let response;
  try{response=await fetchImpl('https://graph.facebook.com/'+env.WHATSAPP_GRAPH_VERSION+'/'+env.WHATSAPP_PHONE_NUMBER_ID+'/messages',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+env.WHATSAPP_ACCESS_TOKEN,'Content-Type':'application/json'},body:JSON.stringify(payload)});}catch{throw Object.assign(new Error('Результат отправки неизвестен. Автоповтор запрещён.'),{uncertain:true});}
  if(!response.ok){await response.body?.cancel();throw Object.assign(new Error('WhatsApp отклонил запрос или не подтвердил доставку'),{uncertain:response.status>=500});}
  try{const data=await response.json(),id=data.messages?.[0]?.id;if(typeof id!=='string'||!id||id.length>300||/[\u0000-\u001f]/.test(id))throw Error();return {providerMessageId:id};}catch{throw Object.assign(new Error('Нет подтверждённого идентификатора сообщения. Автоповтор запрещён.'),{uncertain:true});}
 }};
}
