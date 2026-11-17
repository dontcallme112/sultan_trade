import {useEffect,useRef,useState} from 'react';
import {useLocation} from 'react-router-dom';
export default function TenderReport({request,id,lang}){
 const panel=useRef(null),{hash}=useLocation();
 useEffect(()=>{if(hash==='#tender-report'&&panel.current){panel.current.open=true;panel.current.scrollIntoView({block:'start'});}},[hash,id]);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const t=(ru,kk)=>lang?kk:ru;
 const download=async format=>{
  setBusy(true);setError('');try{
   const data=await request(`/${encodeURIComponent(id)}/report.${format}`,{responseType:'blob',timeout:90000});
   const blob=data instanceof Blob?data:new Blob([data]);
   const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`tender-report-${id}.${format}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){let message=e.response?.data?.error||e.message;try{if(e.response?.data instanceof Blob){const body=JSON.parse(await e.response.data.text());message=body.error||message;}}catch{/* Preserve the original network error when a proxy returns non-JSON. */}setError(message);}finally{setBusy(false);}
 };
 return <details id="tender-report" ref={panel} className="tender-sources"><summary>{t('Отчёт для руководителя','Басшыға арналған есеп')}</summary><p>{t('Excel: одна таблица по вашему шаблону. Прибыль рассчитана для цены «портал +20%» только при подтверждённых расходах. Нет данных — «—».','Excel: үлгі бойынша бір кесте. Пайда «портал +20%» бағасына расталған шығындармен есептеледі. Дерек жоқ — «—».')}</p><div className="tender-actions"><button disabled={busy} onClick={()=>download('xlsx')}>{t('Скачать отчёт Excel','Excel есебін жүктеу')}</button><button disabled={busy} onClick={()=>download('json')}>{t('Скачать данные JSON','JSON деректерін жүктеу')}</button></div>{busy&&<p role="status">{t('Формирование отчёта…','Есеп жасалуда…')}</p>}{error&&<p role="alert" className="tender-error">{error}</p>}</details>;
}
