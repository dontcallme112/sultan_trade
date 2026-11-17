import {createDocumentWorkspace} from './document-workspace.js';
import {compareSuppliers,calculateExtendedRating} from './suppliers.js';
import { calculateFinance, validateOffers } from './finance.js';
import { uiQuery, uiLot } from './compat.js';
import { createHash } from 'node:crypto';
import { scoreLot, isClosed, mergeScoring, validateScoring } from './scoring.js';
import { DIRECTION_IDS } from './directions.js';

export const LOT_STATUSES = ['new', 'review', 'interesting', 'preparing', 'participating', 'won', 'lost', 'rejected'];
export const LOT_STATUS_LABELS = {
  ru: { new: 'Новый', review: 'На анализе', interesting: 'Интересный', preparing: 'Готовим заявку', participating: 'Участвуем', won: 'Выигран', lost: 'Проигран', rejected: 'Отклонён' },
  kk: { new: 'Жаңа', review: 'Талдауда', interesting: 'Қызықты', preparing: 'Өтінім дайындаудамыз', participating: 'Қатысамыз', won: 'Жеңдік', lost: 'Ұтылдық', rejected: 'Қабылданбады' },
};

const SIG_FIELDS = ['number', 'title', 'description', 'customer_name', 'customer_bin', 'region_code', 'region_name', 'method', 'status_raw', 'total_price', 'quantity', 'published_at', 'deadline_at', 'url'];
export const lotSig = l => createHash('sha1').update(SIG_FIELDS.map(f => (l[f] == null ? '' : String(l[f]))).join('\u0001') + '\u0002' + (l.directions || []).join(',')).digest('hex').slice(0, 16);

