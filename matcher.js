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

export function buildIndex(products) {
  return products.map(p => {
    const tk = tokenize(`${p.name || ''} ${p.brand || ''}`);
    return { p, tk, first: tk.stems[0] || '', stemSet: new Set(tk.stems), codeSet: new Set(tk.codes) };
  });
}

/** @returns [{ product, score, confidence, matched: { type, codes } }] (до topN лучших) */
export function matchLot(text, index, { topN = 3, priceOf = (p) => Number(p.price) || 0 } = {}) {
  const lot = tokenize(text);
  if (!lot.stems.length && !lot.codes.length) return [];
  const type = lot.stems[0];
  const lotStems = new Set(lot.stems), lotCodes = new Set(lot.codes);
  const generic = lot.codes.length === 0;
  const res = [];
  for (const it of index) {
    const typeHit = it.first === type ? 3 : (type && it.tk.stems.slice(0, 3).includes(type) ? 1 : 0);
    const shared = [...it.codeSet].filter(c => lotCodes.has(c));
    if (typeHit === 0 && shared.length < 2) continue;            // нужен тот же тип товара либо совпадение хотя бы двух кодов
    if (typeHit === 1 && shared.length === 0) continue;          // «Сумка для ноутбука» не должна подходить под «ноутбук»
    const overlap = [...it.stemSet].filter(s => lotStems.has(s)).length / Math.max(3, it.stemSet.size);
    const codeScore = Math.min(6, shared.length * 2);
    const score = typeHit + codeScore + 2 * Math.min(1, overlap);
    const confidence = typeHit === 3 && shared.length >= 2 ? 'high' : typeHit === 3 && (shared.length >= 1 || overlap >= 0.5 || (generic && overlap >= 0.3)) ? 'medium' : 'low';   // обезличенный лот: хватает типа товара и пары общих слов
    res.push({ product: it.p, score, confidence, matched: { type: typeHit, codes: shared } });
  }
  const tier = { high: 3, medium: 2, low: 1 };
  res.sort((a, b) => tier[b.confidence] - tier[a.confidence]
    || (generic ? (b.score - a.score > 1 ? b.score - a.score : priceOf(a.product) - priceOf(b.product)) : b.score - a.score)
    || priceOf(a.product) - priceOf(b.product)
    || String(a.product.article).localeCompare(String(b.product.article)));
  return res.slice(0, topN);
}
