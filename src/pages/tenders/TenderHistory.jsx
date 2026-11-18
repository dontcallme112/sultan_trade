import {useEffect,useState} from 'react';
const labels = {
 source:['Источник','Дереккөз'],external_id:['Код источника','Дереккөз коды'],number:['Номер','Нөмір'],title:['Наименование','Атауы'],description:['Описание','Сипаттама'],customer_name:['Заказчик','Тапсырыс беруші'],customer_bin:['БИН заказчика','Тапсырыс берушінің БСН'],region_code:['Код региона','Өңір коды'],region_name:['Регион','Өңір'],method:['Способ закупки','Сатып алу тәсілі'],status_raw:['Статус на портале','Порталдағы күй'],total_price:['Сумма','Сома'],quantity:['Количество','Саны'],currency:['Валюта','Валюта'],published_at:['Опубликовано','Жарияланды'],deadline_at:['Срок подачи','Өтінім мерзімі'],url:['Ссылка источника','Дереккөз сілтемесі'],directions:['Направления','Бағыттар'],status:['Рабочий статус','Жұмыс күйі'],note:['Заметка команды','Топ ескертпесі']
};
const statuses={new:['Новый','Жаңа'],review:['На анализе','Талдауда'],interesting:['Интересный','Қызықты'],preparing:['Готовим заявку','Өтінім дайындау'],participating:['Участвуем','Қатысамыз'],won:['Выигран','Жеңдік'],lost:['Проигран','Жеңілдік'],rejected:['Отклонён','Қабылданбады']};
const when=value=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('ru-KZ',{timeZone:'Asia/Qyzylorda'}):'—';
export default function TenderHistory({request,id,lang,revision}){
 const [result,setResult]=useState(null),[retry,setRetry]=useState(0);
 const key=`${id}:${revision}:${retry}`,data=result?.key===key?result.data:null,error=result?.key===key?result.error:'';
 const t=(ru,kk)=>lang?kk:ru;
 useEffect(()=>{let current=true;
  request(`/${encodeURIComponent(id)}/history`).then(v=>{if(current)setResult({key,data:v,error:''});}).catch(()=>{if(current)setResult({key,data:null,error:'error'});});
  return()=>{current=false;};
 },[request,id,key]);
 const value=(key,v)=>v==null||v===''?'—':key==='status'?(statuses[v]?.[lang?1:0]||String(v)):['published_at','deadline_at'].includes(key)?when(v):Array.isArray(v)?v.join(', '):String(v);
 return <section className="tender-history"><h3>{t('История изменений','Өзгерістер тарихы')}</h3>
 <p>{t('Последние 50 событий с момента включения истории. Более ранние изменения не восстановлены. Время UTC+5.','Тарих қосылғаннан кейінгі соңғы 50 оқиға. Бұрынғы өзгерістер қалпына келтірілмеген. Уақыт UTC+5.')}</p>
 {error?<p role="alert">{t('Не удалось загрузить историю.','Тарихты жүктеу мүмкін болмады.')} <button onClick={()=>setRetry(n=>n+1)}>{t('Повторить','Қайталау')}</button></p>:!data?<p role="status">{t('Загрузка истории…','Тарих жүктелуде…')}</p>:!data.available?<p>{t('История ещё не включена в базе данных.','Дерекқордағы тарих әлі қосылмаған.')}</p>:!data.items.length?<p>{t('Изменения пока не зафиксированы.','Өзгерістер әлі тіркелмеген.')}</p>:data.items.map(event=>{
  const before=event.before_data||{},after=event.after_data||{};
  const keys=Object.keys(labels).filter(k=>JSON.stringify(before[k]??null)!==JSON.stringify(after[k]??null));
  return <details key={event.id}><summary>{when(event.created_at)} · {event.kind==='workflow_changed'?t('Рабочие изменения','Жұмыс өзгерістері'):event.kind==='source_created'?t('Закупка впервые сохранена','Сатып алу алғаш сақталды'):t('Данные источника изменены','Дереккөз деректері өзгерді')}</summary>
  {event.kind==='workflow_changed'&&<p>{event.actor_id?t('Изменено сотрудником','Қызметкер өзгертті'):t('Изменено системой','Жүйе өзгертті')}</p>}
  <dl>{keys.map(k=><div key={k}><dt>{labels[k][lang?1:0]}</dt><dd>{event.before_data&&<><span>{value(k,before[k])}</span> → </>}<span>{value(k,after[k])}</span></dd></div>)}</dl></details>;
 })}</section>;
}
