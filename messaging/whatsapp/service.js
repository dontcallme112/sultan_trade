import {createHash,randomUUID} from 'node:crypto';
import {sameSecret,verifySignature,normalizeWebhook,validateDraft,authorizeDelivery,assertApprovalTransition,WA_PATH} from './domain.js';
import {createCloudSender} from './provider.js';
import {createWhatsAppWorker} from './worker.js';
const fail=(message,status=409)=>{throw Object.assign(new Error(message),{status});};
export const whatsappPreparation=()=>({mode:'prepared',connected:false,sendingEnabled:false,storage:'migration_prepared',message:'Архитектура WhatsApp подготовлена. Подключение и отправка отложены.',components:['Официальный WhatsApp Cloud API','Проверка подписи вебхука и защита от повторов','Контакты, сообщения, шаблоны и журнал аудита','Очередь черновиков с отдельным утверждением','24-часовое окно и согласие на бизнес-сообщения','Неизвестный результат отправки — ручная сверка, без автоповтора'],webhookPath:WA_PATH});
export function createWhatsAppService({env=process.env,store,fetchImpl=fetch,now=Date.now}={}){
 const enabled=env.WHATSAPP_MODE==='enabled',inboundReady=enabled&&Boolean(env.WHATSAPP_VERIFY_TOKEN&&env.WHATSAPP_APP_SECRET&&/^[0-9]+$/.test(env.WHATSAPP_PHONE_NUMBER_ID||'')&&/^[0-9]+$/.test(env.WHATSAPP_WABA_ID||''));
 const sender=createCloudSender({env,fetchImpl}),worker=createWhatsAppWorker({store,sender,phoneId:env.WHATSAPP_PHONE_NUMBER_ID,wabaId:env.WHATSAPP_WABA_ID,now});let timer=null,lastVerifiedWebhookAt=null;
 const requireReady=()=>{if(!inboundReady||!store)fail('Подключение WhatsApp отложено. Сообщения не отправляются.');};
 const identity=user=>{if(!user)fail('Нужен вход сотрудника',401);};
 return {
  async status(){if(!enabled)return whatsappPreparation();const storage=store&&await store.health();return {...whatsappPreparation(),mode:inboundReady&&storage?'configured':'not_ready',connected:Boolean(lastVerifiedWebhookAt),lastVerifiedWebhookAt,storage:storage?'available':'not_ready',sendingEnabled:Boolean(inboundReady&&storage&&sender.enabled),message:inboundReady&&storage?'Сервер настроен; подписку Meta и реальный обмен необходимо проверить отдельно.':'Не завершены настройки Meta или хранилища.',worker:worker.status()};},
  verify(query){requireReady();if(query['hub.mode']!=='subscribe'||!sameSecret(query['hub.verify_token'],env.WHATSAPP_VERIFY_TOKEN)||typeof query['hub.challenge']!=='string'||query['hub.challenge'].length>200)fail('Не подтверждён вебхук',403);return query['hub.challenge'];},
  async receive(raw,signature){requireReady();if(!verifySignature(raw,signature,env.WHATSAPP_APP_SECRET))fail('Неверная подпись вебхука',401);let payload;try{payload=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch{fail('Некорректный JSON',400);}normalizeWebhook(payload,{phoneId:env.WHATSAPP_PHONE_NUMBER_ID,wabaId:env.WHATSAPP_WABA_ID,now:now()});await store.enqueue(createHash('sha256').update(raw).digest('hex'),payload);lastVerifiedWebhookAt=new Date(now()).toISOString();return {accepted:true};},
  preview(input,user){identity(user);return {draft:validateDraft(input),queued:false,sent:false,notice:'Только проверка черновика. Отправка и сохранение не выполнялись.'};},
  async draft(input,user,key=randomUUID()){identity(user);requireReady();if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key))fail('Некорректный ключ повторного запроса',400);const draft=validateDraft(input),contact=await store.contactByPhone(draft.to);if(!contact)fail('Сначала нужен контакт и проверка основания для общения');return store.createDraft(key,contact.id,draft,user);},
  async approve(id,user){identity(user);requireReady();const item=await store.outbox(id);if(!item)fail('Черновик не найден',404);assertApprovalTransition(item.state);const draft=validateDraft(item.payload),contact=await store.contact(item.contact_id),template=draft.kind==='template'?await store.template(draft.name,draft.language):null;authorizeDelivery(draft,contact,template,{now:now()});return store.approveDraft(id,user);},
  start(){if(!inboundReady||!store||timer)return;timer=setInterval(()=>{void worker.tick();},5000);timer.unref?.();},
  stop(){if(timer)clearInterval(timer);timer=null;},worker
 };
}
