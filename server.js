import express from 'express';
import compression from 'compression';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { Redis } from '@upstash/redis';
import { createApiPayService, UserError, DEFAULT_BASE_URL } from './apipay.js';
import { createPrivacy } from './privacy.js';
import { createPricing } from './pricing.js';
import { createChatService, createSupabaseChatStore, createTelegramSender, ChatError } from './chat.js';
import { readFileSync } from 'node:fs';

dotenv.config();

const PORT          = process.env.PORT || 8080;
const ALSTYLE_TOKEN = process.env.ALSTYLE_ACCESS_TOKEN;
const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const TG_TOKEN      = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT_ID    = process.env.TELEGRAM_CHAT_ID;
const SYNC_SECRET   = process.env.SYNC_SECRET;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
// Наценка должна совпадать с MARKUP_PERCENT во фронте (priceFormatter). Можно переопределить переменной MARKUP_PERCENT на Railway.
const MARKUP_PERCENT = Number.isFinite(Number(process.env.MARKUP_PERCENT)) && process.env.MARKUP_PERCENT !== undefined && process.env.MARKUP_PERCENT !== '' ? Number(process.env.MARKUP_PERCENT) : 5;

// Цена для клиента = ДИЛЕРСКАЯ (price1) + MARKUP_PERCENT, а не розничная price2.
// По документации Al-Style: price1 = 1 означает «цена по запросу» (фронт показывает price === 1).
// ── Курс доллара для товаров с ценой в $ (радиаторы и т.п.) ──
// USD_KZT_RATE                — фиксированный курс (если задан, автоматика отключена)
// USD_RATE_MARGIN_PERCENT     — надбавка к официальному курсу Нацбанка, % (рыночный курс обычно выше официального)
// USD_KZT_RATE_FALLBACK       — запасной курс, если Нацбанк недоступен
let usdRate = null;
let usdRateSource = 'none';
async function refreshUsdRate() {
  const fixed = Number(process.env.USD_KZT_RATE);
  if (fixed > 0) { usdRate = fixed; usdRateSource = 'env:fixed'; return; }
  const margin = Number(process.env.USD_RATE_MARGIN_PERCENT) || 0;
  try {
    const { data } = await axios.get('https://nationalbank.kz/rss/rates_all.xml', { timeout: 15000, responseType: 'text' });
    let rate = null;
    for (const m of String(data).matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
      const block = m[1];
      if (!/<title>\s*USD\s*<\/title>/i.test(block)) continue;
      const d = block.match(/<description>\s*([\d.,\s]+)\s*<\/description>/i);
      const quant = Number((block.match(/<quant>\s*(\d+)\s*<\/quant>/i) || [])[1]) || 1;
      if (d) rate = Number(d[1].replace(/\s/g, '').replace(',', '.')) / quant;
      break;
    }
    if (rate > 100 && rate < 5000) {
      usdRate = rate * (1 + margin / 100);
      usdRateSource = margin ? `nbrk+${margin}%` : 'nbrk';
      console.log(`💵 Курс USD: ${rate} (Нацбанк)${margin ? ` + ${margin}% = ${usdRate.toFixed(2)}` : ''}`);
      return;
    }
    console.warn('⚠️ Не удалось прочитать курс USD в ответе Нацбанка');
  } catch (e) { console.warn('⚠️ Курс USD (Нацбанк):', e.message); }
  const fb = Number(process.env.USD_KZT_RATE_FALLBACK);
  if (!usdRate && fb > 0) { usdRate = fb; usdRateSource = 'env:fallback'; }
}

// Цена для клиента = ДИЛЕРСКАЯ + наценка. Для товаров в $: price_usd × курс.
// Приводит товар к единой цене: price, price1 и price2 = дилерская. Что бы ни читал фронт, он увидит её.
// PUBLIC_BACKEND_URL (Railway → Variables): адрес этого сервера, через него отдаём фото вместо адреса поставщика
// ID_SECRET: любая случайная строка от 8 символов; по ней номера Al-Style превращаются в непрозрачные коды (смена секрета ломает старые ссылки)
const privacy = createPrivacy({ publicBackendUrl: process.env.PUBLIC_BACKEND_URL, idSecret: process.env.ID_SECRET });
// MARKUP_ON_SERVER=true: наценку считает сервер, в ответах API только готовая цена (закупочной цены в сети нет)
const MARKUP_ON_SERVER = String(process.env.MARKUP_ON_SERVER || '').toLowerCase() === 'true';
const { applyMarkup, dealerPrice, normalizePrice } = createPricing({ markupPercent: MARKUP_PERCENT, markupOnServer: MARKUP_ON_SERVER, getUsdRate: () => usdRate, privacy });
const IMG_UPSTREAM = (process.env.IMG_UPSTREAM || 'https://img.al-style.kz').replace(/\/+$/, '');
// Для сортировки: «по запросу» (1) уходит в конец
const sortPrice = (p, asc = false) => (p.price2 > 1 ? p.price2 : (asc ? Number.MAX_SAFE_INTEGER : 0));

// Остаток: число, "5" или ">10". Нулевой/пустой остаток = нет в наличии.
const isInStock = p => {
  const q = p?.quantity;
  if (q === undefined || q === null) return true;
  if (typeof q === 'number') return q > 0;
  const str = String(q).trim();
  if (!str || str === '0') return false;
  if (str.startsWith('>')) return true;
  const n = parseInt(str, 10);
  return !Number.isNaN(n) && n > 0;
};

// Что НЕ показываем в списках: нет в наличии, нет названия, нет фото, цена «по запросу» или цена-заглушка.
// Al-Style ставит у снятых позиций и запчастей цену 9 999 999 — такие товары продать нельзя.
// SHOW_ON_REQUEST=true на Railway вернёт товары «по запросу» в список.
const SHOW_ON_REQUEST = process.env.SHOW_ON_REQUEST === 'true';
const PLACEHOLDER_PRICE = 9000000;
const isListable = p => {
  if (!p?.article || !(p.name || p.full_name)) return false;
  if (!isInStock(p)) return false;
  const d = dealerPrice(p);
  if (!SHOW_ON_REQUEST && d <= 1) return false;
  if (d >= PLACEHOLDER_PRICE) return false;
  const hasImage = (Array.isArray(p.images) && p.images.length > 0) || !!p.image || p.source === 'manual';
  return hasImage;
};

if (!ALSTYLE_TOKEN) { console.error('ALSTYLE_ACCESS_TOKEN не найден!'); process.exit(1); }

const supabaseAdmin = SUPABASE_URL && SUPABASE_KEY ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;
const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
  : null;

console.log('\n🚀 Stockera Backend v5.2');
console.log('━━━━━━━━━━━━━━━━━━━━━━');
console.log(`Redis: ${redis ? '✅ Upstash' : '⚠️  Disabled'}`);
console.log(`SUPABASE_URL: ${SUPABASE_URL ? '✅' : '❌'}`);
console.log(`SUPABASE_SERVICE_KEY: ${SUPABASE_KEY ? '✅' : '❌'}`);
console.log(`ALSTYLE_TOKEN: ${ALSTYLE_TOKEN ? '✅' : '❌'}`);
console.log(`🔐 Auth: ${supabaseAdmin ? '✅ Supabase' : '⚠️  Disabled'}`);
console.log(`SYNC_SECRET: ${SYNC_SECRET ? '✅' : '⚠️  не задан — /api/admin/sync отключён'}`);
console.log(`CORS: ${ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS.join(', ') : '⚠️  ALLOWED_ORIGINS не задан — разрешены все origin'}`);
console.log('⏱️  Кеш: товары 10мин, категории 30мин\n');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // 1 прокси перед приложением (Railway/Render/Fly и т.п.); req.ip станет настоящим IP клиента
app.use(compression());
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || !ALLOWED_ORIGINS.length || ALLOWED_ORIGINS.includes(origin)),
  credentials: true,
}));
const jsonSmall = express.json({ limit: '200kb' });
app.use((req, res, next) => (req.path === '/api/admin/import-products' ? next() : jsonSmall(req, res, next)));
app.use((req, res, next) => { if (!req.path.startsWith('/media/') && !(req.method === 'GET' && req.path === '/api/chat/messages')) console.log(`${new Date().toLocaleTimeString()} ${req.method} ${req.path}`); next(); });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ─── Telegram ────────────────────────────────────────────────
async function sendTelegramNotification(text) {
  if (!TG_TOKEN || !TG_CHAT_ID) return;
  try {
    await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, { chat_id: TG_CHAT_ID, text, parse_mode: 'HTML' });
    console.log('📱 Telegram уведомление отправлено');
  } catch (e) { console.warn('⚠️ Telegram ошибка:', e.message); }
}

