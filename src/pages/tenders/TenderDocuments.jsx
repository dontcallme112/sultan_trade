import {useState} from 'react';
const types={quantity:'Количество',delivery:'Поставка',deadline:'Срок',warranty:'Гарантия',license:'Лицензия',certificate:'Стандарты',parameter:'Параметр',restriction:'Возможное ограничение',kit:'Комплектация'};
export default function TenderDocuments({request,id,lang}){
  const t=(ru,kk)=>lang?kk:ru;
  const [result,setResult]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[review,setReview]=useState({}),[original,setOriginal]=useState(null),[consent,setConsent]=useState(false);
  const choose=async file=>{
    setError('');setResult(null);setReview({});setOriginal(null);setConsent(false);if(!file)return;
    if(file.size>5*1024*1024){setError(t('Максимум 5 МБ','Ең көбі 5 МБ'));return;}
    setBusy(true);
    try{const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('Ошибка чтения файла'));reader.readAsDataURL(file);});
      setOriginal({name:file.name,base64});
      setResult(await request(`/${encodeURIComponent(id)}/documents/extract`,{method:'POST',data:{name:file.name,base64},timeout:90000}));
    }catch(e){setError(e.response?.data?.error || e.message);}finally{setBusy(false);}
  };
  const analyze=async()=>{
    if(!consent || !original)return;
    setBusy(true);setError('');
    try{const next=await request(`/${encodeURIComponent(id)}/documents/analyze`,{method:'POST',data:{...original,consent:true},timeout:100000});setResult(next);setReview({});}
    catch(e){setError(e.response?.data?.error || e.message);}finally{setBusy(false);}
  };
  const update=(i,patch)=>setReview(rows=>({...rows,[i]:{status:'unknown',value:'',url:'',...rows[i],...patch}}));
  const download=()=>{
    setError('');const rows=result.requirements.map((r,i)=>({...r,...(review[i] || {status:'unknown',value:'',url:''})}));
    const validUrl=value=>{try{const u=new URL(value);return u.protocol==='https:' && !u.username && !u.password;}catch{return false;}};
    for(const r of rows){if(r.status==='matches' && (!r.value.trim() || !validUrl(r.url))){setError(t('Для отметки «соответствует» нужны значение параметра и ссылка на подтверждающий источник https://.','«Сәйкес» белгісі үшін параметр мәні мен https:// растау сілтемесі қажет.'));return;}}
    const report={document:{name:result.name,sha256:result.sha256,format:result.format},mode:'manual_compliance_review',requirements:rows,warnings:result.warnings,ai:result.ai};
    const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='tender-specification-review.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  return <details className="tender-sources"><summary>{t('Техническое задание и таблица соответствия','Техникалық тапсырма және сәйкестік кестесі')}</summary>
    <p>{t('PDF с текстом, DOCX, XLSX или TXT, до 5 МБ. Файл обрабатывается сервером, но оригинал не сохраняется. Проверку можно скачать в JSON.','Мәтіндік PDF, DOCX, XLSX немесе TXT, 5 МБ дейін. Сервер файлды өңдейді, түпнұсқа сақталмайды. Тексеруді JSON түрінде жүктеуге болады.')}</p>
    <label>{t('Загрузить ТЗ','ТТ жүктеу')}<input type="file" accept=".pdf,.docx,.xlsx,.txt" disabled={busy} onChange={e=>choose(e.target.files[0])} /></label>
    {busy && <p role="status">{t('Обработка документа…','Құжат өңделуде…')}</p>}{error && <p role="alert" className="tender-error">{error}</p>}
    {result && <><p>{result.name} · {result.format.toUpperCase()} · {result.lineCount} {t('строк','жол')}</p><p className="tender-banner">{result.ai.message}</p>{result.ai.status==='ready' && <div><label><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)} />{t('Разрешаю отправить извлечённый текст в OpenAI для анализа. Оригинал файла не отправляется провайдеру.','Талдау үшін шығарылған мәтінді OpenAI-ға жіберуге келісемін. Файл түпнұсқасы провайдерге жіберілмейді.')}</label><button disabled={busy || !consent || result.text.length>60000} onClick={analyze}>{t('Извлечь требования с AI','AI арқылы талаптарды шығару')}</button>{result.text.length>60000 && <p>{t('Для AI выберите документ до 60 000 символов.','AI үшін 60 000 таңбаға дейінгі құжатты таңдаңыз.')}</p>}</div>}<ul>{result.warnings.map(w=><li key={w}>{w}</li>)}</ul>
      <details><summary>{t('Извлечённый текст с номерами строк','Жол нөмірлері бар шығарылған мәтін')}</summary><pre>{result.text.split('\n').map((line,i)=>`${i+1}: ${line}`).join('\n')}</pre></details>
      <p>{t('Результат ниже — ручная проверка каждого существенного параметра. Приблизительно похожая модель не считается полностью соответствующей.','Төменде әр маңызды параметрді қолмен тексеру. Шамамен ұқсас модель толық сәйкес болып саналмайды.')}</p>
      <div className="tender-table-wrap"><table><thead><tr><th>{t('Требование и подтверждение в ТЗ','Талап және ТТ дәлелі')}</th><th>{t('Параметр предлагаемой модели','Ұсынылған модель параметрі')}</th><th>{t('Источник характеристик','Сипаттамалар дереккөзі')}</th><th>{t('Ручная оценка','Қолмен бағалау')}</th></tr></thead><tbody>{result.requirements.map((r,i)=><tr key={i}><td><small>{types[r.type] || r.type} · {t('строка','жол')} {r.evidence.line}</small><p>{r.text}</p></td><td><textarea aria-label={`${t('Параметр','Параметр')} ${i+1}`} maxLength={1000} value={review[i]?.value || ''} onChange={e=>update(i,{value:e.target.value})} /></td><td><input aria-label={`${t('Источник','Дереккөз')} ${i+1}`} type="url" placeholder="https://" value={review[i]?.url || ''} maxLength={2000} onChange={e=>update(i,{url:e.target.value})} /></td><td><select aria-label={`${t('Оценка','Бағалау')} ${i+1}`} value={review[i]?.status || 'unknown'} onChange={e=>update(i,{status:e.target.value})}><option value="unknown">{t('Не проверено','Тексерілмеген')}</option><option value="matches">{t('Соответствует по источнику','Дереккөз бойынша сәйкес')}</option><option value="partial">{t('Частично','Ішінара')}</option><option value="fails">{t('Не соответствует','Сәйкес емес')}</option></select></td></tr>)}</tbody></table></div>
      {!result.requirements.length && <p>{t('Фразы требований не распознаны. Проверьте извлечённый текст вручную.','Талаптар танылмады. Шығарылған мәтінді қолмен тексеріңіз.')}</p>}
      <button onClick={download}>{t('Скачать таблицу проверки JSON','Тексеру кестесін JSON жүктеу')}</button><p>{t('Форма проверки хранится только до перезагрузки страницы. Скачайте результат перед выходом.','Тексеру нысаны бет жаңартылғанша сақталады. Шығудан бұрын нәтижені жүктеңіз.')}</p>
    </>}
  </details>;
}
