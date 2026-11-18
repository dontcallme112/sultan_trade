import {normalizeWebhook,validateDraft,authorizeDelivery} from './domain.js';
export function createWhatsAppWorker({store,sender,phoneId,wabaId,now=Date.now}){
 let running=false,lastError=null;
 return {status:()=>({running,lastError}),async tick(){
  if(running)return;running=true;lastError=null;
  try{
   for(let i=0;i<10;i++){
    const item=await store.claimInbox();if(!item)break;
    try{await store.applyInbox(item,normalizeWebhook(item.payload,{phoneId,wabaId,now:now()}));}catch{await store.failInbox(item);lastError='Не все события обработаны. Проверьте очередь.';}
   }
   if(sender.enabled){
    const item=await store.claimOutbox();if(item){
     let outcome='failed',messageId=null;
     try{
      if(!item.approved_by||!item.approved_at||!Number.isFinite(Date.parse(item.approved_at))||now()-Date.parse(item.approved_at)>15*60000||Date.parse(item.approved_at)>now()+300000)throw Error('approval expired');
      const draft=validateDraft(item.payload),contact=await store.contact(item.contact_id),template=draft.kind==='template'?await store.template(draft.name,draft.language):null;
      authorizeDelivery(draft,contact,template,{now:now()});
      const sent=await sender.send(draft,item.id);outcome='sent';messageId=sent.providerMessageId;
     }catch(e){outcome=e.uncertain?'uncertain':'failed';lastError='Отправка не подтверждена. Нужна ручная проверка.';}
     await store.finishOutbox(item,outcome,messageId);
    }
   }
  }catch{lastError='Очередь WhatsApp недоступна. Данные не подтверждены как обработанные.';}
  finally{running=false;}
 }};
}