// ─── RAM кеш ─────────────────────────────────────────────────
const cache = new Map();
const CACHE_TIMES = { products: 10*60*1000, categories: 30*60*1000, product: 5*60*1000 };

function getCache(key, maxAge) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() - item.timestamp > maxAge) { cache.delete(key); return null; }
  console.log(`💾 RAM кеш hit: ${key}`);
  return item.data;
}
function setCache(key, data) { cache.set(key, { data, timestamp: Date.now() }); }

async function getRedisCacheOrNull(key) {
  if (!redis) return null;
  try { const val = await redis.get(key); if (val) { console.log(`💾 Redis hit: ${key}`); return val; } } catch(e) { console.warn('⚠️ Redis get:', e.message); }
  return null;
}
async function setRedisCache(key, data, ttl = 86400) {
  if (!redis) return;
  try { await redis.set(key, data, { ex: ttl }); } catch(e) { console.warn('⚠️ Redis set:', e.message); }
}

// ─── Дедупликация ────────────────────────────────────────────
const inFlight = new Map();
async function fetchOnce(key, fn) {
  if (inFlight.has(key)) return inFlight.get(key);
  const p = fn().finally(() => inFlight.delete(key));
  inFlight.set(key, p); return p;
}

// ─── API очередь (каталог/синк) ──────────────────────────────
const API_MIN_INTERVAL = process.env.API_MIN_INTERVAL_MS === undefined ? 5000 : Number(process.env.API_MIN_INTERVAL_MS);   // пауза между запросами к Al-Style (для тестов можно уменьшить)
let apiQueue = Promise.resolve();
function enqueueApiCall(fn) {
  const next = apiQueue.then(async () => { const r = await fn(); await sleep(API_MIN_INTERVAL); return r; });
  apiQueue = next.catch(() => {}); return next;
}

// ─── Отдельный mutex для заказов (корзина al-style общая на весь токен) ──
let orderLock = Promise.resolve();
function withOrderLock(fn) {
  const run = orderLock.then(fn);
  orderLock = run.catch(() => {});
  return run;
}

// ─── Повторы при сбоях (Supabase и Al-Style иногда отвечают «upstream request timeout») ──
const RETRY_BASE_MS = Number(process.env.RETRY_BASE_MS) || 2000;   // 2 с, 4 с, 8 с...
const DB_PAUSE_MS = process.env.DB_PAUSE_MS === undefined ? 100 : Number(process.env.DB_PAUSE_MS);
async function withRetry(label, fn, tries = 4) {
  for (let n = 1; ; n++) {
    try { return await fn(); }
    catch (e) {
      if (n >= tries || /^(22|23|42)/.test(String(e?.code || ''))) throw e;   // ошибки данных и SQL повтором не лечатся
      const wait = RETRY_BASE_MS * 2 ** (n - 1);
      console.warn(`⚠️ ${label}: попытка ${n} не удалась (${String(e?.message || 'ошибка').slice(0, 90)}), повтор через ${Math.round(wait / 1000)} с`);
      await sleep(wait);
    }
  }
}
// запрос к Supabase с проверкой ошибки (supabase-js сам ошибки не бросает) и повторами
const dbCall = (label, fn, tries) => withRetry(label, async () => {
  const { data, error } = await fn();
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data;
}, tries);

// ─── Rate limiting ────────────────────────────────────────────
const rateLimitMap = new Map();
function rateLimit({ windowMs=60000, max=100, message='Слишком много запросов' }={}) {
  return (req, res, next) => {
    const ip = req.ip || 'unknown'; // trust proxy настроен выше, x-forwarded-for руками не читаем
    const now = Date.now();
    const reqs = (rateLimitMap.get(ip)||[]).filter(t => t > now-windowMs);
    reqs.push(now); rateLimitMap.set(ip, reqs);
    if (reqs.length > max) { console.log(`🚫 Rate limit: ${ip}`); return res.status(429).json({ error: message }); }
    next();
  };
}
setInterval(() => { const c=Date.now()-60000; for(const[ip,t]of rateLimitMap){const f=t.filter(x=>x>c);if(!f.length)rateLimitMap.delete(ip);else rateLimitMap.set(ip,f);} }, 5*60*1000);

// ─── Auth middleware ──────────────────────────────────────────
const requireAuth = async (req, res, next) => {
  if (!supabaseAdmin) return res.status(503).json({ error: 'Auth service not configured' });
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(auth.slice(7));
  if (error || !user) return res.status(401).json({ error: 'Invalid token' });
  req.user = user; next();
};

const api     = axios.create({ baseURL: process.env.ALSTYLE_API_BASE || 'https://api.al-style.kz/api', timeout: 30000 });   // ALSTYLE_API_BASE нужен только для тестов
const cartApi = axios.create({ baseURL: 'https://api.al-style.kz/cart-api', timeout: 30000 });

function parseCategoryParam(raw) {
  if (!raw) return null;
  const valid = (Array.isArray(raw)?raw:[raw]).map(c => { if(!c||typeof c==='object') return null; const s=String(c).trim(); return /^[\d,]+$/.test(s)?s:null; }).filter(Boolean);
  return valid.length ? valid.join(',') : null;
}

// Страница каталога с ретраями на 403. После 3 неудач бросает ошибку (раньше молча возвращался null).
async function fetchCatalogPage(offset) {
  for (let retries = 0; ; ) {
    try {
      return await enqueueApiCall(async () => {
        const { data } = await api.get('/elements-pagination', { params: { 'access-token': ALSTYLE_TOKEN, exclude_missing: 'true', limit: 250, offset, additional_fields: 'brand,images' } });
        return data;
      });
    } catch (e) {
      const transient = [502, 503, 504].includes(e.response?.status) || (!e.response && /timeout|ECONNRESET|ECONNABORTED|ETIMEDOUT|EAI_AGAIN|socket hang up|network/i.test(`${e.code || ''} ${e.message || ''}`));
      if (e.response?.status === 403 && retries < 3) { retries++; await sleep(10000 * retries); }
      else if (transient && retries < 3) { retries++; console.warn(`⚠️ Al-Style: страница ${offset} не ответила (${e.code || e.response?.status || e.message}), повтор ${retries}/3`); await sleep(RETRY_BASE_MS * 2 * retries); }
      else throw e;
    }
  }
}

