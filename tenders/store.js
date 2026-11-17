// Хранилище: два одинаковых по интерфейсу варианта. memory — для тестов и локальной проверки, supabase — для работы.
// Фильтрация и сортировка делаются в сервисе (JS), чтобы логика была одна и та же. Объём MVP небольшой (до TENDERS_MAX_ROWS).

export function createMemoryStore() {
  const lots = new Map();      // id -> row
  const key = (s, e) => `${s}\u0001${e}`;
  const byKey = new Map();
  const favs = new Set();      // `${user}|${lot}`
  const states = new Map();
  const log = [];
  const settings = new Map();
  let seq = 0;
  return {
    kind: 'memory',
    async listLots() { return [...lots.values()].map(r => ({ ...r })); },
    async getLot(id) { const r = lots.get(id); return r ? { ...r } : null; },
    async signatures(source) {
      const m = new Map();
      for (const r of lots.values()) if (r.source === source) m.set(r.external_id, { id: r.id, sig: r.sig, score: r.score });
      return m;
    },
    async upsertLots(rows) {
      for (const r of rows) {
        const k = key(r.source, r.external_id), id = byKey.get(k) || `lot-${++seq}`;
        const prev = lots.get(id);
        lots.set(id, { ...(prev || { first_seen_at: new Date().toISOString() }), ...r, id, synced_at: new Date().toISOString() });
        byKey.set(k, id);
      }
    },
    async favorites(user) { return new Set([...favs].filter(x => x.startsWith(user + '|')).map(x => x.split('|')[1])); },
    async setFavorite(user, lot, on) { const k = `${user}|${lot}`; if (on) favs.add(k); else favs.delete(k); },
    async states() { return new Map([...states].map(([k, v]) => [k, { ...v }])); },
    async setState(lot, patch) { states.set(lot, { ...(states.get(lot) || { status: 'new', note: null }), ...patch, lot_id: lot, updated_at: new Date().toISOString() }); },
    async addLog(entry) { const e = { id: ++seq, started_at: new Date().toISOString(), ...entry }; log.push(e); return e.id; },
    async finishLog(id, patch) { Object.assign(log.find(x => x.id === id) || {}, patch, { finished_at: new Date().toISOString() }); },
    async listLog(limit = 30) { return [...log].reverse().slice(0, limit).map(x => ({ ...x })); },
    async getSetting(k) { return settings.has(k) ? settings.get(k) : null; },
    async setSetting(k, v) { settings.set(k, v); },
  };
}

export function createSupabaseStore(sb, { dbCall, maxRows = 5000 } = {}) {
  const call = dbCall || (async (_l, fn) => { const { data, error } = await fn(); if (error) throw new Error(error.message); return data; });
  const T = n => sb.from(n);
  return {
    kind: 'supabase',
    async listLots() {
      const out = [];
      for (let from = 0; from < maxRows; from += 1000) {
        const data = await call('tender: чтение лотов', () => T('tender_lots').select('*').order('id').range(from, Math.min(from + 999, maxRows - 1)));
        out.push(...data); if (data.length < 1000) break;
      }
      return out;
    },
    async getLot(id) { const d = await call('tender: лот', () => T('tender_lots').select('*').eq('id', id).maybeSingle()); return d || null; },
    async signatures(source) {
      const m = new Map();
      for (let from = 0; from < maxRows; from += 1000) {
        const data = await call('tender: отпечатки', () => T('tender_lots').select('id,external_id,sig,score').eq('source', source).order('id').range(from, from + 999));
        for (const r of data) m.set(r.external_id, { id: r.id, sig: r.sig, score: r.score });
        if (data.length < 1000) break;
      }
      return m;
    },
    async upsertLots(rows) {
      for (let i = 0; i < rows.length; i += 100)
        await call('tender: запись лотов', () => T('tender_lots').upsert(rows.slice(i, i + 100).map(r => ({ ...r, synced_at: new Date().toISOString() })), { onConflict: 'source,external_id' }));
    },
    async favorites(user) { const d = await call('tender: избранное', () => T('tender_favorites').select('lot_id').eq('user_id', user)); return new Set(d.map(r => r.lot_id)); },
    async setFavorite(user, lot, on) {
      if (on) await call('tender: в избранное', () => T('tender_favorites').upsert({ user_id: user, lot_id: lot }, { onConflict: 'user_id,lot_id' }));
      else await call('tender: из избранного', () => T('tender_favorites').delete().eq('user_id', user).eq('lot_id', lot));
    },
    async states() { const d = await call('tender: статусы', () => T('tender_lot_state').select('*')); return new Map(d.map(r => [r.lot_id, r])); },
    async setState(lot, patch) { await call('tender: статус', () => T('tender_lot_state').upsert({ lot_id: lot, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'lot_id' })); },
    async addLog(entry) { const d = await call('tender: журнал', () => T('tender_sync_log').insert(entry).select('id').single()); return d.id; },
    async finishLog(id, patch) { await call('tender: журнал', () => T('tender_sync_log').update({ ...patch, finished_at: new Date().toISOString() }).eq('id', id)); },
    async listLog(limit = 30) { return call('tender: журнал', () => T('tender_sync_log').select('*').order('started_at', { ascending: false }).limit(limit)); },
    async getSetting(k) { const d = await call('tender: настройки', () => T('tender_settings').select('value').eq('key', k).maybeSingle()); return d ? d.value : null; },
    async setSetting(k, v) { await call('tender: настройки', () => T('tender_settings').upsert({ key: k, value: v, updated_at: new Date().toISOString() }, { onConflict: 'key' })); },
  };
}
