import {useState} from 'react';
export default function TenderReport({request,id,lang}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const t=(ru,kk)=>lang?kk:ru;
 const download=async format=>{
  setBusy(true);setError('');try{
   const data=await request(`/${encodeURIComponent(id)}/report.${format}`,{responseType:'blob',timeout:90000});
   const blob=data instanceof Blob?data:new Blob([data]);
   const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`tender-report-${id}.${format}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){let message=e.response?.data?.error||e.message;try{if(e.response?.data instanceof Blob){const body=JSON.parse(await e.response.data.text());message=body.error||message;}}catch{/* Preserve the original network error when a proxy returns non-JSON. */}setError(message);}finally{setBusy(false);}
 };
 return <details className="tender-sources"><summary>{t('Отчёт для руководителя','Басшыға арналған есеп')}</summary><p>{t('Выгрузка включает только сохранённые данные вашего аккаунта: ТЗ, проверку параметров, предложения, финансы, рейтинг и допущения. Сначала сохраните изменения в нужных разделах. Неизвестные значения не заменяются нулями.','Жүктеу тек аккаунтыңыздағы сақталған деректерді қамтиды: ТТ, параметрлер, ұсыныстар, қаржы, рейтинг және болжамдар. Алдымен қажетті бөлімдердегі өзгерістерді сақтаңыз. Белгісіз мәндер нөлге ауыстырылмайды.')}</p><p>{t('Это снимок анализа, а не подтверждение поставщика или готовности к участию. Оригинал документа в файл не включается.','Бұл талдау көшірмесі, жеткізушіні немесе қатысуға дайындықты растау емес. Құжат түпнұсқасы файлға енгізілмейді.')}</p><div className="tender-actions"><button disabled={busy} onClick={()=>download('xlsx')}>{t('Скачать отчёт Excel','Excel есебін жүктеу')}</button><button disabled={busy} onClick={()=>download('json')}>{t('Скачать данные JSON','JSON деректерін жүктеу')}</button></div>{busy&&<p role="status">{t('Формирование отчёта…','Есеп жасалуда…')}</p>}{error&&<p role="alert" className="tender-error">{error}</p>}</details>;
}
