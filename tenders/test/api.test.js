import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeApp, listen } from './helpers.js';

const real = readFileSync(new URL('./fixtures/portal-lots.sample.json', import.meta.url), 'utf8');
const boss = 'token:u1:boss@example.com', stranger = 'token:u2:shopper@example.com';

async function setup(opts) { const m = makeApp(opts); const s = await listen(m.app); return { ...m, ...s }; }

test('доступ: аноним 401, чужой аккаунт 403, пустой список почт закрывает всех, секрет пускает', async () => {
  const t = await setup();
  assert.equal((await t.call('GET', '/api/tenders')).status, 401);
  assert.equal((await t.call('GET', '/api/tenders', { token: stranger })).status, 403);
  assert.equal((await t.call('GET', '/api/tenders', { token: boss })).status, 200);
  assert.equal((await t.call('GET', '/api/tenders', { secret: 'S3CRET' })).status, 200);
  assert.equal((await t.call('GET', '/api/tenders', { secret: 'wrong' })).status, 401);
  await t.close();
  const closed = await setup({ allowed: [] });
  assert.equal((await closed.call('GET', '/api/tenders', { token: boss })).status, 403);
  await closed.close();
  const noSecret = await setup({ allowed: [], secret: '' });
  assert.equal((await noSecret.call('GET', '/api/tenders', { secret: '' })).status, 401);
  await noSecret.close();
});

test('демо-синк, список, фильтры, сортировка, пагинация', async () => {
  const t = await setup();
  const sync = await t.call('POST', '/api/tenders/sync/demo', { token: boss });
  assert.equal(sync.status, 200); assert.equal(sync.json.inserted, 12);
  const all = await t.call('GET', '/api/tenders?limit=100', { token: boss });
  assert.equal(all.json.total, 12);
  assert.ok(all.json.items.every(i => i.is_demo));
  // сортировка по баллу по убыванию
  const sc = all.json.items.map(i => i.score ?? -1);
  assert.deepEqual(sc, [...sc].sort((a, b) => b - a));
  const cctv = await t.call('GET', '/api/tenders?direction=cctv', { token: boss });
  assert.ok(cctv.json.total >= 2 && cctv.json.items.every(i => i.directions.includes('cctv')));
  assert.equal((await t.call('GET', '/api/tenders?q=пожарн', { token: boss })).json.total, 1);
  assert.ok((await t.call('GET', '/api/tenders?onlyOpen=true', { token: boss })).json.total === 11);
  const price = await t.call('GET', '/api/tenders?minPrice=5000000&maxPrice=10000000', { token: boss });
  assert.ok(price.json.items.every(i => i.total_price >= 5000000 && i.total_price <= 10000000));
  const p2 = await t.call('GET', '/api/tenders?limit=5&page=3', { token: boss });
  assert.equal(p2.json.items.length, 2);
  await t.close();
});

test('повторный синк ничего не пишет заново (экономия Disk IO)', async () => {
  const t = await setup();
  await t.call('POST', '/api/tenders/sync/demo', { token: boss });
  const again = await t.call('POST', '/api/tenders/sync/demo', { token: boss });
  assert.equal(again.json.unchanged, 12); assert.equal(again.json.inserted, 0); assert.equal(again.json.updated, 0);
  await t.close();
});

test('импорт реального файла портала, журнал и даты синка', async () => {
  const t = await setup();
  const imp = await t.call('POST', '/api/tenders/import', { token: boss, body: real, raw: true });
  assert.equal(imp.status, 200); assert.equal(imp.json.inserted, 50);
  const src = (await t.call('GET', '/api/tenders/sources', { token: boss })).json.sources;
  const pf = src.find(s => s.id === 'portal-file');
  assert.equal(pf.last_ok, true); assert.ok(pf.last_success_at);
  assert.equal(src.find(s => s.id === 'goszakup-api').state, 'needs_connection');
  assert.equal(src.find(s => s.id === 'zakup-sk').last_sync_at, null);
  await t.close();
});

