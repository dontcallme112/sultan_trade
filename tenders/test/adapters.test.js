import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePortalLots } from '../adapters/portalFile.js';
import { createAdapters } from '../adapters/index.js';
import { NOW } from './helpers.js';

const real = JSON.parse(readFileSync(new URL('./fixtures/portal-lots.sample.json', import.meta.url)));

test('реальный файл портала разбирается целиком', () => {
  const { lots, skipped } = parsePortalLots(real);
  assert.equal(lots.length + skipped, real.results.length);
  assert.equal(skipped, 0);
  const l = lots[0];
  assert.equal(l.source, 'portal-file'); assert.equal(l.external_id, '43424309');
  assert.equal(l.total_price, 49600); assert.equal(l.method, 'Запрос ценовых предложений');
  assert.equal(l.region_code, '711310000'); assert.ok(l.customer_bin);
  assert.equal(l.is_demo, false); assert.equal(l.url, null);   // ссылку не выдумываем
  assert.ok(l.directions.includes('it'));
});

test('битый файл даёт понятную ошибку', () => {
  assert.throws(() => parsePortalLots({ foo: 1 }), /results/);
  assert.throws(() => parsePortalLots('x'), /results/);
});

test('лоты без id/названия пропускаются, а не ломают импорт', () => {
  const r = parsePortalLots({ results: [{ name_ru: 'Нет id' }, { external_id: 1, name_ru: 'Камеры видеонаблюдения', total_price: 5 }] });
  assert.equal(r.lots.length, 1); assert.equal(r.skipped, 1);
});

test('официальные источники отключены и не делают запросов', async () => {
  const a = createAdapters({ env: {}, now: () => NOW });
  for (const id of ['goszakup-api', 'zakup-sk']) {
    assert.equal(a.get(id).status().state, 'needs_connection');
    await assert.rejects(() => a.get(id).fetch(), e => e.code === 'NOT_CONNECTED');
  }
  const withToken = createAdapters({ env: { GOSZAKUP_API_TOKEN: 'x' } });
  assert.equal(withToken.get('goszakup-api').status().state, 'not_implemented');
  await assert.rejects(() => withToken.get('goszakup-api').fetch(), e => e.code === 'NOT_CONNECTED');
});

test('демо-лоты помечены как демо', async () => {
  const lots = await createAdapters({ now: () => NOW }).get('demo').fetch();
  assert.ok(lots.length >= 10);
  assert.ok(lots.every(l => l.is_demo && l.source === 'demo' && l.external_id.startsWith('DEMO-')));
});
