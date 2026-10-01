import express from 'express';
import compression from 'compression';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { Redis } from '@upstash/redis';

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
const applyMarkup = price => Math.round(price * (1 + MARKUP_PERCENT / 100));

// Цена для клиента = ДИЛЕРСКАЯ (price1) + MARKUP_PERCENT, а не розничная price2.
// По документации Al-Style: price1 = 1 означает «цена по запросу» (фронт показывает price === 1).
const dealerPrice = p => { const v = Number(p?.price1); return v > 1 ? v : 1; };
// Приводит товар к единой цене: price, price1 и price2 = дилерская. Что бы ни читал фронт, он увидит её.
const normalizePrice = p => { const d = dealerPrice(p); return { ...p, retail_price: p.price2 ?? null, price: d, price1: d, price2: d }; };
// Для сортировки: «по запросу» (1) уходит в конец
const sortPrice = (p, asc = false) => (p.price2 > 1 ? p.price2 : (asc ? Number.MAX_SAFE_INTEGER : 0));

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
app.set('trust proxy', 1); // 1 прокси перед приложением (Railway/Render/Fly и т.п.); req.ip станет настоящим IP клиента
app.use(compression());
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || !ALLOWED_ORIGINS.length || ALLOWED_ORIGINS.includes(origin)),
  credentials: true,
}));
app.use(express.json({ limit: '200kb' }));
app.use((req, res, next) => { console.log(`${new Date().toLocaleTimeString()} ${req.method} ${req.path}`); next(); });

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
const API_MIN_INTERVAL = 5000;
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

const api     = axios.create({ baseURL: 'https://api.al-style.kz/api',      timeout: 30000 });
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
      if (e.response?.status === 403 && retries < 3) { retries++; await sleep(10000 * retries); }
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
      let query = supabaseAdmin.from('products')
        .select('article, name, full_name, brand, price, price1, price2, isnew, quantity, image_url, category_id')
        .order('price', { ascending: false })
        .limit(250);
      if (cat) query = query.eq('category_id', cat);
      const { data, error } = await query;
      if (!error && data?.length > 0) {
        const elements = data.map(p => ({
          article: p.article, name: p.name, full_name: p.full_name,
          brand: p.brand, price: p.price, price1: p.price1, price2: p.price2,
          isnew: p.isnew, quantity: p.quantity,
          images: p.image_url ? [p.image_url] : [], image: p.image_url,
          category_id: p.category_id,
        }));
        const result = { elements, pagination: { totalCount: data.length } };
        setCache(key, result);
        if (!cat) setCache('products_cat_all', result);
        console.log(`✅ Загружено из Supabase: ${elements.length} товаров`);
        return result;
      }
    } catch (e) { console.warn('⚠️ Supabase loadProducts fallback:', e.message); }
  }

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
        let from = 0;
        const pageSize = 1000;
        while (true) {
          const { data, error } = await supabaseAdmin.from('products')
            .select('article, name, full_name, brand, price, price1, isnew, quantity, image_url')
            .order('price', { ascending: false })
            .range(from, from + pageSize - 1);
          if (error || !data?.length) break;
          allData.push(...data);
          if (data.length < pageSize) break;
          from += pageSize;
        }
        if (allData.length > 0) {
          const compact = allData.map(p => ({ article: p.article, name: p.name||'', full_name: p.full_name||'', brand: p.brand||'', price: dealerPrice(p), price1: dealerPrice(p), isnew: p.isnew||0, quantity: p.quantity, image: p.image_url||null }));
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
  const clean = items.map(i => ({ article: String(i?.article ?? '').trim(), quantity: Math.floor(Number(i?.quantity)) }));
  if (clean.some(i => !/^[\w.\-]+$/.test(i.article) || !(i.quantity > 0) || i.quantity > 10000)) return null;
  return clean;
}

// ═══════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════
app.get('/health', (req,res) => res.json({ status:'OK', token:!!ALSTYLE_TOKEN, supabase:!!supabaseAdmin, cache:cache.size }));

