import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
const money=v=>{
 if(v==null)return '—';const text=typeof v==='number'?v.toFixed(2):String(v),negative=text.startsWith('-'),[whole,fraction]=text.replace(/^-/,'').split('.');
 return (negative?'-':'')+new Intl.NumberFormat('ru-KZ').format(BigInt(whole))+','+(fraction||'00').padEnd(2,'0')+' ₸';
};
const availability={open:'Приём открыт',closed:'Закрыта / срок истёк',unknown:'Приём не подтверждён'};
const states={confirmed:'Расходы подтверждены пользователем',unconfirmed:'Расходы не подтверждены',missing_or_invalid:'Нет корректного сохранённого расчёта'};
export default function TenderPortfolio({request,filters,total,revision}){
 const [open,setOpen]=useState(true),[retry,setRetry]=useState(0),[result,setResult]=useState(null);
 const key=JSON.stringify([filters,revision,retry]),current=result?.key===key?result:null;
 useEffect(()=>{if(!open||total>200)return;let live=true;const timer=setTimeout(()=>{request('/portfolio',{params:filters,timeout:90000}).then(data=>{if(live)setResult({key,data});}).catch(e=>{if(live)setResult({key,error:e.response?.data?.error||'Не удалось загрузить финансовую сводку.'});});},400);return()=>{live=false;clearTimeout(timer);};},[request,filters,total,open,key]);
 return <details id="financial-summary" open={open} className="tender-sources tender-portfolio" onToggle={e=>{setOpen(e.currentTarget.open);if(e.currentTarget.open)setRetry(n=>n+1);}}><summary>Финансовая сводка по найденным тендерам</summary><p>Только сохранённые расчёты вашего аккаунта, включая остальные страницы. Итог — по открытым закупкам с подтверждёнными расходами. Сводка использует сохранённую цену предложения; Excel «портал +20%» — отдельный сценарий.</p>
 {total>200?<p>Уточните фильтры: до 200 закупок в сводке.</p>:!current?<p role="status">Подготовка сводки…</p>:current.error?<p role="alert">{current.error} <button onClick={()=>setRetry(n=>n+1)}>Повторить</button></p>:<>
 <div className="tender-stats"><div><strong>{money(current.data.summary.openKnownProfit)}</strong><span>Прибыль по подтверждённой части открытых закупок</span></div><div><strong>{current.data.summary.openConfirmed} / {current.data.summary.open}</strong><span>Открытые закупки с подтверждённым расчётом</span></div><div><strong>{current.data.summary.openWithoutConfirmedFinance}</strong><span>Открытые без подтверждённого расчёта</span></div><div><strong>{current.data.summary.openNonPositive}</strong><span>Открытые с нулевой прибылью или убытком</span></div></div>
 <div className="tender-table-wrap"><table><thead><tr>{['Закупка','Приём заявок','Дата расчёта','Полнота расходов','Чистая прибыль','Чистая маржа, %'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{current.data.rows.map(row=><tr key={row.id}><td><Link to={'/tenders/'+encodeURIComponent(row.id)}>{row.title}</Link></td><td>{availability[row.availability]}</td><td>{row.calculationDate||'—'}</td><td>{states[row.financeState]}</td><td>{money(row.netProfit)}</td><td>{row.marginPercent==null?'—':row.marginPercent+'%'}</td></tr>)}</tbody></table></div>
 {!current.data.rows.length&&<p>По выбранным фильтрам закупок нет.</p>}<p>{current.data.notice}</p><button onClick={()=>setRetry(n=>n+1)}>Обновить сводку</button></>}
 </details>;
}
