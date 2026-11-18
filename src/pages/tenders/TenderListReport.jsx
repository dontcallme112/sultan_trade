import {useState} from 'react';
export default function TenderListReport({request,filters,total,lang}) {
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const t=(ru,kk)=>lang?kk:ru;
 const download=async()=>{
  setBusy(true);setError('');
  try{
   const data=await request('/report.xlsx',{params:filters,responseType:'blob',timeout:90000});
   const blob=data instanceof Blob?data:new Blob([data]);
   const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='tenders-report.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){let message=e.response?.data?.error||e.message;try{if(e.response?.data instanceof Blob)message=JSON.parse(await e.response.data.text()).error||message;}catch{/* Preserve network errors. */}setError(message);}finally{setBusy(false);}
 };
 return <div className="tender-list-report"><button disabled={busy||!total||total>200} onClick={download}>{busy?t('Формирование отчёта…','Есеп жасалуда…'):t(`Скачать список Excel (${total})`,`Тізімді Excel жүктеу (${total})`)}</button>
 <p>{t('Все найденные закупки, включая остальные страницы. Ваша таблица: 8 колонок. Прибыль — только по сохранённым подтверждённым расходам.','Басқа беттерді қоса, барлық табылған сатып алулар. Кестеде 8 баған. Пайда тек сақталған, расталған шығындармен есептеледі.')}</p>
 {total>200&&<p>{t('Уточните фильтры: до 200 закупок в одном отчёте.','Сүзгілерді нақтылаңыз: бір есепте 200 сатып алуға дейін.')}</p>}
 {error&&<p role="alert" className="tender-error">{error}</p>}</div>;
}
