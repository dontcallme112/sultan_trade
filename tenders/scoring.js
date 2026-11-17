import { DIRECTIONS } from './directions.js';

// Оценка соответствия лота компании: 0–100.
// Прозрачно: каждый фактор даёт 0..1 или null (данных нет). Итог = сумма(вес × значение) / сумма весов ИЗВЕСТНЫХ факторов.
// Уверенность = доля веса, по которой данные были. Если данных мало, оценка помечается как предварительная.
// Веса и пороги можно менять через /api/tenders/settings (хранятся в tender_settings).

export const DEFAULT_SCORING = {
  version: 1,
  weights: { direction: 35, price: 15, deadline: 15, region: 10, method: 10, status: 15 },
  price: { min: 100000, max: 30000000 },        // «комфортный» диапазон суммы лота, тенге
  regionPrefixes: ['75', '19'],                  // КАТО: 75 — г. Алматы, 19 — Алматинская область (проверьте по своему региону)
  methodPreference: [                           // подстрока названия способа → значение 0..1
    { match: 'ценовых предложений', value: 1 },
    { match: 'из одного источника', value: 0.7 },
    { match: 'открытый конкурс', value: 0.6 },
    { match: 'аукцион', value: 0.5 },
  ],
  minConfidenceToTrust: 60,                      // ниже — в интерфейсе «предварительная оценка»
};

const CLOSED_RE = /состоял|не состоял|отмен|заверш|итог|заключен|признан/i;

export function isClosed(lot, now = Date.now()) {
  if (lot.status_raw && CLOSED_RE.test(lot.status_raw)) return true;
  if (lot.deadline_at && new Date(lot.deadline_at).getTime() < now) return true;
  return false;
}

export function mergeScoring(overrides) {
  const o = overrides && typeof overrides === 'object' ? overrides : {};
  const cfg = { ...DEFAULT_SCORING, ...o,
    weights: { ...DEFAULT_SCORING.weights, ...(o.weights || {}) },
    price: { ...DEFAULT_SCORING.price, ...(o.price || {}) } };
  return cfg;
}

export function validateScoring(input) {
  const errors = [];
  const cfg = mergeScoring(input);
  for (const [k, v] of Object.entries(cfg.weights)) {
    if (!(k in DEFAULT_SCORING.weights)) errors.push(`Неизвестный вес: ${k}`);
    else if (!Number.isFinite(Number(v)) || v < 0 || v > 100) errors.push(`Вес ${k} должен быть 0..100`);
  }
  if (!(Object.values(cfg.weights).reduce((a, b) => a + Number(b), 0) > 0)) errors.push('Сумма весов должна быть больше 0');
  if (!(cfg.price.min >= 0 && cfg.price.max > cfg.price.min)) errors.push('price.max должен быть больше price.min');
  if (!Array.isArray(cfg.regionPrefixes) || cfg.regionPrefixes.some(x => typeof x !== 'string')) errors.push('regionPrefixes: массив строк');
  return { ok: !errors.length, errors, config: cfg };
}

function fDirection(lot, cfg) {
  const dirs = lot.directions || [];
  if (!lot.title && !lot.description) return null;
  const real = dirs.filter(d => d !== 'other');
  if (!real.length) return { v: 0, why: 'ни одно направление компании не найдено в тексте' };
  return { v: real.length >= 2 ? 1 : 0.75, why: `направления: ${real.map(id => DIRECTIONS.find(d => d.id === id)?.ru || id).join(', ')}` };
}
function fPrice(lot, cfg) {
  const p = Number(lot.total_price);
  if (lot.total_price == null || !Number.isFinite(p) || p <= 0) return null;
  if (p < cfg.price.min) return { v: 0.3, why: 'сумма ниже комфортного диапазона' };
  if (p > cfg.price.max) return { v: 0.4, why: 'сумма выше комфортного диапазона' };
  return { v: 1, why: 'сумма в комфортном диапазоне' };
}
function fDeadline(lot, cfg, now) {
  if (!lot.deadline_at) return null;
  const left = new Date(lot.deadline_at).getTime() - now;
  if (left <= 0) return { v: 0, why: 'срок подачи истёк' };
  const days = left / 86400000;
  if (days < 1) return { v: 0.2, why: 'меньше суток на подготовку' };
  if (days < 3) return { v: 0.6, why: 'менее 3 дней на подготовку' };
  return { v: 1, why: 'достаточно времени на подготовку' };
}
function fRegion(lot, cfg) {
  const code = lot.region_code;
  if (!code) return null;
  const ok = (cfg.regionPrefixes || []).some(p => String(code).startsWith(p));
  return ok ? { v: 1, why: 'поставка в вашем регионе' } : { v: 0.3, why: 'поставка вне основного региона' };
}
function fMethod(lot, cfg) {
  if (!lot.method) return null;
  const m = String(lot.method).toLowerCase();
  const hit = (cfg.methodPreference || []).find(x => m.includes(String(x.match).toLowerCase()));
  return hit ? { v: hit.value, why: `способ: ${lot.method}` } : { v: 0.4, why: `способ «${lot.method}» не в списке предпочтительных` };
}
function fStatus(lot, cfg, now) {
  if (!lot.status_raw && !lot.deadline_at) return null;
  return isClosed(lot, now) ? { v: 0, why: 'закупка закрыта' } : { v: 1, why: 'приём предложений открыт' };
}

export function scoreLot(lot, config, now = Date.now()) {
  const cfg = mergeScoring(config);
  const fns = { direction: fDirection, price: fPrice, deadline: fDeadline, region: fRegion, method: fMethod, status: fStatus };
  const factors = [];
  let known = 0, total = 0, sum = 0;
  for (const [k, fn] of Object.entries(fns)) {
    const w = Number(cfg.weights[k]) || 0;
    total += w;
    const r = fn(lot, cfg, now);
    if (!r) { factors.push({ key: k, weight: w, value: null, why: 'нет данных' }); continue; }
    known += w; sum += w * r.v;
    factors.push({ key: k, weight: w, value: r.v, why: r.why });
  }
  const confidence = total > 0 ? Math.round((known / total) * 100) : 0;
  const score = known > 0 ? Math.round((sum / known) * 100) : null;
  return {
    score, confidence,
    preliminary: score == null || confidence < cfg.minConfidenceToTrust,
    factors,
    missing: factors.filter(f => f.value == null).map(f => f.key),
  };
}
