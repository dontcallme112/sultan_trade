import OneCConnection from './OneCConnection';
import {useEffect,useState} from 'react';
export default function TenderOneC({request,filters,total}){
 const [status,setStatus]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let live=true;request('/onec/status').then(v=>{if(live)setStatus(v);}).catch(()=>{if(live)setError('Не удалось проверить подготовку обмена с 1С.');});return()=>{live=false;};},[request]);
 const download=async(kind,name)=>{setBusy(true);setError('');try{
  const data=await request('/onec/'+kind,{params:kind==='package.json'?filters:undefined,responseType:'blob',timeout:90000});const blob=data instanceof Blob?data:new Blob([data]);const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }catch(e){let message=e.response?.data?.error||e.message;try{if(e.response?.data instanceof Blob)message=JSON.parse(await e.response.data.text()).error||message;}catch{/* Preserve network errors. */}setError(message);}finally{setBusy(false);}};
 return <details className="tender-sources"><summary>Подготовка обмена с 1С:Бухгалтерия для Казахстана</summary><p>{status?.message||'Проверка доступности файлового обмена…'}</p><p>Пакет содержит анализ выбранных тендеров. Он не создаёт и не проводит документы 1С. Для загрузки нужна обработка и сопоставление справочников на тестовой копии базы.</p>
 <button disabled={busy||!status||!total||total>200} onClick={()=>download('package.json','sultan-trade-1c-preparation.json')}>Скачать пакет для проверки ({total})</button>{total>200&&<p>Уточните фильтры: до 200 закупок в пакете.</p>}
 <OneCConnection request={request} />
 <details><summary>Материалы для разработчика 1С</summary><ul>{status?.required.map(v=><li key={v}>{v}</li>)}</ul><button disabled={busy} onClick={()=>download('reader.bsl','SultanTradePreparation.bsl')}>Скачать модуль проверки BSL</button> <button disabled={busy} onClick={()=>download('schema.json','sultan-trade-1c.schema.json')}>Скачать описание JSON</button><p><a href="https://github.com/dontcallme112/sultan_trade/blob/master/tenders/onec/README.md" target="_blank" rel="noreferrer">Инструкция подключения на тестовой базе</a></p><p>Модуль BSL требует проверки на вашем релизе 1С; на действующей базе не тестировался.</p></details>
 {busy&&<p role="status">Подготовка файла…</p>}{error&&<p role="alert" className="tender-error">{error}</p>}</details>;
}
