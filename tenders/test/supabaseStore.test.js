import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseStore } from '../store.js';
import { createTenderService } from '../service.js';
import { createAdapters } from '../adapters/index.js';
import { NOW } from './helpers.js';

// Минимальная имитация supabase-js: достаточно для методов, которые использует store.js.
function fakeSupabase(failTimes = 0) {
  const tables = {}; const writes = { n: 0 }; let fails = failTimes; let seq = 0;
  const conflictCols = { tender_lots: ['source', 'external_id'], tender_favorites: ['user_id', 'lot_id'], tender_lot_state: ['lot_id'], tender_settings: ['key'] };
  const from = (name) => {
    const rows = tables[name] ||= [];
    const st = { filters: [], op: 'select', payload: null, range: null, single: null, order: null, lim: null, conflict: null, sel: false };
    const run = () => {
      if (fails > 0 && st.op !== 'select') { fails--; return { data: null, error: { message: 'upstream request timeout', code: '57014' } }; }
      let out;
      const match = r => st.filters.every(([c, v]) => r[c] === v);
      if (st.op === 'select') {
        out = rows.filter(match);
        if (st.order) out = [...out].sort((a, b) => (String(a[st.order.c]) < String(b[st.order.c]) ? -1 : 1) * (st.order.asc ? 1 : -1));
        if (st.range) out = out.slice(st.range[0], st.range[1] + 1);
        if (st.lim) out = out.slice(0, st.lim);
        out = out.map(r => ({ ...r }));
      } else if (st.op === 'upsert' || st.op === 'insert') {
        writes.n++;
        const list = Array.isArray(st.payload) ? st.payload : [st.payload]; out = [];
        for (const p of list) {
          const cols = st.op === 'upsert' ? st.conflict : null;
          const prev = cols && rows.find(r => cols.every(c => r[c] === p[c]));
          if (prev) { Object.assign(prev, p); out.push(prev); }
          else { const row = { ...p }; if (name === 'tender_lots') row.id = row.id || `id-${++seq}`; if (name === 'tender_sync_log') row.id = ++seq; if (name === 'tender_lots') row.first_seen_at ||= new Date().toISOString(); rows.push(row); out.push(row); }
        }
      } else if (st.op === 'update') { writes.n++; out = rows.filter(match); out.forEach(r => Object.assign(r, st.payload)); }
      else if (st.op === 'delete') { writes.n++; const keep = rows.filter(r => !match(r)); rows.length = 0; rows.push(...keep); out = []; }
      if (st.single === 'single') return { data: out[0], error: null };
      if (st.single === 'maybe') return { data: out[0] || null, error: null };
      return { data: out, error: null };
    };
    const q = {
      select: () => { st.sel = true; return q; }, eq: (c, v) => { st.filters.push([c, v]); return q; },
      order: (c, o = {}) => { st.order = { c, asc: o.ascending !== false }; return q; },
      range: (a, b) => { st.range = [a, b]; return q; }, limit: n => { st.lim = n; return q; },
      single: () => { st.single = 'single'; return q; }, maybeSingle: () => { st.single = 'maybe'; return q; },
      upsert: (p, o) => { st.op = 'upsert'; st.payload = p; st.conflict = o?.onConflict?.split(',') || conflictCols[name]; return q; },
      insert: p => { st.op = 'insert'; st.payload = p; return q; },
      update: p => { st.op = 'update'; st.payload = p; return q; }, delete: () => { st.op = 'delete'; return q; },
      then: (res, rej) => Promise.resolve(run()).then(res, rej),
    };
    return q;
  };
  return { from, tables, writes };
}

const retrying = () => {
  // как dbCall в server.js: ошибки supabase превращаем в исключения, повторяем без пауз
  const call = async (label, fn, tries = 3) => {
    for (let n = 1; ; n++) {
      const { data, error } = await fn();
      if (!error) return data;
      if (n >= tries) throw new Error(error.message);
    }
  };
  return call;
};

test('Supabase-хранилище: полный цикл синка, повтор не пишет, избранное, статус, настройки', async () => {
  const sb = fakeSupabase();
  const store = createSupabaseStore(sb, { dbCall: retrying() });
  const service = createTenderService({ store, adapters: createAdapters({ now: () => NOW }), now: () => NOW });
  const r1 = await service.sync('demo');
  assert.equal(r1.inserted, 12);
  assert.equal(sb.tables.tender_lots.length, 12);
  assert.equal(sb.tables.tender_sync_log.at(-1).ok, true);
  const w = sb.writes.n;
  const r2 = await service.sync('demo');
  assert.equal(r2.unchanged, 12);
  assert.equal(sb.writes.n - w, 2, 'повторный синк пишет только журнал (insert + update)');
  const lot = (await service.list('u1', {})).items[0];
  await service.setFavorite('u1', lot.id, true);
  assert.equal((await service.list('u1', { onlyFav: 'true' })).total, 1);
  await service.setFavorite('u1', lot.id, false);
  assert.equal((await service.list('u1', { onlyFav: 'true' })).total, 0);
  await service.setWorkState('u1', lot.id, { status: 'won', note: 'ok' });
  assert.equal((await service.get('u1', lot.id)).work_status, 'won');
  await service.saveScoring({ weights: { price: 5 } });
  assert.equal((await store.getSetting('scoring')).weights.price, 5);
});

test('Supabase-хранилище: временный сбой записи переживается повтором, постоянный пишется в журнал как ошибка', async () => {
  const sb = fakeSupabase(1);
  const store = createSupabaseStore(sb, { dbCall: retrying() });
  const service = createTenderService({ store, adapters: createAdapters({ now: () => NOW }), now: () => NOW });
  // первый write (insert журнала) падает один раз, повтор проходит
  assert.equal((await service.sync('demo')).inserted, 12);
  const sb2 = fakeSupabase();
  const store2 = createSupabaseStore(sb2, { dbCall: retrying() });
  const svc2 = createTenderService({ store: store2, adapters: createAdapters({}), now: () => NOW });
  await assert.rejects(() => svc2.sync('zakup-sk'), /не подключён/);
  assert.equal(sb2.tables.tender_sync_log.at(-1).ok, false);
  assert.match(sb2.tables.tender_sync_log.at(-1).error, /не подключён/);
});
