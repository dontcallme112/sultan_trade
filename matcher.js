// matcher.js — подбор товаров нашего каталога под текст лота из закупок.
// Лот описан по-разному («Мышь компьютерная беспроводная Logitech M185», «Клавиатура проводная USB»),
// поэтому сравниваем: 1) тип товара (первое значимое слово), 2) марку и модель (латиница и цифры), 3) общие слова.
// Если в лоте нет марки и модели («обезличенный» лот), берём самый дешёвый подходящий товар: в закупках выигрывает цена.

const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е');
const STOP = new Set(['для', 'или', 'при', 'без', 'под', 'над', 'про', 'как', 'все', 'что', 'это', 'шт', 'штук', 'комплект', 'набор', 'поставка', 'приобретение', 'закупка', 'товар', 'товары']);
const GENERIC_CODES = new Set(['usb', 'led', 'lcd', 'pro', 'plus', 'wifi', 'wi-fi', 'hdmi', 'type-c', 'pc']);   // латиница, которая ничего не говорит о модели

export function tokenize(text) {
  const raw = norm(text).match(/[a-zа-я0-9][a-zа-я0-9\-.\/]*/g) || [];
  const words = [], codes = [];
  for (let t of raw) {
    t = t.replace(/[.\-\/]+$/, '');
    if (/[a-z]/.test(t) || (/\d/.test(t) && t.length >= 3 && /[a-zа-я]/.test(t))) { if (t.length >= 2 && !GENERIC_CODES.has(t)) codes.push(t); }
    else if (/^[а-я]{3,}/.test(t) && !STOP.has(t)) words.push(t);
  }
  return { words, codes, stems: words.map(w => w.slice(0, 5)) };
}

// Взаимоисключающие признаки: если лот требует одно, товар с явным противоположным признаком не подходит
const WIRED = /(?<![а-я])проводн/;                      // «бес-проводная» сюда не попадает: слово должно начинаться с «проводн»
const WIRELESS = /беспровод|wireless|bluetooth|\bbt\b|2\.4\s?g|радиоканал/;
const CONFLICT_PAIRS = [
  [WIRED, WIRELESS],                                      // проводная — беспроводная
  [/беспровод|wireless|bluetooth/, WIRED],
  [/лазерн|laser/, /струйн|inkjet|ink\s?tank|ecotank|термо/],                     // лазерный — струйный
  [/струйн|inkjet/, /лазерн|laser/],
];
export function conflicts(lotNorm, productNorm) {
  return CONFLICT_PAIRS.some(([need, bad]) => need.test(lotNorm) && bad.test(productNorm) && !need.test(productNorm));
}

// слова-признаки аксессуаров: «Коврик для мыши» и «Сумка для ноутбука» не подходят под «мышь» и «ноутбук»
const ACCESSORY_RE = /(^|[\s"(])(для|чехол|сумк|рюкзак|кабел|зарядн|адаптер|переходник|крепл|подставк|защитн|пленк|стекл|ремеш|ремн|держател|кронштейн|наклейк|ковр|батаре|аккумулятор)/;

export function buildIndex(products) {
  return products.map(p => {
    const tk = tokenize(`${p.name || ''} ${p.brand || ''}`);
    const nm = norm(`${p.name || ''} ${p.brand || ''}`);
    return { p, tk, norm: nm, accessory: ACCESSORY_RE.test(norm(p.name || '')), first: tk.stems[0] || '', stemSet: new Set(tk.stems), codeSet: new Set(tk.codes) };
  });
}

/** @returns [{ product, score, confidence, matched: { type, codes } }] (до topN лучших) */
export function matchLot(text, index, { topN = 3, priceOf = (p) => Number(p.price) || 0 } = {}) {
  const lot = tokenize(text);
  if (!lot.stems.length && !lot.codes.length) return [];
  const lotNorm = norm(text);
  const type = lot.stems[0];
  const lotStems = new Set(lot.stems), lotCodes = new Set(lot.codes);
  const generic = lot.codes.length === 0;      // в лоте нет марки и модели: «Мышь компьютерная проводная»
  const res = [];
  for (const it of index) {
    // 3: тип товара в начале названия («Мышь …»); 2: в первых трёх словах («Компьютерная мышь …»), если это не аксессуар; 1: то же для аксессуароподобных названий
    const inFirst3 = Boolean(type && it.tk.stems.slice(0, 3).includes(type));
    const typeHit = it.first === type ? 3 : inFirst3 ? (it.accessory ? 1 : 2) : 0;
    const shared = [...it.codeSet].filter(c => lotCodes.has(c));
    if (typeHit === 0 && shared.length < 2) continue;            // нужен тот же тип товара либо совпадение хотя бы двух кодов
    if (typeHit === 1 && shared.length === 0) continue;          // «Сумка для ноутбука» не должна подходить под «ноутбук»
    if (conflicts(lotNorm, it.norm)) continue;                    // «проводная» не получит «wireless»
    const overlap = [...it.stemSet].filter(s => lotStems.has(s)).length / Math.max(3, it.stemSet.size);
    const score = typeHit + Math.min(6, shared.length * 2) + 2 * Math.min(1, overlap);
    const confidence = typeHit >= 2 && shared.length >= 2 ? 'high'
      : typeHit >= 2 && (shared.length >= 1 || overlap >= 0.5 || generic) ? 'medium' : 'low';
    res.push({ product: it.p, score, confidence, matched: { type: typeHit, codes: shared } });
  }
  const tier = { high: 3, medium: 2, low: 1 };
  const byName = (a, b) => String(a.product.article).localeCompare(String(b.product.article));
  if (generic) {
    // обезличенный лот: в закупках выигрывает цена, поэтому среди товаров того же типа берём самые дешёвые
    res.sort((a, b) => (b.matched.type >= 2) - (a.matched.type >= 2) || priceOf(a.product) - priceOf(b.product) || b.score - a.score || byName(a, b));
  } else {
    res.sort((a, b) => tier[b.confidence] - tier[a.confidence] || b.score - a.score || priceOf(a.product) - priceOf(b.product) || byName(a, b));
  }
  return res.slice(0, topN);
}