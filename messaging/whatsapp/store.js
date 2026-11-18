const storageError=()=>Object.assign(new Error('Хранилище WhatsApp недоступно. Подключение пока не завершено.'),{status:503});
export function createWhatsAppStore(db){
 const call=async fn=>{if(!db)throw storageError();const {data,error}=await fn();if(error){if(error.code==='P0001'&&['Idempotency key conflict','Only a draft can be approved','Inbox lease expired'].includes(error.message))throw Object.assign(new Error('Состояние очереди изменилось или ключ повторного запроса уже использован.'),{status:409});throw storageError();}return data;};
 return {
  async health(){try{await call(()=>db.from('wa_inbox').select('id').limit(1));return true;}catch{return false;}},
  async enqueue(eventKey,payload){return call(()=>db.from('wa_inbox').upsert({event_key:eventKey,payload},{onConflict:'event_key',ignoreDuplicates:true}).select('id'));},
  async claimInbox(){const rows=await call(()=>db.rpc('wa_claim_inbox'));return rows?.[0]||null;},
  async applyInbox(item,data){await call(()=>db.rpc('wa_apply_inbox',{p_id:item.id,p_token:item.lock_token,p_data:data}));},
  async failInbox(item){await call(()=>db.from('wa_inbox').update({state:'failed',last_error:'Event processing failed; manual review may be required',next_attempt_at:new Date(Date.now()+Math.min(3600,2**item.attempts)*1000).toISOString(),lock_token:null,locked_until:null}).eq('id',item.id).eq('lock_token',item.lock_token));},
  async claimOutbox(){const rows=await call(()=>db.rpc('wa_claim_outbox'));return rows?.[0]||null;},
  async finishOutbox(item,state,messageId=null){await call(()=>db.rpc('wa_finish_outbox',{p_id:item.id,p_token:item.lock_token,p_state:state,p_message_id:messageId}));},
  async contact(id){return call(()=>db.from('wa_contacts').select('*').eq('id',id).maybeSingle());},
  async contactByPhone(phone){return call(()=>db.from('wa_contacts').select('*').eq('wa_id',phone).maybeSingle());},
  async template(name,language){return call(()=>db.from('wa_templates').select('*').eq('name',name).eq('language',language).maybeSingle());},
  async outbox(id){return call(()=>db.from('wa_outbox').select('*').eq('id',id).maybeSingle());},
  async createDraft(key,contact,payload,user){return call(()=>db.rpc('wa_create_draft',{p_key:key,p_contact:contact,p_payload:payload,p_user:user}));},
  async approveDraft(id,user){return call(()=>db.rpc('wa_approve_draft',{p_id:id,p_user:user}));}
 };
}