app.get('/api/products', rateLimit({windowMs:60000,max:300}), async (req,res) => {
  try {
    const {limit=12,offset=0,minPrice,maxPrice,brand,onlyNew,search,sortBy}=req.query;
    const cat = parseCategoryParam(req.query.category);
    let products;
    if (onlyNew==='true'&&!cat&&supabaseAdmin&&!search&&(!sortBy||sortBy==='smart')&&!minPrice&&!maxPrice&&!brand) {
      try {
        const start=Number(offset);
        const {data,error,count}=await supabaseAdmin.from('products').select('*',{count:'exact'}).eq('isnew',1).order('price',{ascending:false}).range(start,start+Number(limit)-1);
        if (!error) { const els=(data||[]).map(p=>normalizePrice({article:p.article,name:p.name,brand:p.brand,price1:p.price1,price2:p.price2,price:p.price,isnew:p.isnew,quantity:p.quantity,images:p.image_url?[p.image_url]:[],image:p.image_url})); return res.set('Cache-Control','public, max-age=60').json({elements:els,pagination:{totalCount:count,total:count,offset:start,limit:Number(limit),hasMore:start+els.length<count}}); }
      } catch(e){console.warn('⚠️ PG onlyNew fallback:',e.message);}
    }
    if (onlyNew==='true'&&!cat) { products=await loadAllProductsForSearch().catch(()=>[]); }
    else { const data=await loadProducts(cat).catch(()=>null); if(!data)return res.status(502).json({error:'Не удалось загрузить товары',elements:[],pagination:{totalCount:0,hasMore:false}}); products=data.elements||[]; }
    products = products.map(normalizePrice); // везде дилерская цена
    if (minPrice||maxPrice) products=products.filter(p=>{const pr=p.price2||p.price1||0;return(!minPrice||pr>=+minPrice)&&(!maxPrice||pr<=+maxPrice);});
    if (brand) products=products.filter(p=>p.brand?.toLowerCase()===brand.toLowerCase());
    if (onlyNew==='true') products=products.filter(p=>p.isnew===1);
    if (search){const s=search.toLowerCase();products=products.filter(p=>p.name?.toLowerCase().includes(s)||p.full_name?.toLowerCase().includes(s)||p.brand?.toLowerCase().includes(s));}
    products = [...products]; // копия: sort() ниже иначе сортирует закешированный массив на месте
    if(sortBy==='price_asc') products.sort((a,b)=>sortPrice(a,true)-sortPrice(b,true));
    else if(sortBy==='price_desc') products.sort((a,b)=>sortPrice(b)-sortPrice(a));
    else if(sortBy==='name_asc') products.sort((a,b)=>(a.name||'').localeCompare(b.name||'','ru'));
    else if(sortBy==='newest') products.sort((a,b)=>(b.isnew||0)-(a.isnew||0)||(b.price2||b.price1||0)-(a.price2||a.price1||0));
    else {
      // По умолчанию: убираем товары дороже 1М, новинки вперёд, потом по цене убыванию
      products = products.filter(p => (p.price2||p.price1||0) <= 1000000);
      products.sort((a, b) => {
        const pa = a.price2||a.price1||0, pb = b.price2||b.price1||0;
        if ((b.isnew||0) !== (a.isnew||0)) return (b.isnew||0) - (a.isnew||0);
        return pb - pa;
      });
    }
    const start=Number(offset),end=start+Number(limit);
    res.set('Cache-Control','public, max-age=60').json({elements:products.slice(start,end),pagination:{totalCount:products.length,total:products.length,offset:start,limit:Number(limit),hasMore:end<products.length}});
  } catch(e){console.error('❌ /api/products:',e.message);res.status(500).json({error:e.message,elements:[],pagination:{totalCount:0,hasMore:false}});}
});

app.get('/api/product/:article', async (req,res) => {
  try {
    const key=`product_${req.params.article}`;
    const cached=getCache(key,CACHE_TIMES.product); if(cached)return res.json(normalizePrice(cached));
    const product=await fetchOnce(key,()=>enqueueApiCall(async()=>{const{data}=await api.get('/element-info',{params:{'access-token':ALSTYLE_TOKEN,article:req.params.article,additional_fields:'brand,images,description'}});const d=Array.isArray(data)?data[0]:data;setCache(key,d);return d;}));
    res.json(product ? normalizePrice(product) : product);
  } catch(e){res.status(500).json({error:e.message});}
});

