// privacy.js — не показываем покупателям, у какого поставщика мы берём товар.
//
// Что делает:
//  1) адреса фото поставщика (img.al-style.kz) заменяет на адрес НАШЕГО сервера /media/<файл>;
//  2) номера товаров Al-Style (92544) заменяет на непрозрачные коды (p0a1b2c3), по ним поставщика не найти;
//  3) вырезает упоминания поставщика из названий и описаний;
//  4) убирает из ответа розничную цену поставщика (retail_price).
// Всё включается переменными PUBLIC_BACKEND_URL и ID_SECRET. Пока они не заданы, ничего не меняется.
import { createHmac } from 'node:crypto';

// допустимое имя файла для /media (никаких слэшей и «..»: это защита от открытого прокси)
export const MEDIA_FILE_RE = /^[\w.\-]{1,120}\.(?:jpe?g|png|webp|gif)$/i;

const SUPPLIER_IMG_RE = /^https?:\/\/img\.al-style\.kz\/([\w.\-]{1,120}\.(?:jpe?g|png|webp|gif))$/i;
const SUPPLIER_WORDS_RE = /al[\s\-_]?style|алстайл|ал[\s\-_]?стайл/gi;
const NUMERIC_FILE_RE = /^(\d{1,10})((?:_\d{1,3})?\.(?:jpe?g|png|webp|gif))$/i;   // 92544_1.jpg
const CODED_FILE_RE = /^(p[0-9a-z]{7})((?:_\d{1,3})?\.(?:jpe?g|png|webp|gif))$/i;  // p0a1b2c3_1.jpg
const CODE_RE = /^p[0-9a-z]{7}$/;
const MAX32 = 0x100000000;

export function createPrivacy({ publicBackendUrl = '', idSecret = '' } = {}) {
  const base = String(publicBackendUrl || '').trim().replace(/\/+$/, '');
  const secret = String(idSecret || '');
  const codecOn = secret.length >= 8;

  // ── Код вместо номера: ключевая перестановка 32-битных чисел (сеть Фейстеля, 4 раунда, HMAC-SHA256) ──
  // Без ID_SECRET по паре «номер ↔ код» остальные коды не вычислить. Смена секрета ломает старые ссылки.
  const round = (r, x) => createHmac('sha256', secret).update(`${r}:${x}`).digest().readUInt16BE(0);
  const enc32 = (v) => { let l = (v >>> 16) & 0xffff, r = v & 0xffff; for (let i = 0; i < 4; i++) { const t = r; r = l ^ round(i, r); l = t; } return ((l << 16) | r) >>> 0; };
  const dec32 = (v) => { let l = (v >>> 16) & 0xffff, r = v & 0xffff; for (let i = 3; i >= 0; i--) { const t = l; l = r ^ round(i, l); r = t; } return ((l << 16) | r) >>> 0; };

  const memoE = new Map(), memoD = new Map();
  const remember = (m, k, v) => { if (m.size > 50000) m.clear(); m.set(k, v); return v; };
  const isEncodable = (s) => /^\d{1,10}$/.test(s) && String(Number(s)) === s && Number(s) < MAX32;

  const encodeArticle = (a) => {
    if (!codecOn || a === null || a === undefined) return a;
    const s = String(a).trim();
    if (!isEncodable(s)) return a;
    if (memoE.has(s)) return memoE.get(s);
    return remember(memoE, s, 'p' + enc32(Number(s)).toString(36).padStart(7, '0'));
  };

  // код -> настоящий номер; всё остальное (старые числовые номера, «свои» артикулы вроде RAD-001) возвращается как есть
  const decodeArticle = (a) => {
    if (!codecOn || a === null || a === undefined) return a;
    const s = String(a).trim().toLowerCase();
    if (!CODE_RE.test(s)) return String(a).trim();
    if (memoD.has(s)) return memoD.get(s);
    const v = parseInt(s.slice(1), 36);
    let out = String(a).trim();
    if (v < MAX32) {
      const n = String(dec32(v));
      if (encodeArticle(n) === s) out = n;      // принимаем только канонические коды
    }
    return remember(memoD, s, out);
  };

  // ── Фото ──
  const maskImageUrl = (u) => {
    if (!base || typeof u !== 'string') return u;
    const m = u.trim().match(SUPPLIER_IMG_RE);
    if (!m || m[1].includes('..')) return u;
    const num = m[1].match(NUMERIC_FILE_RE);
    const file = num && codecOn ? `${encodeArticle(num[1])}${num[2]}` : m[1];
    return `${base}/media/${file}`;
  };

  // имя файла из адреса /media/<файл> -> имя файла у поставщика (null, если имя недопустимо)
  const resolveMediaFile = (file) => {
    if (typeof file !== 'string' || !MEDIA_FILE_RE.test(file) || file.includes('..')) return null;
    const c = file.toLowerCase().match(CODED_FILE_RE);
    if (c) {
      if (!codecOn) return null;
      const n = decodeArticle(c[1]);
      return /^\d+$/.test(n) ? `${n}${c[2]}` : null;
    }
    return file;
  };

  const scrubText = (s) =>
    typeof s === 'string' ? s.replace(SUPPLIER_WORDS_RE, '').replace(/[ \t]{2,}/g, ' ').trim() : s;

  // возвращает копию: исходный объект (он может лежать в кеше) не меняется
  const publicProduct = (p) => {
    const out = { ...p };
    delete out.retail_price;
    if (out.article !== undefined) out.article = encodeArticle(out.article);
    if (Array.isArray(out.images)) out.images = out.images.map(maskImageUrl);
    for (const k of ['image', 'image_url']) if (out[k]) out[k] = maskImageUrl(out[k]);
    for (const k of ['name', 'full_name', 'description']) if (typeof out[k] === 'string') out[k] = scrubText(out[k]);
    return out;
  };

  // заказ для покупателя: номера товаров в составе заказа тоже кодируем
  const publicOrder = (o) => (o && Array.isArray(o.items)
    ? { ...o, items: o.items.map(i => (i && typeof i === 'object' ? { ...i, article: encodeArticle(i.article) } : i)) }
    : o);

  return { enabled: Boolean(base), codecOn, maskImageUrl, resolveMediaFile, scrubText, encodeArticle, decodeArticle, publicProduct, publicOrder };
}