async function loadProducts(cat) {
  const key = `products_cat_${cat||'all'}`;
  const cached = getCache(key, CACHE_TIMES.products);
  if (cached) return cached;

  if (supabaseAdmin) {
    try {
      const data = []; let error = null, prevFirst = null;
      for (let from = 0; from < 10000; ) {   // Supabase отдаёт не больше 1000 строк за запрос: читаем страницами; порядок задаём однозначно (цена, затем артикул)
        let query = supabaseAdmin.from('products')
          .select('article, name, full_name, brand, price, price1, price2, price_usd, unit, source, description, isnew, quantity, image_url, category_id')
          .neq('quantity', '0')
          .order('price', { ascending: false }).order('article', { ascending: true })
          .range(from, from + 999);
        if (cat) query = /^99000\d$/.test(String(cat)) ? query.eq('root_category_id', String(cat)) : query.eq('category_id', String(cat));
        const { data: page, error: pageErr } = await query;
        if (pageErr) { error = pageErr; break; }
        if (!page?.length || page[0].article === prevFirst) break;   // пусто или страница повторилась: читать дальше нечего
        prevFirst = page[0].article; data.push(...page); from += page.length;
      }
      if (!error && data?.length > 0) {
        const elements = data.map(p => ({
          article: p.article, name: p.name, full_name: p.full_name,
          brand: p.brand, price: p.price, price1: p.price1, price2: p.price2,
          isnew: p.isnew, quantity: p.quantity,
          images: p.image_url ? [p.image_url] : [], image: p.image_url,
          category_id: p.category_id,
          price_usd: p.price_usd, unit: p.unit, source: p.source, description: p.description,
        }));
        const result = { elements, pagination: { totalCount: data.length } };
        setCache(key, result);
        if (!cat) setCache('products_cat_all', result);
        console.log(`✅ Загружено из Supabase: ${elements.length} товаров`);
        return result;
      }
    } catch (e) { console.warn('⚠️ Supabase loadProducts fallback:', e.message); }
  }

  // категории своих товаров (99xxxx) есть только в нашей базе: поход в Al-Style бессмыслен
  if (/^990\d{3}$/.test(String(cat || ''))) return { elements: [], pagination: { totalCount: 0 } };

  return fetchOnce(key, () => enqueueApiCall(async () => {
    console.log(`📦 API: загрузка товаров, категория: ${cat||'все'}`);
    const params = { 'access-token': ALSTYLE_TOKEN, exclude_missing: 'true', limit: 250, offset: 0, additional_fields: 'brand,images' };
    if (cat) params.category = cat;
    const { data } = await api.get('/elements-pagination', { params });
    setCache(key, data); if (!cat) setCache('products_cat_all', data);
    console.log(`✅ Загружено: ${data.elements?.length||0} товаров`);
    return data;
  }));
}

const ALL_CACHE_TIME = 30*60*1000;
async function loadAllProductsForSearch() {
  const ram = getCache('search_all_products_v3', ALL_CACHE_TIME); if (ram) return ram;
  const rd = await getRedisCacheOrNull('search_all_products_v3'); if (rd) { setCache('search_all_products_v3', rd); return rd; }
  return fetchOnce('search_all_loading', async () => {
    if (supabaseAdmin) {
      try {
        let allData = [];
        let from = 0, prevFirst = null;
        const pageSize = 1000;
        while (true) {
          const { data, error } = await supabaseAdmin.from('products')
            .select('article, name, full_name, brand, price, price1, price_usd, unit, source, isnew, quantity, image_url')
            .neq('quantity', '0')
            .order('price', { ascending: false }).order('article', { ascending: true })
            .range(from, from + pageSize - 1);
          if (error || !data?.length || data[0].article === prevFirst) break;
          prevFirst = data[0].article; allData.push(...data);
          from += data.length;
        }
        if (allData.length > 0) {
          const compact = allData.map(p => ({ article: p.article, name: p.name||'', full_name: p.full_name||'', brand: p.brand||'', price: dealerPrice(p), price1: p.price_usd ? null : dealerPrice(p), price_usd: p.price_usd ?? null, unit: p.unit||null, source: p.source||'alstyle', isnew: p.isnew||0, quantity: p.quantity, image: p.image_url||null }));
          setCache('search_all_products_v3', compact);
          await setRedisCache('search_all_products_v3', compact, 86400);
          console.log(`✅ Кеш поиска из Supabase: ${compact.length} товаров`);
          return compact;
        }
      } catch (e) { console.warn('⚠️ Supabase search fallback на al-style:', e.message); }
    }

    console.log('🔍 Загрузка всех товаров из al-style...');
    const all = []; let offset = 0, total = null;
    do {
      let data = null;
      try { data = await fetchCatalogPage(offset); }
      catch (e) { console.log('❌ Пропускаем страницу:', e.message); break; }
      all.push(...(data.elements||[]));
      if (!total && data.pagination?.totalCount) { total = data.pagination.totalCount; console.log(`🔍 Всего: ${total}`); }
      offset += 250; console.log(`🔍 Загружено: ${all.length}/${total||'?'}`);
    } while (total && offset < total);
    const compact = all.map(p => ({ article:p.article, name:p.name||'', full_name:p.full_name||'', brand:p.brand||'', price:dealerPrice(p), price1:dealerPrice(p), isnew:p.isnew||0, quantity:p.quantity, image:p.images?.[0]||null }));
    setCache('search_all_products_v3', compact); await setRedisCache('search_all_products_v3', compact, 86400);
    console.log(`✅ Кеш поиска готов: ${compact.length} товаров`); return compact;
  });
}

// ─── Валидация позиций заказа ────────────────────────────────
// Берём от клиента только article и quantity; имя и цену подставляем сами.
function normalizeItems(items) {
  if (!Array.isArray(items) || !items.length || items.length > 100) return null;
  const clean = items.map(i => ({ article: String(privacy.decodeArticle(String(i?.article ?? '').trim())), quantity: Math.floor(Number(i?.quantity)) }));
  if (clean.some(i => !/^[\w.\-]+$/.test(i.article) || !(i.quantity > 0) || i.quantity > 10000)) return null;
  return clean;
}

// ═══════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════
// ═══ «Свои» товары (не из Al-Style): категории и загрузка прайса ═══
// Дерево категорий в формате, который ждёт страница каталога (как у Al-Style: level / left / right / elements)
function buildManualCategoryTree(rows) {
  const roots = new Map();
  for (const r of rows) {
    if (!r.root_category_id || !r.category_id) continue;
    if (!roots.has(r.root_category_id)) roots.set(r.root_category_id, { name: r.root_category_name, kids: new Map(), total: 0 });
    const root = roots.get(r.root_category_id); root.total++;
    const k = root.kids.get(r.category_id) || { name: r.category_name, n: 0 };
    k.n++; root.kids.set(r.category_id, k);
  }
  const out = []; let pos = 9000000;
  for (const [rid, root] of [...roots.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))) {
    const left = pos++; const kids = [];
    for (const [cid, k] of [...root.kids.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))) {
      kids.push({ id: Number(cid), name: k.name, level: 2, left: pos++, right: pos++, elements: k.n });
    }
    out.push({ id: Number(rid), name: root.name, level: 1, left, right: pos++, elements: root.total }, ...kids);
  }
  return out;
}
let manualCatCache = { at: 0, data: [] };
async function getManualCategories() {
  if (!supabaseAdmin) return [];
  if (Date.now() - manualCatCache.at < 10 * 60 * 1000) return manualCatCache.data;
  try {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabaseAdmin.from('products')
        .select('category_id, category_name, root_category_id, root_category_name')
        .eq('source', 'manual').neq('quantity', '0').order('article').range(from, from + 999);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    manualCatCache = { at: Date.now(), data: buildManualCategoryTree(rows) };
    return manualCatCache.data;
  } catch (e) { console.warn('⚠️ Категории своих товаров:', e.message); return manualCatCache.data; }
}