app.get('/api/categories', async (req,res) => {
  try {
    const cached=getCache('categories',CACHE_TIMES.categories); if(cached)return res.json(cached);
    const cats=await fetchOnce('categories',()=>enqueueApiCall(async()=>{console.log('📦 API: загрузка категорий...');const{data}=await api.get('/categories',{params:{'access-token':ALSTYLE_TOKEN}});const c=Array.isArray(data)?data:[];setCache('categories',c);console.log('✅ Категорий:',c.length);return c;}));
    res.json(cats);
  } catch(e){res.status(500).json({error:e.message});}
});

app.get('/api/search', rateLimit({windowMs:60000,max:100}), async (req,res) => {
  try {
    const raw = typeof req.query.q === 'string' ? req.query.q : '';
    // вырезаем символы, которые ломают синтаксис PostgREST-фильтра .or() и LIKE-шаблоны
    const q = raw.replace(/[%,()*\\_"'`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 64);
    if (q.length < 2) return res.json([]);
    if(supabaseAdmin){try{const{data,error}=await supabaseAdmin.from('products').select('article,name,brand,price,price1,isnew,image_url,quantity').or(`name.ilike.%${q}%,brand.ilike.%${q}%,article.ilike.%${q}%`).order('price',{ascending:false}).limit(20);if(!error&&data?.length>0){console.log(`🔍 PG "${q}": ${data.length} результатов`);return res.json(data.map(p=>({...normalizePrice(p),image:p.image_url,images:p.image_url?[p.image_url]:[]})));}}catch(e){console.warn('⚠️ PG поиск fallback:',e.message);}}
    const products=await loadAllProductsForSearch().catch(()=>[]);
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

app.post('/api/orders', rateLimit({windowMs:60000,max:60}), requireAuth, async (req,res) => {
  try {
    const { items, address_id, address_text, comment } = req.body || {};
    const clean = normalizeItems(items);
    if (!clean) return res.status(400).json({ error: 'Некорректные items' });

    // цены и названия берём из нашей базы, а не от клиента
    const articles = [...new Set(clean.map(i => i.article))];
    const { data: prods, error: pe } = await supabaseAdmin.from('products').select('article,name,price,price1').in('article', articles);
    if (pe) return res.status(500).json({ error: pe.message });
    const byArt = new Map((prods || []).map(p => [String(p.article), p]));
    const missing = articles.filter(a => !byArt.has(a));
    if (missing.length) return res.status(400).json({ error: 'Товары не найдены', missing });
    const noPrice = articles.filter(a => dealerPrice(byArt.get(a)) <= 1);
    if (noPrice.length) return res.status(400).json({ error: 'Цена по запросу, оформить через менеджера', articles: noPrice });
    const priced = clean.map(i => { const p = byArt.get(i.article); return { article: i.article, name: p.name, quantity: i.quantity, price: applyMarkup(dealerPrice(p)) }; });
    const total_price = priced.reduce((s, i) => s + i.price * i.quantity, 0);

    const { data, error } = await supabaseAdmin.from('orders').insert({
      user_id: req.user.id, items: priced, total_price,
      address_id: address_id || null, address_text: address_text ? String(address_text).slice(0, 500) : null,
      comment: comment ? String(comment).slice(0, 1000) : null, status: 'pending',
    }).select().single();
    if (error) return res.status(500).json({ error: error.message });

    const orderItems = priced.map(i => `• ${esc(i.name || 'Товар')} × ${i.quantity} — ${(i.price * i.quantity).toLocaleString('ru-RU')} ₸`).join('\n');
    const msg = `🛒 <b>Новый заказ #${data.id?.slice(0,8).toUpperCase()}</b>\n\n👤 ${esc(req.user.user_metadata?.full_name || req.user.email || 'Неизвестно')}\n📧 ${esc(req.user.email || '')}\n📍 ${esc(address_text || 'Не указан')}\n${comment ? `💬 ${esc(comment)}\n` : ''}\n📦 <b>Товары:</b>\n${orderItems}\n\n💰 <b>Итого: ${total_price.toLocaleString('ru-RU')} ₸</b>`;
    sendTelegramNotification(msg).catch(()=>{});
    res.json({ success: true, order: data });
  } catch(e){res.status(500).json({error:e.message});}
});

app.get('/api/orders', requireAuth, async (req,res) => {
  try {
    const{data,error}=await supabaseAdmin.from('orders').select('*').eq('user_id',req.user.id).order('created_at',{ascending:false});
    if(error)return res.status(500).json({error:error.message}); res.json(data||[]);
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
app.post('/api/notify-order', rateLimit({windowMs:60000,max:10}), async (req,res) => {
  try {
    const{items,total_price,address_text,comment,orderId}=req.body||{};
    const list = Array.isArray(items) ? items.slice(0, 50) : [];
    const orderItems=list.map(i=>`• ${esc(String(i?.name||'Товар').slice(0,120))} × ${Math.floor(Number(i?.quantity))||1} — ${(((Number(i?.price)||0))*(Math.floor(Number(i?.quantity))||1)).toLocaleString('ru-RU')} ₸`).join('\n');
    const nameMatch=comment?.match?.(/Имя:\s*([^|]+)/);
    const phoneMatch=comment?.match?.(/Тел:\s*([^|]+)/);
    const name=nameMatch?nameMatch[1].trim().slice(0,80):'Гость';
    const phone=phoneMatch?phoneMatch[1].trim().slice(0,30):'Не указан';
    const oid = orderId ? String(orderId).slice(-8) : 'N/A';
    const msg=`🛒 <b>Новый заказ #${esc(oid)}</b>\n\n👤 ${esc(name)}\n📱 ${esc(phone)}\n📍 ${esc(String(address_text||'Не указан').slice(0,300))}\n\n📦 <b>Товары:</b>\n${orderItems}\n\n💰 <b>Итого: ${(Number(total_price)||0).toLocaleString('ru-RU')} ₸</b>`;
    await sendTelegramNotification(msg);
    res.json({success:true});
  } catch(e){console.error('❌ notify-order:',e.message);res.status(500).json({error:e.message});}
});

// ─── Синхронизация каталога ──────────────────────────────────
let syncRunning = false;

app.post('/api/admin/sync', async (req,res) => {
  if (!SYNC_SECRET || req.headers['x-sync-secret'] !== SYNC_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  if (syncRunning) return res.status(409).json({ error: 'Синхронизация уже идёт' });
  res.json({ message: 'Синхронизация запущена в фоне' });
  syncProductsToSupabase().catch(console.error);
});

async function syncProductsToSupabase() {
  if (!supabaseAdmin) return;
  if (syncRunning) { console.log('⏭️ Синхронизация уже идёт, пропускаем'); return; }
  syncRunning = true;
  console.log('🔄 Синхронизация товаров с al-style...');
  const start = Date.now(); let synced = 0, offset = 0, total = null;
  try {
    do {
      const data = await fetchCatalogPage(offset); // бросает ошибку, если страница не загрузилась
      const els = data.elements || []; if (!els.length) break;
      if (!total) total = data.pagination?.totalCount || 0;
      for (let i = 0; i < els.length; i += 100) {
        const batch = els.slice(i, i + 100).map(p => ({
          article: String(p.article), name: p.name||'', full_name: p.full_name||'', brand: p.brand||'',
          price: dealerPrice(p), price1: p.price1||null, price2: p.price2||null,
          quantity: String(p.quantity ?? '0'), isnew: p.isnew||0, image_url: p.images?.[0]||null,
          images: JSON.stringify(p.images||[]), category_id: p.category_id ? String(p.category_id) : null,
          raw_data: '{}', synced_at: new Date().toISOString(),
        }));
        const { error } = await supabaseAdmin.from('products').upsert(batch, { onConflict: 'article' });
        if (error) throw new Error(`Supabase upsert: ${error.message}`); // supabase-js не бросает сам, проверяем вручную
        synced += batch.length;
      }
      offset += 250;
    } while (total && offset < total);
    console.log(`✅ Синхронизация завершена: ${synced} товаров за ${Math.round((Date.now()-start)/1000)}с`);
    cache.delete('search_all_products_v3'); if (redis) await redis.del('search_all_products_v3').catch(()=>{});
  } catch (e) {
    console.error('❌ Ошибка синхронизации:', e.message);
    await sendTelegramNotification(`⚠️ <b>Ошибка синхронизации каталога</b>\n${esc(e.message)}\nЗаписано до сбоя: ${synced}${total ? ` из ${total}` : ''}`);
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
  setTimeout(warmupCache, 30000);
  setTimeout(async()=>{ await syncProductsToSupabase(); setInterval(syncProductsToSupabase,60*60*1000); }, 5*60*1000);
});