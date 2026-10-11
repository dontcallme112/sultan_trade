// popular.js — «Популярные товары» на главной: ходовая электроника, по одному товару из каждой группы
// (ноутбук, смартфон, мышь, клавиатура, наушники, монитор...), а не самые дорогие.
// Настоящей статистики продаж у нас нет, поэтому выбираем «типичный» товар группы: в наличии (много штук), известного бренда,
// с ценой ближе к середине группы, с фото. Группы и бренды задаются в popular-config.json.

const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
// слова-признаки аксессуаров: «Сумка для ноутбука» не должна считаться ноутбуком
const ACCESSORY_RE = /(^|[\s"(])(для|чехол|сумк|рюкзак|кабел|зарядн|адаптер|переходник|крепл|подставк|защитн|пленк|стекл|ремеш|ремн|держател|кронштейн|наклейк|ковр|батаре|аккумулятор)/;

export const DEFAULT_POPULAR_CONFIG = {
  limit: 8,
  minPrice: 3000,
  maxPrice: 3000000,
  brands: ['apple', 'samsung', 'xiaomi', 'asus', 'hp', 'lenovo', 'acer', 'msi', 'dell', 'logitech', 'sony', 'jbl', 'tp-link', 'kingston', 'sandisk', 'canon', 'epson', 'huawei', 'razer', 'hyperx', 'a4tech', 'lg', 'philips'],
  slots: [
    { title: 'Ноутбуки',   starts: ['ноутбук'] },
    { title: 'Смартфоны',  starts: ['смартфон', 'мобильный телефон', 'телефон'] },
    { title: 'Мыши',       starts: ['мышь', 'мыши'] },
    { title: 'Наушники',   starts: ['наушник', 'гарнитур'] },
    { title: 'Клавиатуры', starts: ['клавиатур'] },
    { title: 'Мониторы',   starts: ['монитор'] },
    { title: 'SSD',        starts: ['накопитель ssd', 'ssd', 'твердотельный'] },
    { title: 'Планшеты',   starts: ['планшет'] },
    { title: 'Колонки',    starts: ['колонк', 'акустическая система'] },
    { title: 'Роутеры',    starts: ['маршрутизатор', 'роутер', 'wi-fi роутер'] },
    { title: 'Принтеры',   starts: ['принтер', 'мфу'] },
    { title: 'Флешки',     starts: ['usb флеш', 'флеш', 'usb накопитель'] },
  ],
};

const stockOf = (q) => (typeof q === 'string' && q.trim().startsWith('>') ? 10 : Math.min(10, Math.max(0, Number(q) || 0)));
const priceOf = (p) => Number(p.price ?? p.price1 ?? p.price2 ?? 0);
const hasPhoto = (p) => Boolean(p.image || p.images?.[0]);

function matchesSlot(name, slot) {
  const n = norm(name);
  const starts = (slot.starts || []).map(norm).filter(Boolean);
  if (starts.some(s => n.startsWith(s))) return 'strict';
  if (!ACCESSORY_RE.test(n) && starts.some(s => new RegExp(`(^|[\\s"(])${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(n))) return 'loose';
  return null;
}

/**
 * @param products — нормализованные товары (с готовой ценой)
 * @returns { elements, slots: [{ title, candidates }] }
 */
export function pickPopular(products, config = DEFAULT_POPULAR_CONFIG, finalize = (p) => p) {
  const cfg = { ...DEFAULT_POPULAR_CONFIG, ...config };
  const brands = cfg.brands.map(norm);
  const ranked = [];
  const info = [];
  for (const slot of cfg.slots) {
    let cands = products.filter(p => { const pr = priceOf(p); return pr >= cfg.minPrice && pr <= cfg.maxPrice && hasPhoto(p) && stockOf(p.quantity) > 0; });
    const strict = cands.filter(p => matchesSlot(p.name, slot) === 'strict');
    cands = strict.length ? strict : cands.filter(p => matchesSlot(p.name, slot));
    info.push({ title: slot.title, candidates: cands.length });
    if (!cands.length) { ranked.push([]); continue; }
    const sorted = cands.map(priceOf).sort((a, b) => a - b); const median = sorted[Math.floor(sorted.length / 2)] || 1;
    const scored = cands.map(p => {
      const hay = norm(`${p.brand || ''} ${p.name || ''}`);
      const bi = brands.findIndex(b => hay.includes(b));
      const brandScore = bi === -1 ? 0 : 1 + (1 - bi / brands.length) * 0.5;          // известный бренд: плюс, чем выше в списке, тем больше
      const typical = 1 - Math.min(1, Math.abs(priceOf(p) - median) / median);       // ближе к середине группы: «типичнее»
      return { p, score: brandScore + stockOf(p.quantity) / 10 + typical };
    }).sort((a, b) => b.score - a.score || String(a.p.article).localeCompare(String(b.p.article)));
    ranked.push(scored.map(x => x.p));
  }
  const out = [], used = new Set();
  for (let round = 0; out.length < cfg.limit && round < 5; round++) {          // по кругу: сначала лучший из каждой группы, потом вторые
    for (const list of ranked) {
      if (out.length >= cfg.limit) break;
      const next = list.find(p => !used.has(p.article));
      if (next) { used.add(next.article); out.push(finalize(next)); }
    }
  }
  return { elements: out, slots: info };
}