test('неподключённый источник даёт 409 и ошибку в журнале, сервер жив', async () => {
  const t = await setup();
  const r = await t.call('POST', '/api/tenders/sync/goszakup-api', { token: boss });
  assert.equal(r.status, 409);
  const src = (await t.call('GET', '/api/tenders/sources', { token: boss })).json.sources.find(s => s.id === 'goszakup-api');
  assert.equal(src.last_ok, false); assert.ok(src.last_error); assert.equal(src.last_success_at, null);
  const dash = (await t.call('GET', '/api/tenders/dashboard', { token: boss })).json;
  assert.equal(dash.sync_errors.length, 1);
  assert.equal((await t.call('POST', '/api/tenders/sync/nope', { token: boss })).status, 404);
  assert.equal((await t.call('POST', '/api/tenders/import', { token: boss, body: '{"x":1}', raw: true })).status, 400);
  await t.close();
});

test('избранное личное, статус общий и валидируется', async () => {
  const t = await setup({ allowed: ['boss@example.com', 'second@example.com'] });
  await t.call('POST', '/api/tenders/sync/demo', { token: boss });
  const id = (await t.call('GET', '/api/tenders', { token: boss })).json.items[0].id;
  assert.equal((await t.call('PUT', `/api/tenders/${id}/favorite`, { token: boss })).status, 200);
  assert.equal((await t.call('GET', `/api/tenders/${id}`, { token: boss })).json.favorite, true);
  assert.equal((await t.call('GET', `/api/tenders/${id}`, { token: 'token:u3:second@example.com' })).json.favorite, false);
  assert.equal((await t.call('GET', '/api/tenders?onlyFav=true', { token: boss })).json.total, 1);
  await t.call('DELETE', `/api/tenders/${id}/favorite`, { token: boss });
  assert.equal((await t.call('GET', '/api/tenders?onlyFav=true', { token: boss })).json.total, 0);
  const st = await t.call('PUT', `/api/tenders/${id}/state`, { token: boss, body: { status: 'participating', note: 'Звонил заказчику' } });
  assert.equal(st.json.work_status, 'participating');
  assert.equal((await t.call('GET', `/api/tenders/${id}`, { token: 'token:u3:second@example.com' })).json.work_status, 'participating');
  assert.equal((await t.call('PUT', `/api/tenders/${id}/state`, { token: boss, body: { status: 'bogus' } })).status, 400);
  assert.equal((await t.call('PUT', '/api/tenders/zzz/state', { token: boss, body: { status: 'won' } })).status, 404);
  assert.equal((await t.call('GET', '/api/tenders/zzz', { token: boss })).status, 404);
  await t.close();
});

test('панель показывает нужные счётчики', async () => {
  const t = await setup();
  await t.call('POST', '/api/tenders/sync/demo', { token: boss });
  const d = (await t.call('GET', '/api/tenders/dashboard', { token: boss })).json;
  assert.equal(d.found, 12); assert.equal(d.open, 11); assert.equal(d.has_demo, true);
  assert.ok(d.nearest.length > 0 && d.nearest.length <= 5);
  const times = d.nearest.map(n => Date.parse(n.deadline_at)); assert.deepEqual(times, [...times].sort((a, b) => a - b));
  assert.equal(d.sync_errors.length, 0);
  await t.close();
});

test('смена весов пересчитывает оценки; плохие настройки отклоняются', async () => {
  const t = await setup();
  await t.call('POST', '/api/tenders/sync/demo', { token: boss });
  const before = (await t.call('GET', '/api/tenders?limit=100', { token: boss })).json.items.map(i => i.score);
  const bad = await t.call('PUT', '/api/tenders/settings', { token: boss, body: { weights: { price: 999 } } });
  assert.equal(bad.status, 400);
  const ok = await t.call('PUT', '/api/tenders/settings', { token: boss, body: { weights: { direction: 100, price: 0, deadline: 0, region: 0, method: 0, status: 0 } } });
  assert.equal(ok.status, 200); assert.ok(ok.json.rescored > 0);
  const after = (await t.call('GET', '/api/tenders?limit=100', { token: boss })).json.items.map(i => i.score);
  assert.notDeepEqual(before, after);
  await t.close();
});
