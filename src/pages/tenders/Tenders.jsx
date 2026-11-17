import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import { tendersAPI, errorMessage } from '../../api/services/tenders';
import { T } from './i18n';
import { fmtMoney, fmtDate, deadlineLeft, scoreBand, buildQuery, FACTOR_LABELS, SOURCE_STATE_LABELS } from './format';
import './Tenders.css';

const EMPTY = { q: '', direction: '', workStatus: '', minPrice: '', maxPrice: '', minScore: '', region: '', sort: 'score', onlyOpen: true, onlyFav: false };
const getLang = () => { try { return localStorage.getItem('tenders_lang') === 'kk' ? 'kk' : 'ru'; } catch { return 'ru'; } };

function ScoreBadge({ lot, t }) {
  if (lot.score == null) return <span className="td-score td-score-none">{t.noScore}</span>;
  return (
    <span className={`td-score td-score-${scoreBand(lot.score)}${lot.score_detail?.preliminary ? ' td-prelim' : ''}`}
      title={`${t.confidence}: ${lot.score_confidence ?? 0}%`}>
      {lot.score}{lot.score_detail?.preliminary ? <small> {t.scorePrelim}</small> : null}
    </span>
  );
}

function Deadline({ iso, t }) {
  const d = deadlineLeft(iso);
  if (!d) return <span>—</span>;
  if (d.expired) return <span className="td-expired">{t.expired}</span>;
  return <span>{d.days > 0 ? `${t.left} ${d.days} ${t.days}` : `${t.left} ${d.hours} ${t.hours}`}</span>;
}