// Проверка одной позиции из файла прайса. Возвращает { row } или { error }
function toManualRow(p) {
  const bad = (m) => ({ error: `${p?.article || '?'}: ${m}` });
  if (!p || typeof p !== 'object') return bad('не объект');
  if (typeof p.article !== 'string' || !/^[\w.\-]{2,60}$/.test(p.article)) return bad('артикул (латиница, цифры, - . _)');
  const name = cleanText(p.name, 200); if (name.length < 3) return bad('название слишком короткое');
  const kzt = p.price_kzt == null ? null : Number(p.price_kzt);
  const usd = p.price_usd == null ? null : Number(p.price_usd);
  if (!((kzt > 1 && kzt < 1e9) !== (usd > 0 && usd < 1e6))) return bad('нужна ровно одна цена: price_kzt или price_usd');
  for (const k of ['category_id', 'root_category_id']) if (!/^\d{4,8}$/.test(String(p[k] ?? ''))) return bad(`${k} должен быть числом из 4–8 цифр`);
  if (p.image != null && !/^(\/|https?:\/\/)\S{1,290}$/.test(String(p.image))) return bad('image: путь должен начинаться с / или https://');
  return { row: {
    article: p.article, name, full_name: name, brand: cleanText(p.brand, 80),
    price: kzt || 0, price1: kzt || null, price2: kzt || null, price_usd: usd || null,
    quantity: '>1000', isnew: 0, image_url: p.image || null, images: p.image ? [p.image] : [],
    category_id: String(p.category_id), root_category_id: String(p.root_category_id),
    category_name: cleanText(p.category_name, 120), root_category_name: cleanText(p.root_category_name, 120),
    description: cleanText(p.description, 1000) || null, unit: cleanText(p.unit, 10) || 'шт.',
    supplier: cleanText(p.supplier, 80) || null, source: 'manual', raw_data: {}, synced_at: new Date().toISOString(),
  } };
}

// Загрузка прайса: POST /api/admin/import-products, заголовок x-sync-secret, тело { products: [...] }
// Позиции того же поставщика (supplier), которых нет в файле, прячутся (остаток 0).
app.post('/api/admin/import-products', express.json({ limit: '10mb' }), async (req, res) => {
  if (!SYNC_SECRET || req.headers['x-sync-secret'] !== SYNC_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase не настроен' });
  const list = req.body?.products;
  if (!Array.isArray(list) || !list.length || list.length > 5000) return res.status(400).json({ error: 'products: массив от 1 до 5000 позиций' });
  const rows = [], errors = [];
  for (const p of list) { const r = toManualRow(p); r.row ? rows.push(r.row) : errors.push(r.error); }
  if (errors.length) return res.status(400).json({ error: 'В файле есть ошибки, ничего не загружено', errors: errors.slice(0, 30), errorsTotal: errors.length });
  if (new Set(rows.map(r => r.article)).size !== rows.length) return res.status(400).json({ error: 'В файле повторяются артикулы' });
  try {
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supabaseAdmin.from('products').upsert(rows.slice(i, i + 200), { onConflict: 'article' });
      if (error) throw new Error(error.message);
    }
    // Скрываем позиции этого поставщика, которых нет в новом файле. Читаем постранично (Supabase отдаёт не больше 1000 строк за запрос),
    // ошибки не глотаем, а считаем реально скрытые строки.
    let hidden = 0;
    for (const supplier of [...new Set(rows.map(r => r.supplier).filter(Boolean))]) {
      const keep = new Set(rows.filter(r => r.supplier === supplier).map(r => r.article));
      const old = [];
      let prevFirst = null;
      for (let from = 0, pages = 0; ; pages++) {   // шаг по фактически полученному числу строк: если в проекте Supabase лимит строк меньше 1000, ничего не пропустим
        if (pages > 200) throw new Error('Слишком много страниц при чтении старых позиций (больше 200)');
        const { data, error } = await supabaseAdmin.from('products').select('article').eq('source', 'manual').eq('supplier', supplier).neq('quantity', '0').order('article').range(from, from + 999);
        if (error) throw new Error('Не удалось прочитать старые позиции: ' + error.message);
        if (!data?.length || data[0].article === prevFirst) break;   // пусто или та же страница повторилась: читать дальше нечего
        prevFirst = data[0].article; old.push(...data); from += data.length;
      }
      const gone = old.map(o => o.article).filter(a => !keep.has(a));
      for (let i = 0; i < gone.length; i += 100) {
        const { data: done, error } = await supabaseAdmin.from('products').update({ quantity: '0' }).in('article', gone.slice(i, i + 100)).select('article');
        if (error) throw new Error('Не удалось скрыть старые позиции: ' + error.message);
        hidden += (done || []).length;
      }
    }
    cache.clear(); manualCatCache.at = 0;
    if (redis) await redis.del('search_all_products_v3').catch(() => {});
    console.log(`✅ Импорт прайса: ${rows.length} позиций, скрыто ${hidden}`);
    res.json({ success: true, upserted: rows.length, hidden });
  } catch (e) { console.error('❌ Импорт прайса:', e.message); res.status(500).json({ error: e.message }); }
});

// ═══ Онлайн-чат на сайте (ответы менеджера через Telegram) ═══
// Нужны переменные Railway: CHAT_WEBHOOK_SECRET (случайная строка 16+ символов). Бот и чат берутся из
// CHAT_BOT_TOKEN / CHAT_TELEGRAM_CHAT_ID, а если их нет, из TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID (как у заказов).
// CHAT_HOURS (по умолчанию 09:00-19:00, время Алматы), CHAT_AUTOREPLY и CHAT_OFFLINE_REPLY: тексты автоответов (необязательно).
const CHAT_BOT_TOKEN = process.env.CHAT_BOT_TOKEN || TG_TOKEN;
// Заготовки ответов менеджера и автоответы по ключевым словам лежат в chat-config.json (рядом с server.js); нет файла: чат работает без них
let chatConfig = {};
try { chatConfig = JSON.parse(readFileSync(new URL('./chat-config.json', import.meta.url), 'utf8')); }
catch (e) { if (e.code !== 'ENOENT') console.warn('⚠️ chat-config.json не прочитан:', e.message); }
const chatSvc = createChatService({
  store: supabaseAdmin ? createSupabaseChatStore(supabaseAdmin) : null,
  telegram: CHAT_BOT_TOKEN ? createTelegramSender({ token: CHAT_BOT_TOKEN, http: axios, base: process.env.TELEGRAM_API_BASE || 'https://api.telegram.org' }) : null,
  chatId: process.env.CHAT_TELEGRAM_CHAT_ID || TG_CHAT_ID,
  hours: process.env.CHAT_HOURS || '09:00-19:00',
  webhookSecret: process.env.CHAT_WEBHOOK_SECRET || '',
  autoReply: process.env.CHAT_AUTOREPLY, offlineReply: process.env.CHAT_OFFLINE_REPLY, config: chatConfig,
});
const chatError = (res, e) => {
  if (e instanceof ChatError) return res.status(e.status).json({ error: e.message });
  console.error('❌ Чат:', e?.message || 'ошибка');
  return res.status(500).json({ error: 'Чат временно недоступен' });
};
const chatToken = (req) => { const t = req.headers['x-chat-token']; return typeof t === 'string' && /^[\w-]{20,64}$/.test(t) ? t : undefined; };
// вошедший пользователь (необязательно): менеджер увидит имя и почту
const optionalUser = async (req) => {
  const a = req.headers.authorization;
  if (!supabaseAdmin || !a?.startsWith('Bearer ')) return null;
  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(a.slice(7));
    return error || !user ? null : { id: user.id, email: user.email, name: user.user_metadata?.full_name || user.user_metadata?.name || '' };
  } catch { return null; }
};
app.get('/api/chat/status', (req,res) => res.set('Cache-Control','no-store').json(chatSvc.status()));
app.post('/api/chat/messages', async (req,res) => {
  try { res.status(201).json(await chatSvc.postMessage({ token: chatToken(req), text: req.body?.text, name: req.body?.name, user: await optionalUser(req), ip: req.ip })); }
  catch (e) { chatError(res, e); }
});
app.get('/api/chat/messages', async (req,res) => {
  try { res.set('Cache-Control','no-store').json(await chatSvc.poll({ token: chatToken(req), afterId: req.query.after, ip: req.ip })); }
  catch (e) { chatError(res, e); }
});
// Сюда Telegram присылает сообщения менеджеров (регистрируется скриптом set-chat-webhook.mjs)
app.post('/api/chat/telegram', async (req,res) => {
  if (!chatSvc.checkWebhookSecret(req.headers['x-telegram-bot-api-secret-token'])) return res.status(401).json({ error: 'Unauthorized' });
  try { await chatSvc.handleTelegramUpdate(req.body); } catch (e) { console.error('❌ Чат (webhook):', e?.message || 'ошибка'); }
  res.json({ ok: true });   // Telegram всегда получает 200, иначе он будет слать то же сообщение повторно
});

