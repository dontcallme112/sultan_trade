import test from 'node:test';
import assert from 'node:assert/strict';
import { fmtMoney, deadlineLeft, scoreBand, buildQuery, fmtDate } from '../src/pages/tenders/format.js';
import { T } from '../src/pages/tenders/i18n.js';

test('деньги и даты не падают на пустом', () => {
  assert.equal(fmtMoney(null), '—'); assert.equal(fmtMoney('abc'), '—');
  assert.match(fmtMoney(1234567), /1.234.567 ₸/);
  assert.equal(fmtDate(null), '—'); assert.equal(fmtDate('мусор'), '—');
});
test('срок: прошёл / осталось', () => {
  const now = Date.parse('2026-09-30T00:00:00Z');
  assert.deepEqual(deadlineLeft('2026-09-29T00:00:00Z', now), { expired: true, days: 0, hours: 0 });
  assert.deepEqual(deadlineLeft('2026-10-02T05:00:00Z', now), { expired: false, days: 2, hours: 5 });
  assert.equal(deadlineLeft(null, now), null);
});
test('полосы рейтинга', () => {
  assert.equal(scoreBand(null), 'none'); assert.equal(scoreBand(0), 'low'); assert.equal(scoreBand(40), 'mid'); assert.equal(scoreBand(70), 'high');
});
test('запрос: пустые фильтры не уходят, флаги в строку', () => {
  assert.deepEqual(buildQuery({ q: '  ', onlyOpen: true, direction: 'cctv', minPrice: '1000', onlyFav: false }, 2),
    { page: 2, limit: 25, direction: 'cctv', minPrice: '1000', onlyOpen: 'true' });
});
test('ru и kk содержат одинаковые ключи (нет непереведённых строк)', () => {
  const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`])).sort();
  assert.deepEqual(keys(T.ru), keys(T.kk));
});
