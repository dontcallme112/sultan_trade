import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreLot, validateScoring, DEFAULT_SCORING, isClosed } from '../scoring.js';
import { classify } from '../directions.js';
import { NOW } from './helpers.js';

const day = 86400000;
const good = { title: 'IP-видеокамеры и регистратор', directions: ['cctv', 'it'], total_price: 2000000, region_code: '751110000', method: 'Запрос ценовых предложений', status_raw: 'Приём', deadline_at: new Date(NOW + 5 * day).toISOString() };

test('классификация направлений', () => {
  assert.deepEqual(classify('Поставка IP-камер для видеонаблюдения').ids[0], 'cctv');
  assert.ok(classify('Монтаж пожарной сигнализации и СОУЭ').ids.includes('fire'));
  assert.deepEqual(classify('Продукты питания').ids, ['other']);
});

test('хороший лот получает высокий балл и полную уверенность', () => {
  const s = scoreLot(good, undefined, NOW);
  assert.equal(s.score, 100); assert.equal(s.confidence, 100); assert.equal(s.preliminary, false);
});

test('нерелевантный лот получает низкий балл', () => {
  const s = scoreLot({ ...good, title: 'Продукты', directions: ['other'] }, undefined, NOW);
  assert.ok(s.score < 70, String(s.score));
  assert.equal(s.factors.find(f => f.key === 'direction').value, 0);
});

test('при нехватке данных оценка предварительная и уверенность падает', () => {
  const s = scoreLot({ title: 'Камеры', directions: ['cctv'] }, undefined, NOW);
  assert.ok(s.confidence < 60); assert.equal(s.preliminary, true);
  assert.ok(s.missing.includes('price') && s.missing.includes('region'));
});

test('пустой лот: балла нет, не 0 и не выдумка', () => {
  const s = scoreLot({}, undefined, NOW);
  assert.equal(s.score, null); assert.equal(s.preliminary, true);
});

test('веса настраиваются и меняют результат', () => {
  const lot = { ...good, total_price: 500000000 };
  const a = scoreLot(lot, undefined, NOW).score;
  const b = scoreLot(lot, { weights: { price: 0 } }, NOW).score;
  assert.ok(b > a);
});

test('валидация настроек', () => {
  assert.equal(validateScoring({ weights: { price: -1 } }).ok, false);
  assert.equal(validateScoring({ weights: { foo: 5 } }).ok, false);
  assert.equal(validateScoring({ price: { min: 10, max: 5 } }).ok, false);
  assert.equal(validateScoring({ weights: { price: 20 } }).ok, true);
  assert.equal(DEFAULT_SCORING.weights.direction, 35);
});

test('закрытые закупки', () => {
  assert.equal(isClosed({ status_raw: 'Закупка состоялась' }, NOW), true);
  assert.equal(isClosed({ deadline_at: new Date(NOW - day).toISOString() }, NOW), true);
  assert.equal(isClosed({ deadline_at: new Date(NOW + day).toISOString(), status_raw: 'Приём' }, NOW), false);
});