// Фото товаров через наш сервер: покупатель не видит адрес поставщика. Забираем только картинки, имя файла строго проверяем.
app.get('/media/:file', rateLimit({windowMs:60000,max:1500}), async (req,res) => {
  const file = privacy.resolveMediaFile(req.params.file);   // p…_1.jpg -> 92544_1.jpg; недопустимые имена -> null
  if (!file) return res.status(404).end();
  try {
    const up = await axios.get(`${IMG_UPSTREAM}/${file}`, { responseType: 'stream', timeout: 15000, maxRedirects: 0, validateStatus: () => true });
    const type = String(up.headers['content-type'] || '');
    if (up.status !== 200 || !type.startsWith('image/')) { up.data.destroy(); return res.status(404).end(); }
    res.set({ 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
    if (up.headers['content-length']) res.set('Content-Length', up.headers['content-length']);
    up.data.pipe(res);
  } catch { if (!res.headersSent) res.status(502).end(); }
});

app.get('/health', (req,res) => res.json({ status:'OK', token:!!ALSTYLE_TOKEN, supabase:!!supabaseAdmin, apipay: apipaySvc.configured, hideSupplier: privacy.enabled, hideIds: privacy.codecOn, chat: chatSvc.configured, markupOnServer: MARKUP_ON_SERVER, cache:cache.size, usdRate: usdRate ? Math.round(usdRate*100)/100 : null, usdRateSource }));

// Поиск: ё=е, регистр не важен, запрос из нескольких слов = все слова должны встретиться (в названии, полном названии или бренде)
const normSearch = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
const searchTokens = (q) => normSearch(q).slice(0, 80).split(' ').filter(Boolean).slice(0, 6);
function searchScore(p, tokens) {
  const name = normSearch(p.name), full = normSearch(p.full_name), brand = normSearch(p.brand);
  let score = 0;
  for (const t of tokens) {
    if (name.split(/[\s"«»()\/,.\-]+/).some(w => w.startsWith(t))) score += 4;      // слово в названии начинается с запроса («наушник» -> «Наушники»)
    else if (name.includes(t)) score += 2;
    else if (brand.includes(t)) score += 2;
    else if (full.includes(t)) score += 1;
    else return 0;                                                                // какого-то слова запроса нет совсем: товар не подходит
  }
  return score;
}

app.get('/api/products', rateLimit({windowMs:60000,max:300}), async (req,res) => {
  try {
    const {limit=12,offset=0,minPrice,maxPrice,brand,onlyNew,search,sortBy}=req.query;
    const cat = parseCategoryParam(req.query.category);
    let products;
    // «Новинки» берутся из общего кеша товаров (loadAllProductsForSearch) и проходят те же фильтры, что и остальные списки
    const tokens = searchTokens(search);
    // «Новинки» и поиск без категории берутся из общего кеша ВСЕХ товаров (раньше поиск шёл только по 1000 самых дорогих)
    if ((onlyNew==='true'||tokens.length)&&!cat) { products=await loadAllProductsForSearch().catch(()=>[]); }
    else { const data=await loadProducts(cat).catch(()=>null); if(!data)return res.status(502).json({error:'Не удалось загрузить товары',elements:[],pagination:{totalCount:0,hasMore:false}}); products=data.elements||[]; }
    products = products.map(normalizePrice).filter(isListable); // везде дилерская цена; только товары в наличии, с фото и реальной ценой
    if (minPrice||maxPrice) products=products.filter(p=>{const pr=p.price2||p.price1||0;return(!minPrice||pr>=+minPrice)&&(!maxPrice||pr<=+maxPrice);});
    if (brand) products=products.filter(p=>p.brand?.toLowerCase()===brand.toLowerCase());
    if (onlyNew==='true') products=products.filter(p=>p.isnew===1);
    if (tokens.length){products=products.map(p=>({p,sc:searchScore(p,tokens)})).filter(x=>x.sc>0).map(x=>{x.p.__score=x.sc;return x.p;});}
    products = [...products]; // копия: sort() ниже иначе сортирует закешированный массив на месте
    if(sortBy==='price_asc') products.sort((a,b)=>sortPrice(a,true)-sortPrice(b,true));
    else if(sortBy==='price_desc') products.sort((a,b)=>sortPrice(b)-sortPrice(a));
    else if(sortBy==='name_asc') products.sort((a,b)=>(a.name||'').localeCompare(b.name||'','ru'));
    else if(sortBy==='newest') products.sort((a,b)=>(b.isnew||0)-(a.isnew||0)||(b.price2||b.price1||0)-(a.price2||a.price1||0));
    else if(tokens.length) products.sort((a,b)=>(b.__score||0)-(a.__score||0)||(b.price2||b.price1||0)-(a.price2||a.price1||0));   // поиск: сначала самые подходящие
    else {
      // По умолчанию: убираем товары дороже 1М, новинки вперёд, потом по цене убыванию
      products = products.filter(p => p.source === 'manual' || (p.price2||p.price1||0) <= 1000000);
      products.sort((a, b) => {
        const pa = a.price2||a.price1||0, pb = b.price2||b.price1||0;
        if ((b.isnew||0) !== (a.isnew||0)) return (b.isnew||0) - (a.isnew||0);
        return pb - pa;
      });
    }
    const start=Number(offset),end=start+Number(limit);
    res.set('Cache-Control','public, max-age=60').json({elements:products.slice(start,end).map(({__score,...p})=>p),pagination:{totalCount:products.length,total:products.length,offset:start,limit:Number(limit),hasMore:end<products.length}});
  } catch(e){console.error('❌ /api/products:',e.message);res.status(500).json({error:e.message,elements:[],pagination:{totalCount:0,hasMore:false}});}
});

app.get('/api/product/:article', async (req,res) => {
  try {
    const art = privacy.decodeArticle(req.params.article);   // код p… -> настоящий номер; «свои» артикулы и старые номера как есть
    if (/[A-Za-z]/.test(art) && supabaseAdmin) {
      const { data: m } = await supabaseAdmin.from('products')
        .select('article,name,full_name,brand,price1,price_usd,quantity,image_url,description,unit,source,category_id,category_name')
        .eq('article', art).eq('source', 'manual').maybeSingle();
      if (m) return res.json(normalizePrice({ ...m, images: m.image_url ? [m.image_url] : [], image: m.image_url }));
    }
    const key=`product_${art}`;
    const cached=getCache(key,CACHE_TIMES.product); if(cached)return res.json(normalizePrice(cached));
    const product=await fetchOnce(key,()=>enqueueApiCall(async()=>{const{data}=await api.get('/element-info',{params:{'access-token':ALSTYLE_TOKEN,article:art,additional_fields:'brand,images,description'}});const d=Array.isArray(data)?data[0]:data;setCache(key,d);return d;}));
    if (!product || (!product.article && !product.name)) return res.status(404).json({ error: 'Товар не найден' });
    res.json(normalizePrice(product));
  } catch(e){res.status(500).json({error:e.message});}
});

app.get('/api/categories', async (req,res) => {
  try {
    const cached=getCache('categories',CACHE_TIMES.categories); if(cached)return res.json([...cached, ...(await getManualCategories())]);
    const cats=await fetchOnce('categories',()=>enqueueApiCall(async()=>{console.log('📦 API: загрузка категорий...');const{data}=await api.get('/categories',{params:{'access-token':ALSTYLE_TOKEN}});const c=Array.isArray(data)?data:[];setCache('categories',c);console.log('✅ Категорий:',c.length);return c;}));
    res.json([...cats, ...(await getManualCategories())]);
  } catch(e){res.status(500).json({error:e.message});}
});

app.get('/api/search', rateLimit({windowMs:60000,max:100}), async (req,res) => {
  try {
    const raw = typeof req.query.q === 'string' ? req.query.q : '';
    // вырезаем символы, которые ломают синтаксис PostgREST-фильтра .or() и LIKE-шаблоны
    const q = raw.replace(/[%,()*\\_"'`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 64);
    if (q.length < 2) return res.json([]);
    if(supabaseAdmin){try{const{data,error}=await supabaseAdmin.from('products').select('article,name,brand,price,price1,price_usd,unit,source,isnew,image_url,quantity').neq('quantity','0').or(`name.ilike.%${q}%,brand.ilike.%${q}%,article.ilike.%${q}%`).order('price',{ascending:false}).limit(20);if(!error&&data?.length>0){console.log(`🔍 PG "${q}": ${data.length} результатов`);return res.json(data.map(p=>normalizePrice({...p,image:p.image_url,images:p.image_url?[p.image_url]:[]})).filter(isListable));}}catch(e){console.warn('⚠️ PG поиск fallback:',e.message);}}
    const products=(await loadAllProductsForSearch().catch(()=>[])).filter(isListable);
    const s=q.toLowerCase();
    const results=products.map(p=>{let score=0;if(p.brand?.toLowerCase().includes(s))score+=3;if(p.name?.toLowerCase().includes(s))score+=2;return score?{...p,score}:null;}).filter(Boolean).sort((a,b)=>b.score-a.score).slice(0,20).map(({score,...p})=>normalizePrice(p));
    console.log(`🔍 RAM "${q}": ${results.length} результатов`); res.json(results);
  } catch(e){console.error('❌ search:',e.message);res.json([]);}
});

// ─── Заказ в al-style: auth + проверка владельца + идемпотентность + mutex ──
const processedOrders = new Map(); // orderId -> { job, ts }
setInterval(() => { const c = Date.now() - 24*60*60*1000; for (const [id, o] of processedOrders) if (o.ts < c) processedOrders.delete(id); }, 60*60*1000);

async function submitToAlstyle(items, comment, orderId) {
  const fail = (status, message) => Object.assign(new Error(message), { status });
  const { data: ud } = await api.get('/user-data', { params: { 'access-token': ALSTYLE_TOKEN } });
  const userData = ud?.data; if (!userData) throw fail(500, 'Не удалось получить данные пользователя');
  const attorney = userData['Доверенности']?.find(d => d['Основной'] && !d['empty']) || userData['Доверенности']?.[0];
  const delivery = userData['Транспортники']?.find(d => d['Основной']) || userData['Транспортники']?.[0];
  if (!attorney || !delivery) throw fail(500, 'Не найдены доверенность или способ доставки');
  await cartApi.get('/clear', { params: { 'access-token': ALSTYLE_TOKEN } });
  await cartApi.get('/add', { params: { 'access-token': ALSTYLE_TOKEN, add: items.map(i => i.article).join(','), quantity: items.map(i => i.quantity).join(',') } });
  const d = new Date(); d.setDate(d.getDate() + 1);
  const ship = `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
  const { data: sr } = await cartApi.post('/submit', null, { params: {
    'access-token': ALSTYLE_TOKEN,
    comments: `Заказ с сайта stockeratrade.com. ID: ${orderId}. ${String(comment || '').slice(0, 500)}`,
    shipping_date: ship, attorney_json: JSON.stringify(attorney), delivery_json: JSON.stringify(delivery), external_id: orderId,
  } });
  const alstyleOrderId = sr?.data?.id; console.log(`✅ Заказ создан в al-style: #${alstyleOrderId}`);
  return { alstyleOrderId };
}

app.post('/api/alstyle-order', rateLimit({windowMs:60000,max:30,message:'Подождите перед следующим заказом'}), requireAuth, async (req,res) => {
  try {
    const { items, comment, orderId } = req.body || {};
    if (!orderId || typeof orderId !== 'string') return res.status(400).json({ error: 'orderId обязателен' });
    const clean = normalizeItems(items);
    if (!clean) return res.status(400).json({ error: 'Некорректные items' });

    // заказ должен существовать и принадлежать этому пользователю
    const { data: ord, error: oe } = await supabaseAdmin.from('orders').select('id,user_id').eq('id', orderId).maybeSingle();
    if (oe) return res.status(500).json({ error: oe.message });
    if (!ord || ord.user_id !== req.user.id) return res.status(403).json({ error: 'Заказ не найден' });

    // идемпотентность: повторный вызов с тем же orderId вернёт результат первого, а не создаст второй заказ
    let entry = processedOrders.get(orderId);
    const duplicate = !!entry;
    if (!entry) {
      const job = withOrderLock(() => submitToAlstyle(clean, comment, orderId));
      entry = { job, ts: Date.now() };
      processedOrders.set(orderId, entry);
      job.catch(() => processedOrders.delete(orderId)); // при ошибке разрешаем повторить
    }
    const result = await entry.job;
    res.json({ success: true, ...result, duplicate });
  } catch(e){console.error('❌ al-style order:',e.response?.data||e.message);res.status(e.status||500).json({error:e.response?.data?.message||e.message});}
});

// ─── Данные покупателя: обязательны для любого заказа ────────────────
const cleanText = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const NAME_RE = /^\p{L}[\p{L}'’.\-]+(?:\s+\p{L}[\p{L}'’.\-]+)+$/u;   // минимум два слова: фамилия и имя

function normalizePhone(v) {
  const raw = String(v ?? '').trim();
  let d = raw.replace(/\D/g, '');
  if (d.length === 11 && d[0] === '8') d = '7' + d.slice(1);              // 8 701 ... -> 7 701 ...
  if (d.length === 10) d = '7' + d;                                       // 701 123 45 67 -> 7 701 ...
  if (/^7\d{10}$/.test(d)) return '+' + d;                                // Казахстан / Россия
  if (raw.startsWith('+') && d.length >= 10 && d.length <= 15) return '+' + d;   // другая страна
  return null;
}

function validateCustomer(body) {
  const customer_name = cleanText(body.customer_name, 100);
  const phone = normalizePhone(body.phone);
  const address_text = cleanText(body.address_text, 300);
  const fields = {};
  if (customer_name.length < 5 || !NAME_RE.test(customer_name)) fields.customer_name = 'Укажите полное имя: фамилию и имя';
  if (!phone) fields.phone = 'Укажите номер телефона, например +7 701 123 45 67';
  if (address_text.length < 10 || address_text.split(' ').length < 2) fields.address_text = 'Укажите полный адрес доставки: город, улица, дом';
  return { customer_name, phone, address_text, fields, ok: Object.keys(fields).length === 0 };
}

// Заказ возможен только из аккаунта (requireAuth) и только с именем, телефоном и адресом
app.post('/api/orders', rateLimit({windowMs:60000,max:60}), requireAuth, async (req,res) => {
  try {
    const { items, address_id, comment } = req.body || {};
    const customer = validateCustomer(req.body || {});
    if (!customer.ok) return res.status(400).json({ error: 'Заполните обязательные поля', fields: customer.fields });
    const clean = normalizeItems(items);
    if (!clean) return res.status(400).json({ error: 'Некорректные items' });

    // цены и названия берём из нашей базы, а не от клиента
    const articles = [...new Set(clean.map(i => i.article))];
    const { data: prods, error: pe } = await supabaseAdmin.from('products').select('article,name,price,price1,price_usd,unit,quantity').in('article', articles);
    if (pe) return res.status(500).json({ error: pe.message });
    const byArt = new Map((prods || []).map(p => [String(p.article), p]));
    const missing = articles.filter(a => !byArt.has(a));
    if (missing.length) return res.status(400).json({ error: 'Товары не найдены', missing: missing.map(privacy.encodeArticle) });
    const noPrice = articles.filter(a => dealerPrice(byArt.get(a)) <= 1);
    if (noPrice.length) return res.status(400).json({ error: 'Цена по запросу, оформить через менеджера', articles: noPrice.map(privacy.encodeArticle) });
    // нельзя заказать больше, чем есть на складе (">10" и подобное считаем "много" и не ограничиваем)
    const stockNumber = q => {
      if (q === undefined || q === null) return Infinity;
      if (typeof q === 'number') return q;
      const str = String(q).trim();
      if (!str) return 0;
      if (str.startsWith('>')) return Infinity;
      const n = parseInt(str, 10);
      return Number.isNaN(n) ? 0 : n;
    };
    const short = clean.map(i => ({ i, p: byArt.get(i.article), have: stockNumber(byArt.get(i.article)?.quantity) })).filter(x => x.i.quantity > x.have);
    if (short.length) {
      const list = short.map(x => `${x.p.name} (в наличии ${x.have} шт.)`).join('; ');
      return res.status(400).json({ error: `Недостаточно товара в наличии: ${list}. Уменьшите количество в корзине.`, articles: short.map(x => privacy.encodeArticle(x.i.article)) });
    }
    const priced = clean.map(i => { const p = byArt.get(i.article); return { article: i.article, name: p.name, quantity: i.quantity, unit: p.unit || 'шт.', price: applyMarkup(dealerPrice(p)) }; });
    const total_price = priced.reduce((s, i) => s + i.price * i.quantity, 0);

    const base = {
      user_id: req.user.id, items: priced, total_price,
      address_id: address_id || null, address_text: customer.address_text,
      comment: comment ? cleanText(comment, 1000) : null, status: 'pending',
    };
    let { data, error } = await supabaseAdmin.from('orders')
      .insert({ ...base, customer_name: customer.customer_name, phone: customer.phone }).select().single();
    // если колонок customer_name / phone в таблице ещё нет, сохраняем контакты в комментарии, чтобы заказ не потерялся
    if (error && /customer_name|phone|column/i.test(error.message)) {
      const contact = `Имя: ${customer.customer_name} | Тел: ${customer.phone}`;
      ({ data, error } = await supabaseAdmin.from('orders')
        .insert({ ...base, comment: [contact, base.comment].filter(Boolean).join(' | ') }).select().single());
    }
    if (error) return res.status(500).json({ error: error.message });

    const orderItems = priced.map(i => `• ${esc(i.name || 'Товар')} × ${i.quantity} ${esc(i.unit || 'шт.')} — ${(i.price * i.quantity).toLocaleString('ru-RU')} ₸`).join('\n');
    const msg = `🛒 <b>Новый заказ #${data.id?.slice(0,8).toUpperCase()}</b>\n\n👤 ${esc(customer.customer_name)}\n📱 ${esc(customer.phone)}\n📧 ${esc(req.user.email || '')}\n📍 ${esc(customer.address_text)}\n${apipaySvc.configured ? '💳 Оплата: ожидается (Kaspi)\n' : ''}${base.comment ? `💬 ${esc(base.comment)}\n` : ''}\n📦 <b>Товары:</b>\n${orderItems}\n\n💰 <b>Итого: ${total_price.toLocaleString('ru-RU')} ₸</b>`;
    sendTelegramNotification(msg).catch(()=>{});
    res.json({ success: true, order: privacy.publicOrder(data) });
  } catch(e){res.status(500).json({error:e.message});}
});

// ═══ Оплата заказа через ApiPay (Kaspi) ═══
// Нужна переменная APIPAY_API_KEY (Railway → Variables). Без неё заказы работают как раньше, оплата отключена.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const apipayStore = {
  async getOrder(id, userId) {
    let q = supabaseAdmin.from('orders').select('*').eq('id', id);
    if (userId) q = q.eq('user_id', userId);
    const { data, error } = await q.maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },
  async saveOrder(id, patch) {
    const { error } = await supabaseAdmin.from('orders').update(patch).eq('id', id);
    if (error) throw new Error(error.message);
  },
  // true только если ЭТОТ запрос перевёл заказ в paid (защита от двойного Telegram при гонке опроса и сверки)
  async markPaid(id, patch) {
    const { data, error } = await supabaseAdmin.from('orders').update(patch).eq('id', id).neq('payment_status', 'paid').select('id');
    if (error) throw new Error(error.message);
    return (data || []).length > 0;
  },
  // открытые заказы + закрытые без оплаты счета ещё 24 часа (они могут стать paid)
  async listOpen(limit) {
    const since = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
    const closedSince = Date.now() - 24 * 3600 * 1000;
    const { data, error } = await supabaseAdmin.from('orders').select('*')
      .not('payment_invoice_id', 'is', null).in('payment_status', ['pending', 'failed']).gte('created_at', since).limit(limit);
    if (error) throw new Error(error.message);
    return (data || []).filter(o => o.payment_status === 'pending' || (o.payment_closed_at && Date.parse(o.payment_closed_at) > closedSince));
  },
};
const apipaySvc = createApiPayService({
  apiKey: process.env.APIPAY_API_KEY,
  http: axios.create({ baseURL: process.env.APIPAY_BASE_URL || DEFAULT_BASE_URL, timeout: 15000 }),
  store: apipayStore,
  notify: sendTelegramNotification,
});
const sendPayError = (res, e) => {
  if (e instanceof UserError) return res.status(e.status).json({ error: e.message });
  console.error('❌ Оплата:', e?.message || 'ошибка');
  return res.status(500).json({ error: 'Не удалось обработать оплату. Заказ сохранён, менеджер свяжется с вами.' });
};

// Выставить счёт Kaspi по заказу (сумму и телефон берём из заказа в базе, не от клиента)
app.post('/api/orders/:id/pay', rateLimit({windowMs:60000,max:20,message:'Слишком много попыток оплаты'}), requireAuth, async (req,res) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'Некорректный номер заказа' });
    const kaspiPhone = typeof req.body?.kaspi_phone === 'string' ? req.body.kaspi_phone.slice(0, 30) : undefined;
    res.json(await apipaySvc.startPayment({ orderId: req.params.id, userId: req.user.id, kaspiPhone }));
  } catch (e) { sendPayError(res, e); }
});

// Состояние оплаты (его опрашивает страница оплаты; к ApiPay мы обращаемся не чаще раза в 3 с на заказ)
app.get('/api/orders/:id/payment', rateLimit({windowMs:60000,max:60}), requireAuth, async (req,res) => {
  try {
    if (!UUID_RE.test(req.params.id)) return res.status(400).json({ error: 'Некорректный номер заказа' });
    res.set('Cache-Control', 'no-store').json(await apipaySvc.getState({ orderId: req.params.id, userId: req.user.id }));
  } catch (e) { sendPayError(res, e); }
});

app.get('/api/orders', requireAuth, async (req,res) => {
  try {
    const{data,error}=await supabaseAdmin.from('orders').select('*').eq('user_id',req.user.id).order('created_at',{ascending:false});
    if(error)return res.status(500).json({error:error.message}); res.json((data||[]).map(privacy.publicOrder));
  } catch(e){res.status(500).json({error:e.message});}
});

app.post('/api/favorites', requireAuth, async (req,res) => {
  try {
    const{article,name,price,image_url}=req.body;
    const{data,error}=await supabaseAdmin.from('favorites').upsert({user_id:req.user.id,article,name,price,image_url},{onConflict:'user_id,article'}).select().single();
    if(error)return res.status(500).json({error:error.message}); res.json({success:true,favorite:data});
  } catch(e){res.status(500).json({error:e.message});}
});

app.delete('/api/favorites/:article', requireAuth, async (req,res) => {
  try {
    const{error}=await supabaseAdmin.from('favorites').delete().eq('user_id',req.user.id).eq('article',req.params.article);
    if(error)return res.status(500).json({error:error.message}); res.json({success:true});
  } catch(e){res.status(500).json({error:e.message});}
});

// Гостевой эндпоинт (без auth), поэтому: жёсткий лимит, обрезка длины и экранирование HTML
// Гостевых заказов больше нет: уведомление в Telegram отправляет сам /api/orders.
// Эндпоинт оставлен, чтобы старый код фронта не падал, но без входа в аккаунт он недоступен.
app.post('/api/notify-order', rateLimit({windowMs:60000,max:30}), requireAuth, (req,res) => res.json({ success: true, skipped: true }));

// ─── Синхронизация каталога ──────────────────────────────────
let syncRunning = false;

app.post('/api/admin/sync', async (req,res) => {
  if (!SYNC_SECRET || req.headers['x-sync-secret'] !== SYNC_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  if (syncRunning) return res.status(409).json({ error: 'Синхронизация уже идёт' });
  res.json({ message: 'Синхронизация запущена в фоне' });
  syncProductsToSupabase().catch(console.error);
});

// Отпечаток строки каталога: по нему понимаем, что товар изменился (цена, остаток, название, фото, категория)
const numSig = v => (v == null || v === '' ? '' : String(Number(v)));
const rowSig = r => [r.name, r.full_name, r.brand, numSig(r.price), numSig(r.price1), numSig(r.price2), r.quantity, numSig(r.isnew), r.image_url, r.category_id].map(v => (v == null ? '' : String(v))).join('\u0001');

// Что сейчас лежит в базе из Al-Style: артикул -> { отпечаток, виден ли }. Читаем страницами по 1000 строк.
async function loadAlstyleSnapshot() {
  const map = new Map();
  for (let from = 0; from < 200000; ) {
    const data = await dbCall('чтение каталога', () => supabaseAdmin.from('products')
      .select('article,name,full_name,brand,price,price1,price2,quantity,isnew,image_url,category_id')
      .eq('source', 'alstyle').order('article').range(from, from + 999));
    if (!data?.length) break;
    for (const r of data) map.set(r.article, { sig: rowSig(r), active: r.quantity !== '0' });
    from += data.length;
  }
  return map;
}

let lastSyncFailed = false;
async function syncProductsToSupabase() {
  if (!supabaseAdmin) return;
  if (syncRunning) { console.log('⏭️ Синхронизация уже идёт, пропускаем'); return; }
  syncRunning = true;
  console.log('🔄 Синхронизация товаров с al-style...');
  const start = Date.now(); let seenCount = 0, written = 0, unchanged = 0, offset = 0, total = null;
  try {
    // 1) снимок базы: нужен, чтобы не переписывать неизменившиеся товары (раньше каждый час писали все 13 тысяч строк)
    let snapshot = null;
    try { snapshot = await loadAlstyleSnapshot(); }
    catch (e) { console.warn('⚠️ Не удалось прочитать каталог из базы, пишем всё без сравнения:', e.message); }
    const seen = new Set(), pending = [];
    const flush = async (all) => {
      while (pending.length >= 100 || (all && pending.length)) {
        const batch = pending.splice(0, 100);
        await dbCall('запись товаров', () => supabaseAdmin.from('products').upsert(batch, { onConflict: 'article' }));
        written += batch.length;
        if (DB_PAUSE_MS) await sleep(DB_PAUSE_MS);
      }
    };
    do {
      const data = await fetchCatalogPage(offset); // бросает ошибку, если страница не загрузилась (после повторов)
      const els = data.elements || []; if (!els.length) break;
      if (!total) total = data.pagination?.totalCount || 0;
      for (const p of els) {
        const row = {
          article: String(p.article), name: p.name||'', full_name: p.full_name||'', brand: p.brand||'',
          price: dealerPrice(p), price1: p.price1||null, price2: p.price2||null,
          quantity: String(p.quantity ?? '0'), isnew: p.isnew||0, image_url: p.images?.[0]||null,
          images: JSON.stringify(p.images||[]), category_id: p.category_id ? String(p.category_id) : null,
          raw_data: '{}', synced_at: new Date().toISOString(),
        };
        seen.add(row.article);
        const prev = snapshot?.get(row.article);
        if (prev && prev.active && prev.sig === rowSig(row)) unchanged++; else pending.push(row);
      }
      await flush(false);
      offset += 250;
    } while (total && offset < total);
    await flush(true);
    seenCount = seen.size;
    console.log(`✅ Синхронизация завершена: в Al-Style ${seenCount}, записано ${written}, без изменений ${unchanged}, за ${Math.round((Date.now()-start)/1000)}с`);
    // Товары, которых нет в свежей выдаче (закончились у поставщика), прячем: обнуляем остаток.
    // Только если синк прошёл почти целиком, чтобы сбой API не скрыл весь каталог.
    if (snapshot && total && seenCount >= total * 0.9) {
      const stale = [...snapshot].filter(([a, v]) => v.active && !seen.has(a)).map(([a]) => a);
      for (let i = 0; i < stale.length; i += 100)
        await dbCall('скрытие устаревших', () => supabaseAdmin.from('products').update({ quantity: '0' }).in('article', stale.slice(i, i + 100)));
      if (stale.length) console.log(`🙈 Скрыто устаревших товаров: ${stale.length}`);
    }
    cache.delete('search_all_products_v3'); if (redis) await redis.del('search_all_products_v3').catch(()=>{});
    if (lastSyncFailed) { lastSyncFailed = false; await sendTelegramNotification('✅ <b>Синхронизация каталога восстановилась</b>'); }
  } catch (e) {
    lastSyncFailed = true;
    console.error('❌ Ошибка синхронизации:', e.message);
    await sendTelegramNotification(`⚠️ <b>Ошибка синхронизации каталога</b>\n${esc(e.message)}\nВ Al-Style просмотрено: ${seenCount || offset}${total ? ` из ${total}` : ''}, записано изменений: ${written}`);
  } finally {
    syncRunning = false;
  }
}

async function warmupCache() {
  console.log('🔥 Прогрев кеша...');
  try {
    const{data}=await api.get('/categories',{params:{'access-token':ALSTYLE_TOKEN}});
    const cats=Array.isArray(data)?data:[];setCache('categories',cats);console.log(`✅ Категорий: ${cats.length}`);
    await loadProducts(null);
    const rd=await getRedisCacheOrNull('search_all_products_v3');
    if(rd){setCache('search_all_products_v3',rd);console.log(`✅ Кеш поиска из Redis: ${rd.length} товаров — мгновенно!`);return;}
    console.log('ℹ️  Redis пустой — поиск будет читать из Supabase до следующей синхронизации');
    loadAllProductsForSearch().catch(e=>console.warn('⚠️ Фоновая загрузка:',e.message));
  } catch(e){console.warn('⚠️ Прогрев не удался:',e.message);}
}

app.listen(PORT, () => {
  console.log(`📡 Port: ${PORT}`);
  console.log(`💳 Оплата ApiPay: ${apipaySvc.configured ? '✅ ключ задан' : '⚠️  APIPAY_API_KEY не задан, оплата отключена'}`);
  console.log(`💬 Онлайн-чат: ${chatSvc.configured ? '✅ включён' : '⚠️  выключен (нужны CHAT_WEBHOOK_SECRET, бот и чат Telegram)'}`);
  if (chatSvc.configured) setInterval(() => chatSvc.flushPending().catch(e => console.warn('⚠️ Чат (досылка):', e?.message || 'ошибка')), 60 * 1000);
  if (apipaySvc.configured) setInterval(() => apipaySvc.reconcile().catch(e => console.warn('⚠️ Сверка оплаты:', e?.message || 'ошибка')), 90 * 1000);
  refreshUsdRate(); setInterval(refreshUsdRate, 6*60*60*1000);
  setTimeout(warmupCache, 30000);
  setTimeout(async()=>{ await syncProductsToSupabase(); setInterval(syncProductsToSupabase,60*60*1000); }, 5*60*1000);
});