function DetailInner({ id, t, lang, meta, onClose, onChanged }) {
  const [lot, setLot] = useState(null);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  useEffect(() => { tendersAPI.get(id).then(l => { setLot(l); setNote(l.note || ''); }).catch(e => setErr(errorMessage(e))); }, [id]);
  if (err) return <div className="td-modal" onClick={onClose}><div className="td-modal-box" onClick={e => e.stopPropagation()}><p className="td-error">{err}</p><button className="btn btn-secondary" onClick={onClose}>{t.close}</button></div></div>;
  if (!lot) return <div className="td-modal"><div className="td-modal-box">{t.loading}</div></div>;
  const dirName = (d) => meta?.directions?.find(x => x.id === d)?.[lang] || d;
  const save = async (patch) => { try { setLot(await tendersAPI.setState(id, patch)); setMsg(t.saved); onChanged(); } catch (e) { setMsg(errorMessage(e)); } };
  const toggleFav = async () => { await tendersAPI.setFavorite(id, !lot.favorite); setLot({ ...lot, favorite: !lot.favorite }); onChanged(); };
  const sd = lot.score_detail;
  return (
    <div className="td-modal" onClick={onClose}>
      <div className="td-modal-box" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="td-modal-head">
          <h2>{lot.is_demo && <span className="td-demo">{t.demo}</span>} {lot.title}</h2>
          <button className="td-x" onClick={onClose} aria-label={t.close}>×</button>
        </div>
        <dl className="td-dl">
          <dt>{t.number}</dt><dd>{lot.number || '—'}</dd>
          <dt>{t.customer}</dt><dd>{lot.customer_name || '—'}{lot.customer_bin ? ` (БИН ${lot.customer_bin})` : ''}</dd>
          <dt>{t.price}</dt><dd>{fmtMoney(lot.total_price)}</dd>
          <dt>{t.method}</dt><dd>{lot.method || '—'}</dd>
          <dt>{t.region}</dt><dd>{lot.region_name || '—'}</dd>
          <dt>{t.published}</dt><dd>{fmtDate(lot.published_at, lang)}</dd>
          <dt>{t.deadline}</dt><dd>{fmtDate(lot.deadline_at, lang)} · <Deadline iso={lot.deadline_at} t={t} /></dd>
        </dl>
        {lot.description && <p className="td-desc">{lot.description}</p>}
        <div className="td-chips">{lot.directions.map(d => <span key={d} className="td-chip">{dirName(d)}</span>)}</div>

        <h3>{t.score}: <ScoreBadge lot={lot} t={t} /> <small className="td-muted">{t.confidence}: {lot.score_confidence ?? 0}%</small></h3>
        {sd && (
          <table className="td-factors">
            <caption>{t.why}</caption>
            <tbody>
              {sd.factors.map(f => (
                <tr key={f.key} className={f.value == null ? 'td-unknown' : ''}>
                  <td>{FACTOR_LABELS[lang][f.key]}</td>
                  <td>{f.value == null ? t.noData : `${Math.round(f.value * 100)}%`}</td>
                  <td className="td-muted">{t.weight} {f.weight}</td>
                  <td className="td-muted">{f.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="td-form">
          <label>{t.status}
            <select value={lot.work_status} onChange={e => save({ status: e.target.value })}>
              {meta?.statuses?.map(s => <option key={s.id} value={s.id}>{s[lang]}</option>)}
            </select>
          </label>
          <label>{t.note}
            <textarea rows={3} maxLength={2000} value={note} onChange={e => setNote(e.target.value)} />
          </label>
          <div className="td-actions">
            <button className="btn btn-primary btn-sm" onClick={() => save({ note })}>{t.save}</button>
            <button className="btn btn-secondary btn-sm" onClick={toggleFav}>{lot.favorite ? `★ ${t.unfav}` : `☆ ${t.fav}`}</button>
            {msg && <span className="td-muted">{msg}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// Окно выводим в body: внутри <main> его перекрывает шапка сайта
function Detail(props) { return createPortal(<DetailInner {...props} />, document.body); }

function Dashboard({ t, setTab }) {
  const [d, setD] = useState(null); const [err, setErr] = useState('');
  const load = useCallback(() => { tendersAPI.dashboard().then(r => { setErr(''); setD(r); }).catch(e => setErr(errorMessage(e))); }, []);
  useEffect(load, [load]);
  if (err) return <p className="td-error">{err} <button className="btn btn-sm btn-secondary" onClick={load}>{t.retry}</button></p>;
  if (!d) return <p>{t.loading}</p>;
  const cards = [['found', d.found], ['open', d.open], ['new', d.new], ['high', d.high], ['favorites', d.favorites]];
  return (
    <div>
      {d.has_demo && <p className="td-warn">{t.demoWarn}</p>}
      <div className="td-cards">
        {cards.map(([k, v]) => <div key={k} className="td-card"><div className="td-card-n">{v}</div><div className="td-muted">{t.cards[k]}</div></div>)}
        <div className={`td-card${d.sync_errors.length ? ' td-card-bad' : ''}`}><div className="td-card-n">{d.sync_errors.length}</div><div className="td-muted">{t.cards.errors}</div></div>
      </div>
      <h3>{t.cards.nearest}</h3>
      {d.nearest.length === 0 ? <p className="td-muted">{t.empty}</p> : (
        <ul className="td-near">{d.nearest.map(n => (
          <li key={n.id}>{n.is_demo && <span className="td-demo">{t.demo}</span>} {n.title} — <Deadline iso={n.deadline_at} t={t} /></li>
        ))}</ul>
      )}
      {d.sync_errors.map(e => <p key={e.source} className="td-error">{e.source}: {e.error} <button className="btn btn-sm btn-secondary" onClick={() => setTab('sources')}>{t.tabs.sources}</button></p>)}
    </div>
  );
}

function Lots({ t, lang, meta }) {
  const [f, setF] = useState(EMPTY);
  const [applied, setApplied] = useState(EMPTY);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [openId, setOpenId] = useState(null);
  const closeDetail = useCallback(() => setOpenId(null), []);
  const load = useCallback(() => {
    tendersAPI.list(buildQuery(applied, page)).then(r => { setErr(''); setData(r); }).catch(e => { setErr(errorMessage(e)); setData(null); });
  }, [applied, page]);
  useEffect(load, [load]);
  useEffect(() => { const h = setTimeout(() => { setApplied(f); setPage(1); }, 350); return () => clearTimeout(h); }, [f]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const toggleFav = async (lot, e) => { e.stopPropagation(); await tendersAPI.setFavorite(lot.id, !lot.favorite); load(); };
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const dirName = (d) => meta?.directions?.find(x => x.id === d)?.[lang] || d;
  return (
    <div>
      <div className="td-filters">
        <input className="input td-search" placeholder={t.search} value={f.q} onChange={set('q')} />
        <select className="input" value={f.direction} onChange={set('direction')}>
          <option value="">{t.allDirections}</option>
          {meta?.directions?.map(d => <option key={d.id} value={d.id}>{d[lang]}</option>)}
        </select>
        <select className="input" value={f.workStatus} onChange={set('workStatus')}>
          <option value="">{t.allStatuses}</option>
          {meta?.statuses?.map(s => <option key={s.id} value={s.id}>{s[lang]}</option>)}
        </select>
        <input className="input" type="number" min="0" placeholder={t.minPrice} value={f.minPrice} onChange={set('minPrice')} />
        <input className="input" type="number" min="0" placeholder={t.maxPrice} value={f.maxPrice} onChange={set('maxPrice')} />
        <input className="input" type="number" min="0" max="100" placeholder={t.minScore} value={f.minScore} onChange={set('minScore')} />
        <input className="input" placeholder={t.region} value={f.region} onChange={set('region')} />
        <select className="input" value={f.sort} onChange={set('sort')}>
          {Object.entries(t.sort).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="td-check"><input type="checkbox" checked={f.onlyOpen} onChange={set('onlyOpen')} /> {t.onlyOpen}</label>
        <label className="td-check"><input type="checkbox" checked={f.onlyFav} onChange={set('onlyFav')} /> {t.onlyFav}</label>
        <button className="btn btn-ghost btn-sm" onClick={() => setF(EMPTY)}>{t.reset}</button>
      </div>

      {err && <p className="td-error">{err} <button className="btn btn-sm btn-secondary" onClick={load}>{t.retry}</button></p>}
      {!err && !data && <p>{t.loading}</p>}
      {data && <p className="td-muted">{t.found}: {data.total}</p>}
      {data && data.items.length === 0 && <p>{JSON.stringify(applied) === JSON.stringify(EMPTY) ? t.empty : t.emptyFiltered}</p>}
      <div className="td-list">
        {data?.items.map(lot => (
          <div key={lot.id} className="td-row" onClick={() => setOpenId(lot.id)} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && setOpenId(lot.id)}>
            <div className="td-row-main">
              <div className="td-row-title">
                {lot.is_demo && <span className="td-demo">{t.demo}</span>}
                {lot.is_new && <span className="td-new">NEW</span>} {lot.title}
              </div>
              <div className="td-muted">{lot.customer_name || '—'} · {lot.region_name || '—'} · {lot.method || '—'}</div>
              <div className="td-chips">{lot.directions.map(d => <span key={d} className="td-chip">{dirName(d)}</span>)}
                <span className="td-chip td-chip-st">{meta?.statuses?.find(s => s.id === lot.work_status)?.[lang]}</span></div>
            </div>
            <div className="td-row-side">
              <ScoreBadge lot={lot} t={t} />
              <div className="td-price">{fmtMoney(lot.total_price)}</div>
              <div className="td-muted"><Deadline iso={lot.deadline_at} t={t} /></div>
              <button className="td-star" onClick={(e) => toggleFav(lot, e)} aria-label={lot.favorite ? t.unfav : t.fav}>{lot.favorite ? '★' : '☆'}</button>
            </div>
          </div>
        ))}
      </div>
      {data && pages > 1 && (
        <div className="td-pager">
          <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>←</button>
          <span>{t.page} {page} / {pages}</span>
          <button className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>→</button>
        </div>
      )}
      {openId && <Detail id={openId} t={t} lang={lang} meta={meta} onClose={closeDetail} onChanged={load} />}
    </div>
  );
}

function Sources({ t, lang }) {
  const [src, setSrc] = useState(null); const [err, setErr] = useState(''); const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false); const [cfg, setCfg] = useState(null);
  const load = useCallback(() => { tendersAPI.sources().then(r => setSrc(r.sources)).catch(e => setErr(errorMessage(e))); tendersAPI.getSettings().then(setCfg).catch(() => {}); }, []);
  useEffect(load, [load]);
  const run = async (fn) => {
    setBusy(true); setInfo(''); setErr('');
    try { const r = await fn(); setInfo(`${t.imported}: ${t.fetched} ${r.fetched}, ${t.inserted} ${r.inserted}, ${t.updated} ${r.updated}, ${t.unchanged} ${r.unchanged}`); }
    catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); load(); }
  };
  const onFile = (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { let json; try { json = JSON.parse(reader.result); } catch { setErr('Файл не является корректным JSON'); return; } run(() => tendersAPI.importFile(json)); };
    reader.readAsText(file);
  };
  const saveWeights = async () => {
    setBusy(true); setErr('');
    try { const r = await tendersAPI.saveSettings({ weights: cfg.weights }); setCfg(r.config); setInfo(`${t.imported}: ${r.rescored}`); }
    catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <div>
      <h3>{t.srcTitle}</h3>
      {err && <p className="td-error">{err}</p>}
      {info && <p className="td-ok">{info}</p>}
      {!src && !err && <p>{t.loading}</p>}
      <div className="td-sources">
        {src?.map(s => (
          <div key={s.id} className={`td-src td-src-${s.state}`}>
            <div className="td-src-head"><strong>{s.label[lang]}</strong> <span className="td-state">{SOURCE_STATE_LABELS[lang][s.state] || s.state}</span></div>
            <p className="td-muted">{s.message}</p>
            <p className="td-muted">{t.lastOk}: {s.last_success_at ? fmtDate(s.last_success_at, lang) : t.never}</p>
            {s.last_error && <p className="td-error">{t.lastError}: {s.last_error}</p>}
            {s.id === 'portal-file' && (
              <><p className="td-muted">{t.importHint}</p>
                <label className="btn btn-primary btn-sm td-file">{t.importFile}<input type="file" accept="application/json,.json" onChange={onFile} disabled={busy} hidden /></label></>
            )}
            {s.id === 'demo' && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run(tendersAPI.syncDemo)}>{t.loadDemo}</button>}
          </div>
        ))}
      </div>
      {cfg && (
        <div className="td-settings">
          <h3>{t.settings}</h3><p className="td-muted">{t.settingsHint}</p>
          <div className="td-weights">
            {Object.entries(cfg.weights).map(([k, v]) => (
              <label key={k}>{t.factors[k]}
                <input className="input" type="number" min="0" max="100" value={v}
                  onChange={e => setCfg({ ...cfg, weights: { ...cfg.weights, [k]: Number(e.target.value) } })} />
              </label>
            ))}
          </div>
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={saveWeights}>{t.apply}</button>
        </div>
      )}
    </div>
  );
}

export default function Tenders() {
  const { isAuthenticated, loading } = useAuth();
  const [lang, setLang] = useState(getLang);
  const [tab, setTab] = useState('dash');
  const [access, setAccess] = useState('checking');   // checking | ok | forbidden | login | error
  const [meta, setMeta] = useState(null);
  const t = T[lang];
  useEffect(() => { try { localStorage.setItem('tenders_lang', lang); } catch { /* приватный режим */ } }, [lang]);
  useEffect(() => {
    if (loading || !isAuthenticated) return;
    tendersAPI.access().then(() => tendersAPI.meta()).then(m => { setMeta(m); setAccess('ok'); })
      .catch(e => setAccess(e?.response?.status === 403 ? 'forbidden' : e?.response?.status === 401 ? 'login' : 'error'));
  }, [isAuthenticated, loading]);
  const state = loading ? 'checking' : !isAuthenticated ? 'login' : access;

  return (
    <div className="container td-page">
      <div className="td-head">
        <div><h1>{t.title}</h1><p className="td-muted">{t.subtitle}</p></div>
        <div className="td-lang" role="group" aria-label={t.lang}>
          {['ru', 'kk'].map(l => <button key={l} className={`btn btn-sm ${lang === l ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setLang(l)}>{l === 'ru' ? 'RU' : 'KZ'}</button>)}
        </div>
      </div>
      {state === 'checking' && <p>{t.loading}</p>}
      {state === 'login' && <p>{t.needLogin}</p>}
      {state === 'forbidden' && <p>{t.noAccess}</p>}
      {state === 'error' && <p className="td-error">{t.retry}</p>}
      {state === 'ok' && (
        <>
          <div className="td-tabs" role="tablist">
            {['dash', 'lots', 'sources'].map(k => <button key={k} role="tab" aria-selected={tab === k} className={`td-tab${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>{t.tabs[k]}</button>)}
          </div>
          {tab === 'dash' && <Dashboard t={t} setTab={setTab} />}
          {tab === 'lots' && <Lots t={t} lang={lang} meta={meta} />}
          {tab === 'sources' && <Sources t={t} lang={lang} />}
        </>
      )}
    </div>
  );
}