export function createTenderService({ store, adapters, now = () => Date.now(), maxRows = 5000 }) {
  const documentWorkspace=createDocumentWorkspace({store,now});
  let scoringCache = null;
  const getScoring = async () => scoringCache || (scoringCache = mergeScoring(await store.getSetting('scoring')));

  async function sync(sourceId, input) {
    const ad = adapters.get(sourceId);
    if (!ad) throw Object.assign(new Error('Неизвестный источник'), { status: 404 });
    const logId = await store.addLog({ source: sourceId, ok: false });
    const stat = { fetched: 0, inserted: 0, updated: 0, unchanged: 0 };
    try {
      const preview = sourceId === 'portal-file' ? ad.parse(input) : null;
      const lots = preview ? preview.lots : await ad.fetch(input);
      stat.fetched = lots.length;
      if (lots.length > maxRows) throw new Error(`Слишком много лотов (${lots.length} > ${maxRows}) для MVP`);
      const cfg = await getScoring();
      const known = await store.signatures(sourceId);
      const t = now(), rows = [];
      for (const l of lots) {
        const sig = lotSig(l), prev = known.get(l.external_id);
        const sc = scoreLot(l, cfg, t);
        const row = { ...l, sig, score: sc.score, score_confidence: sc.confidence, score_detail: sc };
        // Оценка зависит от времени (срок), поэтому строку пишем, если изменились данные ИЛИ оценка. Иначе пропускаем: экономим запись в БД.
        if (prev && prev.sig === sig && prev.score === sc.score) { stat.unchanged++; continue; }
        prev ? stat.updated++ : stat.inserted++;
        rows.push(row);
      }
            if (rows.length) await store.upsertLots(rows);
      await store.finishLog(logId, { ok: true, ...stat });
      return { ok: true, ...stat, ...(preview ? {skipped:preview.skipped,duplicates:preview.duplicates} : {}) };
    } catch (e) {
      await store.finishLog(logId, { ok: false, ...stat, error: String(e.message || e).slice(0, 500) }).catch(() => {});
      throw e;
    }
  }

  const view = (l, ctx) => {
    const { favs, states, t } = ctx;
    const st = states.get(l.id);
    return {
      id: l.id, source: l.source, is_demo: !!l.is_demo, number: l.number, title: l.title, description: l.description,
      customer_name: l.customer_name, customer_bin: l.customer_bin, region_name: l.region_name, region_code: l.region_code,
      method: l.method, status_raw: l.status_raw, total_price: l.total_price == null ? null : Number(l.total_price), quantity: l.quantity == null ? null : Number(l.quantity),
      published_at: l.published_at, deadline_at: l.deadline_at, url: l.url, directions: l.directions || [],
      extra: l.extra || {}, score: l.score, score_confidence: l.score_confidence, score_detail: l.score_detail,
      is_open: !isClosed(l, t), is_new: !!l.first_seen_at && t - new Date(l.first_seen_at).getTime() < 3 * 86400000,
      favorite: favs.has(l.id), work_status: st?.status || 'new', note: st?.note || null,
      first_seen: l.first_seen_at,
    };
  };

  async function ctxFor(user) { return { favs: user ? await store.favorites(user) : new Set(), states: await store.states(), t: now() }; }

  async function list(user, q = {}) {
    q = uiQuery(q);
    const ctx = await ctxFor(user);
    let rows = (await store.listLots()).map(l => view(l, ctx));
    const all = [...rows];
    const text = String(q.q || '').trim().toLowerCase();
    const num = v => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    const dirs = String(q.direction || '').split(',').filter(d => DIRECTION_IDS.includes(d));
    const minP = num(q.minPrice), maxP = num(q.maxPrice), minS = num(q.minScore);
    const before = q.deadlineBefore ? new Date(q.deadlineBefore).getTime() : null;
    rows = rows.filter(r => {
      if (text && !`${r.title} ${r.description || ''} ${r.customer_name || ''} ${r.number || ''}`.toLowerCase().includes(text)) return false;
      if (dirs.length && !r.directions.some(d => dirs.includes(d))) return false;
      if (q.source && r.source !== q.source) return false;
      if (q.customer && !String(r.customer_name || '').toLowerCase().includes(String(q.customer).toLowerCase())) return false;
      if (q.method && r.method !== q.method) return false;
      if (q.region && !String(r.region_name || '').toLowerCase().includes(String(q.region).toLowerCase())) return false;
      if (q.workStatus && r.work_status !== q.workStatus) return false;
      if (minP != null && !(r.total_price != null && r.total_price >= minP)) return false;
      if (maxP != null && !(r.total_price != null && r.total_price <= maxP)) return false;
      if (minS != null && !(r.score != null && r.score >= minS)) return false;
      if (before && !(r.deadline_at && new Date(r.deadline_at).getTime() <= before)) return false;
      if (q.onlyOpen === 'true' && !r.is_open) return false;
      if (q.onlyFav === 'true' && !r.favorite) return false;
      return true;
    });
    const sorts = {
      score: (a, b) => (b.score ?? -1) - (a.score ?? -1),
      deadline: (a, b) => (a.deadline_at ? new Date(a.deadline_at).getTime() : Infinity) - (b.deadline_at ? new Date(b.deadline_at).getTime() : Infinity),
      price: (a, b) => (b.total_price ?? -1) - (a.total_price ?? -1),
      published: (a, b) => (b.published_at ? new Date(b.published_at).getTime() : 0) - (a.published_at ? new Date(a.published_at).getTime() : 0),
    };
    rows.sort(sorts[q.sort] || sorts.score);
    const limit = Math.min(Math.max(parseInt(q.limit, 10) || 25, 1), 100);
    const page = Math.max(parseInt(q.page, 10) || 1, 1);
    return { total: rows.length, page, limit, pages:Math.ceil(rows.length/limit), items: rows.slice((page - 1) * limit, page * limit).map(uiLot),
      regions:[...new Set(all.map(r=>r.region_name).filter(Boolean))], methods:[...new Set(all.map(r=>r.method).filter(Boolean))],
      summary:{total:all.length,new:all.filter(r=>r.is_new).length, favorites:all.filter(r=>r.favorite).length,
        high:all.filter(r=>r.is_open && r.score >= 80).length,
        upcoming:all.filter(r=>r.is_open && r.deadline_at && Date.parse(r.deadline_at)>ctx.t && Date.parse(r.deadline_at)<=ctx.t+7*86400000).length} };
  }

  async function get(user, id) {
    const l = await store.getLot(id); if (!l) return null;
    return uiLot(view(l, await ctxFor(user)));
  }

  async function dashboard(user) {
    const ctx = await ctxFor(user);
    const all = (await store.listLots()).map(l => view(l, ctx));
    const open = all.filter(r => r.is_open);
    const log = await store.listLog(50);
    const lastBySource = {};
    for (const e of log) if (!lastBySource[e.source]) lastBySource[e.source] = e;
    const errors = Object.values(lastBySource).filter(e => e.finished_at && !e.ok);
    return {
      found: all.length, open: open.length,
      new: all.filter(r => r.is_new).length,
      high: open.filter(r => r.score != null && r.score >= 70).length,
      favorites: all.filter(r => r.favorite).length,
      nearest: open.filter(r => r.deadline_at).sort((a, b) => new Date(a.deadline_at) - new Date(b.deadline_at)).slice(0, 5)
        .map(r => ({ id: r.id, title: r.title, deadline_at: r.deadline_at, score: r.score, is_demo: r.is_demo })),
      sync_errors: errors.map(e => ({ source: e.source, error: e.error, at: e.finished_at })),
      has_demo: all.some(r => r.is_demo),
    };
  }

  async function sources() {
    const log = await store.listLog(100);
    return [...adapters.values()].map(a => {
      const last = log.find(e => e.source === a.id), lastOk = log.find(e => e.source === a.id && e.ok);
      return { id: a.id, kind: a.kind, label: a.label, ...a.status(),
        last_sync_at: last?.finished_at || null, last_ok: last ? !!last.ok : null, last_error: last && !last.ok ? last.error : null,
        last_success_at: lastOk?.finished_at || null };
    });
  }

  async function setWorkState(user, id, { status, note }) {
    if (status !== undefined && !LOT_STATUSES.includes(status)) throw Object.assign(new Error('Недопустимый статус'), { status: 400 });
    if (note !== undefined && String(note).length > 2000) throw Object.assign(new Error('Заметка длиннее 2000 символов'), { status: 400 });
    if (!(await store.getLot(id))) throw Object.assign(new Error('Лот не найден'), { status: 404 });
    const patch = { updated_by: user };
    if (status !== undefined) patch.status = status;
    if (note !== undefined) patch.note = String(note);
    await store.setState(id, patch);
    return get(user, id);
  }

  async function setFavorite(user, id, on) {
    if (!(await store.getLot(id))) throw Object.assign(new Error('Лот не найден'), { status: 404 });
    await store.setFavorite(user, id, on);
    return { favorite: on };
  }

  async function getScoringConfig() { return getScoring(); }
  async function saveScoring(input) {
    const v = validateScoring(input);
    if (!v.ok) throw Object.assign(new Error(v.errors.join('; ')), { status: 400 });
    await store.setSetting('scoring', v.config); scoringCache = v.config;
    return v.config;
  }
  // Пересчёт оценок после смены весов
  async function rescore() {
    const cfg = await getScoring(), t = now(), rows = [];
    for (const l of await store.listLots()) {
      const sc = scoreLot(l, cfg, t);
      if (sc.score !== l.score || sc.confidence !== l.score_confidence) rows.push({ ...l, score: sc.score, score_confidence: sc.confidence, score_detail: sc });
    }
    if (rows.length) await store.upsertLots(rows);
    return { rescored: rows.length };
  }

  async function syncRuns() {
    const log = await store.listLog(50);
    return {runs:log.map(e=>({...e, source:e.source, status:e.ok ? 'success' : 'error', changed:(e.inserted || 0)+(e.updated || 0)})), last_success:log.find(e=>e.ok)?.finished_at || null};
  }

  async function previewImport(input) {
    const parsed=adapters.get('portal-file').parse(input);
    if(parsed.lots.length>maxRows)throw Object.assign(new Error('Слишком много лотов для одного импорта'),{status:400});
    return {total:parsed.total,accepted:parsed.lots.length,skipped:parsed.skipped,duplicates:parsed.duplicates,
      sample:parsed.lots.slice(0,5),warnings:['Файл загружен пользователем. Подлинность и актуальность нужно сверить с порталом.']};
  }
  async function getWorkspace(user,id) {
    if(!user)throw Object.assign(new Error('Нужен вход пользователя'),{status:401});
    if(!(await store.getLot(id)))throw Object.assign(new Error('Лот не найден'),{status:404});
    return await store.getSetting('workspace:'+user+':'+id) || {offers:[],finance:null,savedAt:null};
  }
  async function saveWorkspace(user,id,input) {
    const previous=await getWorkspace(user,id);
    const offers='offers' in input ? validateOffers(input.offers) : previous.offers;
    const finance='finance' in input ? (input.finance ? {inputs:input.finance,results:calculateFinance(input.finance)} : null) : previous.finance;
    const supplierAnalysis='supplierAnalysis' in input ? {inputs:input.supplierAnalysis,results:compareSuppliers(input.supplierAnalysis,{now:now()})} : previous.supplierAnalysis;
    const extendedRating='extendedRating' in input ? {inputs:input.extendedRating,results:calculateExtendedRating(input.extendedRating)} : previous.extendedRating;
    const value={...previous,offers,finance,...(supplierAnalysis?{supplierAnalysis}:{}),...(extendedRating?{extendedRating}:{}),savedAt:new Date(now()).toISOString(),savedBy:user,
      audit:[...(previous.audit || []).slice(-19),{at:new Date(now()).toISOString(),actor:user,action:'save_workspace'}]};
    if(JSON.stringify(value).length>100000)throw Object.assign(new Error('Рабочие данные слишком велики'),{status:400});
    await store.setSetting('workspace:'+user+':'+id,value);return value;
  }

  async function transferDocumentRequirements(user,id,{sha256,revision,rows}) {
    const saved=await documentWorkspace.get(user,id);
    if(!saved.document||saved.document.sha256!==sha256||saved.revision!==revision)throw Object.assign(new Error('Документ изменился. Обновите карточку.'),{status:409});
    if(!Array.isArray(rows)||!rows.length||rows.length>30)throw Object.assign(new Error('Выберите от 1 до 30 параметров'),{status:400});
    const workspace=await getWorkspace(user,id),previous=workspace.supplierAnalysis?.inputs||{model:'',requirements:[],offers:[]};
    const additions=rows.map(row=>{
      if(!row||typeof row!=='object')throw Object.assign(new Error('Некорректное требование'),{status:400});
      const r=Number.isInteger(row.index)&&saved.document.requirements[row.index];
      if(!r)throw Object.assign(new Error('Требование не найдено'),{status:400});
      return {key:row.key,op:row.op,value:row.value,unit:row.unit,evidence:{documentSha256:sha256,line:r.evidence.line,quote:r.evidence.quote,mapping:'manual_review_required'}};
    });
    const keys=new Set(previous.requirements.map(r=>r.key));
    for(const r of additions){if(keys.has(r.key))throw Object.assign(new Error('Параметр с таким названием уже есть. Задайте другое название.'),{status:409});keys.add(r.key);}
    return saveWorkspace(user,id,{supplierAnalysis:{...previous,requirements:[...previous.requirements,...additions]}});
  }

  return { transferDocumentRequirements, documentWorkspace, sync, list, get, dashboard, sources, syncRuns, previewImport, getWorkspace, saveWorkspace, setWorkState, setFavorite, getScoringConfig, saveScoring, rescore };
}
