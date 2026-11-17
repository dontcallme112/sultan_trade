import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import './Tenders.css';

const workflow = { new: ['Новый','Жаңа'], analysis: ['На анализе','Талдауда'], interesting: ['Интересный','Қызықты'], preparing: ['Готовим заявку','Өтінім дайындау'], participating: ['Участвуем','Қатысамыз'], won: ['Выигран','Жеңдік'], lost: ['Проигран','Жеңілдік'], rejected: ['Отклонён','Қабылданбады'] };
const money = n => new Intl.NumberFormat('ru-KZ', { style: 'currency', currency: 'KZT', maximumFractionDigits: 0 }).format(n);
const date = s => s ? new Date(s).toLocaleString('ru-KZ', { timeZone: 'Asia/Qyzylorda' }) : '—';
export default function Tenders() {
  const { id } = useParams();
  const { getToken } = useAuth();
  const [lang, setLang] = useState(0);
  const t = (ru, kk) => lang ? kk : ru;
  const [connection, setConnection] = useState(null);
  const [data, setData] = useState(null);
  const [detail, setDetail] = useState(null);
  const [runs, setRuns] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState({ search: '', active: 'true', sort: 'deadline', page: 1 });
  const request = useCallback(async (path = '', options = {}) => {
    const token = await getToken();
    return (await apiClient.request({ url: `/api/tenders${path}`, ...options,
      headers: token ? { Authorization: `Bearer ${token}` } : {} })).data;
  }, [getToken]);
  // getToken belongs to the existing auth context and is recreated on auth changes.
  useEffect(() => {
    let current = true;
    apiClient.get('/api/tenders/connection').then(r => { if (current) setConnection(r.data); }).catch(() => { if (current) setError('Тендерный backend недоступен / Тендер сервері қолжетімсіз'); });
    return () => { current = false; };
  }, []);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      setBusy(true); setError('');
      Promise.all([request('', { params: filters }), request('/sync-runs'), id ? request(`/${encodeURIComponent(id)}`) : null])
        .then(([list, log, card]) => { if (current) { setData(list); setRuns(log); setDetail(card); } })
        .catch(e => { if (current) { setData(null); setDetail(null); setError(e.response?.data?.error || e.message); } })
        .finally(() => { if (current) setBusy(false); });
    }, 250);
    return () => { current = false; clearTimeout(timer); };
  }, [request, filters, id, revision]);
  const change = (key, value) => setFilters(f => ({ ...f, [key]: value, page: 1 }));
  const mutate = async (path, method, body) => {
    setBusy(true); setError('');
    try { await request(path, { method, data: body }); setRevision(n => n+1); }
    catch (e) { setError(e.response?.data?.error || e.message); setBusy(false); }
  };
  const select = (key, label, entries) => <label>{label}<select value={filters[key] || ''} onChange={e => change(key,e.target.value)}><option value="">{t('Все','Барлығы')}</option>{entries.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>;
  return <section className="tenders-page" aria-busy={busy}>
    <div className="tender-heading"><div><small>SULTAN TRADE AI · TENDER INTELLIGENCE</small><h1>{t('Тендеры','Тендерлер')}</h1><p>{t('Поиск и управление закупками','Сатып алуларды іздеу және басқару')}</p></div><button onClick={() => setLang(n => 1-n)}>{lang ? 'Русский' : 'Қазақша'}</button></div>
    {connection?.demo && <p className="tender-banner">{t('ДЕМО: все закупки вымышлены. Общий тестовый пользователь. Данные сохраняются локально на сервере.','ДЕМО: барлық сатып алулар ойдан шығарылған. Ортақ тест пайдаланушысы. Деректер серверде жергілікті сақталады.')}</p>}
    <details className="tender-sources"><summary>{t('Источники и подключение','Дереккөздер және қосылу')}</summary>{connection?.sources.map(s => <p key={s.id}><strong>{s.label}: {s.status}</strong> — {s.reason} {s.documentation && <a href={s.documentation} target="_blank" rel="noreferrer">Документация</a>}</p>)}<p>{t('Последняя успешная синхронизация','Соңғы сәтті синхрондау')}: {date(runs?.last_success)} (UTC+5)</p><button disabled={busy || !connection?.demo} onClick={() => mutate('/sync','POST',{ source:'demo' })}>{t('Загрузить / обновить демоданные','Демо деректерді жүктеу / жаңарту')}</button></details>
    {error && <div className="tender-error" role="alert">{error} <button onClick={() => setRevision(n => n+1)}>{t('Повторить','Қайталау')}</button> <Link to="/profile">{t('Вход / профиль','Кіру / профиль')}</Link></div>}
    {busy && <p role="status">{t('Загрузка…','Жүктелуде…')}</p>}
    {data && <>
      <div className="tender-stats">{[[t('Всего','Барлығы'),data.summary.total],[t('Новые','Жаңа'),data.summary.new],[t('Соответствие ≥80','Сәйкестік ≥80'),data.summary.high],[t('Избранные','Таңдаулылар'),data.summary.favorites],[t('Срок ≤7 дней','Мерзім ≤7 күн'),data.summary.upcoming]].map(([label,n]) => <div key={label}><strong>{n}</strong><span>{label}</span></div>)}</div>
      {id ? detail && <article className="tender-detail"><Link to="/tenders">← {t('Все тендеры','Барлық тендерлер')}</Link><h2>{detail.title}</h2><p>{detail.description}</p><dl><dt>{t('Заказчик','Тапсырыс беруші')}</dt><dd>{detail.customer}</dd><dt>{t('Регион','Өңір')}</dt><dd>{detail.region}</dd><dt>{t('Сумма','Сома')}</dt><dd>{money(detail.amount)}</dd><dt>{t('Срок подачи','Өтінім мерзімі')}</dt><dd>{date(detail.deadline)} (UTC+5)</dd><dt>{t('Способ','Тәсіл')}</dt><dd>{detail.method}</dd></dl>
        <p>{t('Базовое соответствие','Негізгі сәйкестік')}: <strong>{detail.rating.score}/100</strong> · {t('Полнота оценки','Бағалау толықтығы')}: {detail.rating.coverage*100}%</p><p>{detail.rating.formula}</p><p>{t('Неизвестно','Белгісіз')}: {detail.rating.unknown.join(', ')}</p>
        <p>{t('Анализ ТЗ, поставщики и прибыль: данных нет; модули следующих этапов.','Техникалық талдау, жеткізушілер және пайда: деректер жоқ; келесі кезең модульдері.')}</p>
        <button disabled={busy} onClick={() => mutate(`/${encodeURIComponent(id)}`,'PATCH',{favorite:!detail.favorite})}>{detail.favorite ? '★' : '☆'} {t('Избранное','Таңдаулы')}</button> <label>{t('Рабочий статус','Жұмыс күйі')}<select disabled={busy} value={detail.workflow} onChange={e => mutate(`/${encodeURIComponent(id)}`,'PATCH',{workflow:e.target.value})}>{Object.entries(workflow).map(([key,label]) => <option key={key} value={key}>{label[lang]}</option>)}</select></label>
        {detail.source_url && <a href={detail.source_url} target="_blank" rel="noreferrer">{t('Первоисточник','Бастапқы дереккөз')}</a>}
        <h3>{t('История изменений','Өзгерістер тарихы')}</h3>{detail.history.length ? detail.history.map((h,i) => <details key={h.id || i}><summary>{date(h.created_at)} · {h.user_id ? t('Рабочие изменения','Жұмыс өзгерістері') : t('Данные источника','Дереккөз деректері')}</summary><pre>{JSON.stringify({before:h.before,after:h.after},null,2)}</pre></details>) : <p>—</p>}
      </article> : <>
        <div className="tender-filters"><label>{t('Поиск','Іздеу')}<input value={filters.search} onChange={e => change('search',e.target.value)} placeholder={t('Название, заказчик, ключевые слова','Атауы, тапсырыс беруші, кілт сөздер')} /></label>
          {select('region',t('Регион','Өңір'),data.regions.map(v=>[v,v]))}
          {select('category',t('Направление','Бағыт'),[['security',t('Безопасность','Қауіпсіздік')],['it','IT'],['display',t('Экраны и аудио','Экрандар және аудио')],['electrical',t('Электрика','Электр')],['construction',t('Строительство','Құрылыс')],['other',t('Прочее','Басқа')]])}
          {select('method',t('Способ','Тәсіл'),data.methods.map(v=>[v,v]))}{select('status',t('Статус','Күй'),Object.entries(workflow).map(([k,v])=>[k,v[lang]]))}
          <label>{t('Заказчик','Тапсырыс беруші')}<input value={filters.customer || ''} onChange={e=>change('customer',e.target.value)} /></label>
          {['min','max'].map((key,i)=><label key={key}>{i ? t('Сумма до','Сома дейін') : t('Сумма от','Сома бастап')}<input type="number" min="0" value={filters[key] || ''} onChange={e=>change(key,e.target.value)} /></label>)}
          <label>{t('Срок подачи до','Өтінім мерзімі дейін')}<input type="date" value={filters.before?.slice(0,10) || ''} onChange={e=>change('before',e.target.value ? `${e.target.value}T23:59:59+05:00` : '')} /></label>
          {select('sort',t('Сортировка','Сұрыптау'),[['deadline',t('Ближайший срок','Ең жақын мерзім')],['amount',t('Сумма','Сома')],['rating',t('Соответствие','Сәйкестік')],['newest',t('Новые','Жаңа')]])}
          <label className="tender-check"><input type="checkbox" checked={filters.active==='true'} onChange={e=>change('active',String(e.target.checked))} />{t('Только активные','Тек белсенді')}</label><label className="tender-check"><input type="checkbox" checked={filters.favorite==='true'} onChange={e=>change('favorite',String(e.target.checked))} />{t('Избранные','Таңдаулылар')}</label>
        </div>
        <p>{t('Найдено','Табылды')}: {data.total}</p><div className="tender-grid">{data.items.map(row => <article key={row.id}><div className="tender-card-top"><small>{row.demo ? 'DEMO' : row.source} · {row.region}</small><button disabled={busy} aria-label={t('Избранное','Таңдаулы')} onClick={()=>mutate(`/${encodeURIComponent(row.id)}`,'PATCH',{favorite:!row.favorite})}>{row.favorite ? '★' : '☆'}</button></div><h2><Link to={`/tenders/${encodeURIComponent(row.id)}`}>{row.title}</Link></h2><p>{row.customer}</p><strong>{money(row.amount)}</strong><p>{date(row.deadline)} (UTC+5)</p><p>{workflow[row.workflow]?.[lang]} · {t('Соответствие','Сәйкестік')} {row.rating.score}/100</p><small>{t('Оценено 20% факторов; прибыль неизвестна','Факторлардың 20% бағаланды; пайда белгісіз')}</small></article>)}</div>
        {!data.items.length && <p>{t('Закупок нет. Измените фильтры или загрузите демоданные.','Сатып алулар жоқ. Сүзгілерді өзгертіңіз немесе демо деректерді жүктеңіз.')}</p>}
        <div className="tender-pagination"><button disabled={busy || data.page<=1} onClick={()=>setFilters(f=>({...f,page:f.page-1}))}>←</button><span>{data.page} / {Math.max(1,data.pages)}</span><button disabled={busy || data.page>=data.pages} onClick={()=>setFilters(f=>({...f,page:f.page+1}))}>→</button></div>
      </>}
      <details className="tender-sources"><summary>{t('Журнал синхронизации','Синхрондау журналы')} · {runs?.runs.filter(r=>r.status==='error').length || 0} {t('ошибок','қате')}</summary>{runs?.runs.map(r=><p key={r.id}>{date(r.started_at)} · {r.source} · {r.status} · {t('изменено','өзгерді')}: {r.changed} {r.error}</p>)}</details>
    </>}
  </section>;
}
