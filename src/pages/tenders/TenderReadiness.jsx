import {useEffect,useState} from 'react';
const stateLabels={documented:'Данные заполнены',problem:'Есть проблема',unknown:'Не хватает данных',manual:'Решение руководителя'};
export default function TenderReadiness({request,id,revision}){
 const [result,setResult]=useState(null),[retry,setRetry]=useState(0);
 const key=`${id}:${revision}:${retry}`,current=result?.key===key?result:null;
 useEffect(()=>{let live=true;request(`/${encodeURIComponent(id)}/readiness`).then(data=>{if(live)setResult({key,data});}).catch(()=>{if(live)setResult({key,error:true});});return()=>{live=false;};},[request,id,key]);
 return <details className="tender-sources" id="tender-readiness"><summary>Подготовка заявки: что осталось проверить</summary><p>Проверка по сохранённым данным. Заполнение пунктов не означает допуск к закупке.</p>
 <button onClick={()=>setRetry(n=>n+1)}>Обновить проверку</button>
 {!current?<p role="status">Проверка данных…</p>:current.error?<p role="alert">Не удалось загрузить проверку. Повторите запрос.</p>:<><p>Заполнено: {current.data.documented} · Проблем: {current.data.problems} · Нет данных: {current.data.unknown}</p><ul>{current.data.checks.map(c=><li key={c.key}><strong>{c.label}: {stateLabels[c.state]}</strong><p>{c.message}</p></li>)}</ul><p>{current.data.notice}</p></>}
 </details>;
}
