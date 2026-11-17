import { useEffect, useState } from 'react';
const labels={ready:['Готов','Дайын'],needs_connection:['Нужно подключение','Қосылу қажет'],not_implemented:['Отключён','Өшірулі'],disabled:['Отключён','Өшірулі'],available:['Доступен','Қолжетімді']};
export default function TenderSources({request,onChanged,lang,localDemo=false}){
  const t=(ru,kk)=>lang?kk:ru;
  const [sources,setSources]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [payload,setPayload]=useState(null),[preview,setPreview]=useState(null),[name,setName]=useState(''),[message,setMessage]=useState('');
  const [revision,setRevision]=useState(0);
  useEffect(()=>{let active=true;request('/sources').catch(e=>{if(e.response?.status!==404)throw e;return request('/connection').then(r=>({sources:(r.sources || []).map(s=>({...s,state:s.status,kind:s.id==='demo'?'demo':'api',message:s.reason}))}));}).then(r=>{if(active)setSources(Array.isArray(r.sources)?r.sources:[]);}).catch(e=>{if(active)setError(e.response?.data?.error || e.message);});return()=>{active=false;};},[request,revision]);
  const choose=async file=>{
    setError('');setPreview(null);setPayload(null);setMessage('');setName(file?.name || '');if(!file)return;
    if(file.size>8*1024*1024){setError(t('Максимум 8 МБ','Ең көбі 8 МБ'));return;}
    setBusy(true);
    try{const data=JSON.parse((await file.text()).replace(/^\uFEFF/,''));const result=await request('/import/preview',{method:'POST',data,timeout:30000});setPayload(data);setPreview(result);}
    catch(e){setError(e.response?.data?.error || t('Не удалось прочитать выгрузку. Нужен JSON с массивом results и полями лотов портала.','Экспорт оқылмады. Портал лоттары бар JSON қажет.'));}
    finally{setBusy(false);}
  };
  const run=async(path,body)=>{
    setBusy(true);setError('');setMessage('');
    try{const r=await request(path,{method:'POST',data:body,timeout:60000});setMessage(`${t('Получено','Алынды')}: ${r.fetched ?? r.changed ?? 0}; ${t('добавлено','қосылды')}: ${r.inserted ?? r.changed ?? 0}; ${t('обновлено','жаңартылды')}: ${r.updated ?? 0}; ${t('без изменений','өзгеріссіз')}: ${r.unchanged ?? 0}; ${t('пропущено','өткізілді')}: ${r.skipped || 0}; ${t('дубликаты','қайталанғандар')}: ${r.duplicates || 0}`);setPreview(null);setPayload(null);setRevision(n=>n+1);onChanged();}
    catch(e){setError(e.response?.data?.error || e.message);setRevision(n=>n+1);onChanged();}
    finally{setBusy(false);}
  };
  return <details className="tender-sources"><summary>{t('Источники и импорт закупок','Дереккөздер және сатып алуларды импорттау')}</summary>
    <p>{t('Загрузите JSON, сохранённый с официального портала. Сначала будет показан предварительный результат; запись начинается только после нажатия «Импортировать».','Ресми порталдан сақталған JSON жүктеңіз. Алдымен алдын ала нәтиже көрсетіледі; жазу «Импорттау» басылғанда басталады.')}</p>
    <label>{t('Файл выгрузки JSON (до 8 МБ)','JSON экспорт файлы (8 МБ дейін)')}<input type="file" accept=".json,application/json" disabled={busy} onChange={e=>choose(e.target.files[0])} /></label>
    {name && <p>{name}</p>}{busy && <p role="status">{t('Обработка…','Өңделуде…')}</p>}
    {error && <p role="alert" className="tender-error">{error}</p>}{message && <p role="status" className="tender-banner">{message}</p>}
    {preview && <div className="tender-import-preview"><p>{t('Всего строк','Жолдар саны')}: {preview.total} · {t('Принято','Қабылданды')}: {preview.accepted} · {t('Пропущено','Өткізілді')}: {preview.skipped} · {t('Дубликаты','Қайталанғандар')}: {preview.duplicates}</p>
      {preview.warnings.map(w=><p key={w}>{w}</p>)}<ul>{preview.sample.map(r=><li key={r.external_id}>{r.number || r.external_id} · {r.title}</li>)}</ul>
      <button disabled={busy || !preview.accepted} onClick={()=>run('/import',payload)}>{t('Импортировать','Импорттау')} {preview.accepted}</button></div>}
    <div className="tender-source-grid">{sources.map(s=><article key={s.id}><strong>{typeof s.label==='object'?s.label[lang?'kk':'ru']:s.label}</strong><p>{labels[s.state]?.[lang] || s.state} · {s.message}</p><small>{t('Последний успех','Соңғы сәттілік')}: {s.last_success_at?new Date(s.last_success_at).toLocaleString('ru-KZ',{timeZone:'Asia/Qyzylorda'}):'—'}</small>{s.last_error && <p role="status">{s.last_error}</p>}{s.kind==='api' && s.state==='ready' && <button disabled={busy} onClick={()=>run('/sync/'+s.id)}>{t('Обновить','Жаңарту')}</button>}{s.id==='demo' && localDemo && <button disabled={busy} onClick={()=>run('/sync',{source:'demo'})}>{t('Загрузить тестовые данные','Тест деректерін жүктеу')}</button>}</article>)}</div>
    <p>{t('Без официального токена автоматический поиск отключён. Цены и закупки не подменяются вымышленными.','Ресми токенсіз автоматты іздеу өшірулі. Бағалар мен сатып алулар ойдан шығарылмайды.')}</p>
  </details>;
}
