import express from 'express';
import compression from 'compression';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { Redis } from '@upstash/redis';

dotenv.config();

// ─── Redis (Upstash) ──────────────────────────────────────────
const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({
      url:   process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

console.log('Redis:', redis ? '✅ Upstash' : '⚠️  Disabled (no env vars)');

const app = express();
const PORT = process.env.PORT || 8080;

const ALSTYLE_TOKEN        = process.env.ALSTYLE_ACCESS_TOKEN;
const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('\n🔧 Переменные окружения:');
console.log('ALSTYLE_TOKEN:', ALSTYLE_TOKEN ? '✅' : '❌');
console.log('SUPABASE_URL:', SUPABASE_URL ? '✅' : '❌');
console.log('SUPABASE_SERVICE_KEY:', SUPABASE_SERVICE_KEY ? '✅' : '❌');

if (!ALSTYLE_TOKEN) { console.error('❌ ALSTYLE_ACCESS_TOKEN не найден!'); process.exit(1); }

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

// ─── Кеш ─────────────────────────────────────────────────────
const cache = new Map();

const CACHE_TIMES = {
  products:   10 * 60 * 1000,
  categories: 30 * 60 * 1000,
  filters:    30 * 60 * 1000,
  product:     5 * 60 * 1000,
};

function getCache(key, maxAge) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() - item.timestamp > maxAge) { cache.delete(key); return null; }
  console.log(`💾 RAM кеш hit: ${key}`);
  return item.data;
}
function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

async function getRedisCacheOrNull(key) {
  if (!redis) return null;
  try {
    const val = await redis.get(key);
    if (val) { console.log(`💾 Redis hit: ${key}`); return val; }
  } catch(e) { console.warn('⚠️ Redis get error:', e.message); }
  return null;
}
async function setRedisCache(key, data, ttlSeconds = 3600) {
  if (!redis) return;
  try {
    await redis.set(key, data, { ex: ttlSeconds });
    console.log(`💾 Redis set: ${key}`);
  } catch(e) { console.warn('⚠️ Redis set error:', e.message); }
}

// ─── In-flight дедупликация ───────────────────────────────────
const inFlight = new Map();

async function fetchOnce(key, fetchFn) {
  if (inFlight.has(key)) {
    console.log(`🔄 Дедупликация: ждём уже выполняющийся запрос ${key}`);
    return inFlight.get(key);
  }
  const promise = fetchFn().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

// ─── Очередь только для пользовательских запросов ────────────
let userApiQueue = Promise.resolve();

function enqueueApiCall(fn) {
  const next = userApiQueue.then(async () => {
    const result = await fn();
    await new Promise(r => setTimeout(r, 1000));
    return result;
  });
  userApiQueue = next.catch(() => {});
  return next;
}

// ─── Middleware ───────────────────────────────────────────────
app.use(compression());
app.use(cors({ origin: (origin, cb) => cb(null, true), credentials: true }));
app.use(express.json());
app.use((req, res, next) => {
  console.log(`${new Date().toLocaleTimeString()} ${req.method} ${req.path}`);
  next();
});

// ─── Telegram уведомления ────────────────────────────────────
const TG_TOKEN   = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegramNotification(message) {
  if (!TG_TOKEN || !TG_CHAT_ID) return;
  try {
    await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      chat_id: TG_CHAT_ID,
      text: message,
      parse_mode: 'HTML',
    });
  } catch (e) {
    console.warn('⚠️ Telegram уведомление не отправлено:', e.message);
  }
}

// ─── Rate limiting ───────────────────────────────────────────
const rateLimitMap = new Map();

function rateLimit({ windowMs = 60000, max = 100, message = 'Слишком много запросов' } = {}) {
  return (req, res, next) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
    const now = Date.now();
    const windowStart = now - windowMs;

    if (!rateLimitMap.has(ip)) rateLimitMap.set(ip, []);

    const requests = rateLimitMap.get(ip).filter(t => t > windowStart);
    requests.push(now);
    rateLimitMap.set(ip, requests);

    if (requests.length > max) {
      console.log(`🚫 Rate limit: ${ip} (${requests.length} запросов за ${windowMs/1000}с)`);
      return res.status(429).json({ error: message, retryAfter: Math.ceil(windowMs / 1000) });
    }
    next();
  };
}

setInterval(() => {
  const cutoff = Date.now() - 60000;
  for (const [ip, times] of rateLimitMap) {
    const fresh = times.filter(t => t > cutoff);
    if (fresh.length === 0) rateLimitMap.delete(ip);
    else rateLimitMap.set(ip, fresh);
  }
}, 60 * 1000);

// ─── JWT Auth ─────────────────────────────────────────────────
const requireAuth = async (req, res, next) => {
  if (!supabaseAdmin) return res.status(503).json({ error: 'Auth service not configured' });
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const token = auth.slice(7);
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Invalid token' });
  req.user = user;
  next();
};

const api     = axios.create({ baseURL: 'https://api.al-style.kz/api',      timeout: 30000 });
const cartApi = axios.create({ baseURL: 'https://api.al-style.kz/cart-api', timeout: 30000 });

// ─── Утилита: парсим category из query ───────────────────────
function parseCategoryParam(rawCategory) {
  if (!rawCategory) return null;
  const cats = Array.isArray(rawCategory) ? rawCategory : [rawCategory];
  const valid = cats
    .map(c => {
      if (c === null || c === undefined) return null;
      if (typeof c === 'object') return null;
      const str = String(c).trim();
      if (!/^[\d,]+$/.test(str)) return null;
      return str;
    })
    .filter(Boolean);
  return valid.length > 0 ? valid.join(',') : null;
}

// ─── Загрузка товаров ─────────────────────────────────────────
async function loadProducts(categoryParam) {
  const cacheKey = `products_cat_${categoryParam || 'all'}`;
  const cached = getCache(cacheKey, CACHE_TIMES.products);
  if (cached) return cached;

  return fetchOnce(cacheKey, () =>
    enqueueApiCall(async () => {
      console.log(`📦 API: загрузка товаров, категория: ${categoryParam || 'все'}`);
      const apiParams = {
        'access-token': ALSTYLE_TOKEN,
        exclude_missing: 'true',
        limit: 250,
        offset: 0,
        additional_fields: 'brand,images',
      };
      if (categoryParam) apiParams.category = categoryParam;
      const response = await api.get('/elements-pagination', { params: apiParams });
      const data = response.data;
      setCache(cacheKey, data);
      if (!categoryParam) setCache('products_cat_all', data);
      console.log(`✅ Загружено: ${data.elements?.length || 0} товаров`);
      return data;
    })
  );
}

// ─── Загрузка ВСЕХ товаров для поиска (из Redis/RAM) ─────────
const ALL_PRODUCTS_CACHE_TIME = 30 * 60 * 1000;

async function loadAllProductsForSearch() {
  const ramCached = getCache('search_all_products', ALL_PRODUCTS_CACHE_TIME);
  if (ramCached) return ramCached;

  // Сервер только читает из Redis — запись делает sync.js
  const redisCached = await getRedisCacheOrNull('search_all_products');
  if (redisCached) {
    setCache('search_all_products', redisCached);
    return redisCached;
  }

  // Redis пустой — fallback: читаем из Supabase
  if (supabaseAdmin) {
    console.log('📦 Redis пустой, читаем из Supabase...');
    try {
      const { data, error } = await supabaseAdmin
        .from('products')
        .select('article, name, full_name, brand, price, isnew, image_url')
        .order('price', { ascending: false });

      if (!error && data?.length) {
        const compact = data.map(p => ({
          article:   p.article,
          name:      p.name || '',
          full_name: p.full_name || '',
          brand:     p.brand || '',
          price:     p.price || 0,
          isnew:     p.isnew || 0,
          image:     p.image_url || null,
        }));
        setCache('search_all_products', compact);
        console.log(`✅ Из Supabase: ${compact.length} товаров`);
        return compact;
      }
    } catch (e) {
      console.warn('⚠️ Supabase fallback ошибка:', e.message);
    }
  }

  return [];
}

// ─── HEALTH ──────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    token: !!ALSTYLE_TOKEN,
    supabase: !!supabaseAdmin,
    cache: cache.size,
    inFlight: inFlight.size,
  });
});

// ─── PRODUCTS ────────────────────────────────────────────────
app.get('/api/products', rateLimit({ windowMs: 60000, max: 300 }), async (req, res) => {
  try {
    const { limit = 12, offset = 0, minPrice, maxPrice, brand, onlyNew, search, sortBy } = req.query;
    const categoryParam = parseCategoryParam(req.query.category);

    let products;

    if (onlyNew === 'true' && !categoryParam) {
      if (supabaseAdmin) {
        try {
          const start = Number(offset);
          const { data, error, count } = await supabaseAdmin
            .from('products')
            .select('*', { count: 'exact' })
            .eq('isnew', 1)
            .order('price', { ascending: false })
            .range(start, start + Number(limit) - 1);

          if (!error) {
            const els = (data || []).map(p => ({
              article: p.article, name: p.name, brand: p.brand,
              price2: p.price, price1: p.price, price: p.price,
              isnew: p.isnew, quantity: p.quantity,
              images: p.image_url ? [p.image_url] : [],
              image: p.image_url,
            }));
            return res.set('Cache-Control', 'public, max-age=60').json({
              elements: els,
              pagination: { totalCount: count, total: count, offset: start, limit: Number(limit), hasMore: start + els.length < count }
            });
          }
        } catch (pgErr) {
          console.warn('⚠️ PG onlyNew fallback:', pgErr.message);
        }
      }
      products = await loadAllProductsForSearch().catch(() => []);
    } else {
      let data;
      try {
        data = await loadProducts(categoryParam);
      } catch (err) {
        console.error('❌ Ошибка загрузки товаров:', err.message);
        return res.status(502).json({
          error: 'Не удалось загрузить товары с поставщика',
          elements: [],
          pagination: { totalCount: 0, hasMore: false },
        });
      }
      products = data.elements || [];
    }

    if (minPrice || maxPrice) {
      products = products.filter(p => {
        const price = p.price2 || p.price1 || 0;
        return (!minPrice || price >= Number(minPrice)) && (!maxPrice || price <= Number(maxPrice));
      });
    }
    if (brand) products = products.filter(p => p.brand?.toLowerCase() === brand.toLowerCase());
    if (onlyNew === 'true') products = products.filter(p => p.isnew === 1);
    if (search) {
      const s = search.toLowerCase();
      products = products.filter(p =>
        p.name?.toLowerCase().includes(s) ||
        p.full_name?.toLowerCase().includes(s) ||
        p.brand?.toLowerCase().includes(s)
      );
    }

    if (sortBy === 'price_asc') {
      products.sort((a, b) => (a.price2||a.price1||0) - (b.price2||b.price1||0));
    } else if (sortBy === 'price_desc') {
      products.sort((a, b) => (b.price2||b.price1||0) - (a.price2||a.price1||0));
    } else if (sortBy === 'name_asc') {
      products.sort((a, b) => (a.name||'').localeCompare(b.name||'', 'ru'));
    } else if (sortBy === 'newest') {
      products.sort((a, b) => (b.isnew||0) - (a.isnew||0) || (b.price2||b.price1||0) - (a.price2||a.price1||0));
    } else {
      products.sort((a, b) => {
        const pa = a.price2||a.price1||0;
        const pb = b.price2||b.price1||0;
        const aOk = pa > 1000 && pa <= 500000;
        const bOk = pb > 1000 && pb <= 500000;
        if (aOk && !bOk) return -1;
        if (!aOk && bOk) return 1;
        return pb - pa;
      });
    }

    const start = Number(offset);
    const end   = start + Number(limit);

    res.set('Cache-Control', 'public, max-age=60');
    res.json({
      elements: products.slice(start, end),
      pagination: { totalCount: products.length, total: products.length, offset: start, limit: Number(limit), hasMore: end < products.length }
    });
  } catch (error) {
    console.error('❌ /api/products:', error.message);
    res.status(500).json({ error: error.message, elements: [], pagination: { totalCount: 0, hasMore: false } });
  }
});

// ─── SINGLE PRODUCT ──────────────────────────────────────────
app.get('/api/product/:article', async (req, res) => {
  try {
    const key = `product_${req.params.article}`;
    const cached = getCache(key, CACHE_TIMES.product);
    if (cached) return res.json(cached);

    const product = await fetchOnce(key, () =>
      enqueueApiCall(async () => {
        const response = await api.get('/element-info', {
          params: { 'access-token': ALSTYLE_TOKEN, article: req.params.article, additional_fields: 'brand,images,description' }
        });
        const data = Array.isArray(response.data) ? response.data[0] : response.data;
        setCache(key, data);
        return data;
      })
    );
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── CATEGORIES ──────────────────────────────────────────────
app.get('/api/categories', async (req, res) => {
  try {
    const cached = getCache('categories', CACHE_TIMES.categories);
    if (cached) return res.json(cached);

    const categories = await fetchOnce('categories', () =>
      enqueueApiCall(async () => {
        console.log('📦 API: загрузка категорий...');
        const response = await api.get('/categories', { params: { 'access-token': ALSTYLE_TOKEN } });
        const data = Array.isArray(response.data) ? response.data : [];
        setCache('categories', data);
        console.log('✅ Категорий:', data.length);
        return data;
      })
    );
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── FILTERS ─────────────────────────────────────────────────
app.get('/api/filters', async (req, res) => {
  try {
    const cached = getCache('filters', CACHE_TIMES.filters);
    if (cached) return res.json(cached);

    const filters = await fetchOnce('filters', () =>
      enqueueApiCall(async () => {
        let brands = [];
        try {
          const response = await api.get('/brands', { params: { 'access-token': ALSTYLE_TOKEN } });
          if (response.data.status && Array.isArray(response.data.data)) {
            brands = response.data.data.filter(b => b.name?.trim()).map(b => b.name).sort();
          }
        } catch (e) {
          const allProducts = getCache('products_cat_all', 999999);
          if (allProducts?.elements) {
            brands = [...new Set(allProducts.elements.map(p => p.brand).filter(Boolean))].sort();
          }
        }

        let priceRange = { min: 0, max: 1000000 };
        const allProducts = getCache('products_cat_all', 999999);
        if (allProducts?.elements) {
          const prices = allProducts.elements.map(p => p.price2 || p.price1 || 0).filter(p => p > 0);
          if (prices.length) priceRange = { min: Math.min(...prices), max: Math.max(...prices) };
        }

        const data = { brands: brands.slice(0, 50), priceRange };
        setCache('filters', data);
        return data;
      })
    );
    res.json(filters);
  } catch (error) {
    res.json({ brands: [], priceRange: { min: 0, max: 1000000 } });
  }
});

// ─── SEARCH ──────────────────────────────────────────────────
app.get('/api/search', rateLimit({ windowMs: 60000, max: 100 }), async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);

    if (supabaseAdmin) {
      try {
        const { data, error } = await supabaseAdmin
          .from('products')
          .select('article, name, brand, price, isnew, image_url, quantity')
          .or(`name.ilike.%${q}%,brand.ilike.%${q}%,article.ilike.%${q}%`)
          .order('price', { ascending: false })
          .limit(20);

        if (!error && data?.length > 0) {
          const results = data.map(p => ({
            article: p.article, name: p.name, brand: p.brand,
            price: p.price, price2: p.price, isnew: p.isnew,
            image: p.image_url, images: p.image_url ? [p.image_url] : [],
            quantity: p.quantity,
          }));
          console.log(`🔍 PG "${q}": ${results.length} результатов`);
          return res.json(results);
        }
      } catch (pgErr) {
        console.warn('⚠️ PG поиск недоступен, fallback на кеш:', pgErr.message);
      }
    }

    const products = await loadAllProductsForSearch().catch(() => []);
    const s = q.toLowerCase();
    const results = products
      .map(p => {
        let score = 0;
        if (p.brand?.toLowerCase().includes(s)) score += 3;
        if (p.name?.toLowerCase().includes(s))  score += 2;
        return score > 0 ? { ...p, score } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map(({ score, ...p }) => p);

    console.log(`🔍 RAM "${q}": ${results.length} результатов`);
    res.json(results);
  } catch (error) {
    console.error('❌ search:', error.message);
    res.json([]);
  }
});

// ─── AL-STYLE ORDER ───────────────────────────────────────────
app.post('/api/alstyle-order', rateLimit({ windowMs: 60000, max: 30, message: 'Подождите перед следующим заказом' }), async (req, res) => {
  try {
    const { items, comment, orderId } = req.body;
    if (!items?.length) return res.status(400).json({ error: 'items обязательны' });

    const userDataResponse = await api.get('/user-data', { params: { 'access-token': ALSTYLE_TOKEN } });
    const userData = userDataResponse.data?.data;
    if (!userData) return res.status(500).json({ error: 'Не удалось получить данные пользователя' });

    const attorney = userData['Доверенности']?.find(d => d['Основной'] && !d['empty']) || userData['Доверенности']?.[0];
    const delivery = userData['Транспортники']?.find(d => d['Основной']) || userData['Транспортники']?.[0];
    if (!attorney || !delivery) return res.status(500).json({ error: 'Не найдены доверенность или способ доставки' });

    await cartApi.get('/clear', { params: { 'access-token': ALSTYLE_TOKEN } });
    await cartApi.get('/add', {
      params: {
        'access-token': ALSTYLE_TOKEN,
        add:      items.map(i => i.article).join(','),
        quantity: items.map(i => i.quantity).join(','),
      }
    });

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const shippingDate = `${String(tomorrow.getDate()).padStart(2,'0')}.${String(tomorrow.getMonth()+1).padStart(2,'0')}.${tomorrow.getFullYear()}`;

    const submitResponse = await cartApi.post('/submit', null, {
      params: {
        'access-token': ALSTYLE_TOKEN,
        comments:      `Заказ с сайта stockeratrade.com. ID: ${orderId || 'N/A'}. ${comment || ''}`,
        shipping_date: shippingDate,
        attorney_json: JSON.stringify(attorney),
        delivery_json: JSON.stringify(delivery),
        external_id:   orderId || undefined,
      }
    });

    const alstyleOrderId = submitResponse.data?.data?.id;
    console.log(`✅ Заказ создан в al-style: #${alstyleOrderId}`);
    res.json({ success: true, alstyleOrderId });

  } catch (error) {
    console.error('❌ al-style order error:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data?.message || error.message });
  }
});

// ─── ORDERS ──────────────────────────────────────────────────
app.post('/api/orders', rateLimit({ windowMs: 60000, max: 60 }), requireAuth, async (req, res) => {
  try {
    const { items, address_id, address_text, comment, total_price } = req.body;
    if (!items?.length) return res.status(400).json({ error: 'items обязательны' });

    const { data, error } = await supabaseAdmin
      .from('orders')
      .insert({ user_id: req.user.id, items, total_price: total_price || 0, address_id: address_id || null, address_text: address_text || null, comment: comment || null, status: 'pending' })
      .select().single();
    if (error) return res.status(500).json({ error: error.message });

    try {
      const orderItems = (items || []).map(i =>
        `• ${i.name || i.title || 'Товар'} × ${i.quantity} — ${(i.price * i.quantity).toLocaleString('ru-RU')} ₸`
      ).join('\n');

      const userName  = req.user.user_metadata?.full_name || req.user.email || 'Неизвестно';
      const userEmail = req.user.email || '';
      const address   = address_text || 'Не указан';
      const total     = (total_price || 0).toLocaleString('ru-RU');
      const orderId   = data.id?.slice(0, 8).toUpperCase();

      const msg = `🛒 <b>Новый заказ #${orderId}</b>\n\n` +
        `👤 ${userName}\n📧 ${userEmail}\n📍 ${address}\n` +
        (comment ? `💬 ${comment}\n` : '') +
        `\n📦 <b>Товары:</b>\n${orderItems}\n\n` +
        `💰 <b>Итого: ${total} ₸</b>`;

      await sendTelegramNotification(msg);
    } catch (tgErr) {
      console.warn('Telegram error:', tgErr.message);
    }

    res.json({ success: true, order: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/orders', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('orders').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── FAVORITES ────────────────────────────────────────────────
app.post('/api/favorites', requireAuth, async (req, res) => {
  try {
    const { article, name, price, image_url } = req.body;
    const { data, error } = await supabaseAdmin
      .from('favorites')
      .upsert({ user_id: req.user.id, article, name, price, image_url }, { onConflict: 'user_id,article' })
      .select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, favorite: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/favorites/:article', requireAuth, async (req, res) => {
  try {
    const { error } = await supabaseAdmin
      .from('favorites').delete().eq('user_id', req.user.id).eq('article', req.params.article);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Прогрев кеша при старте ──────────────────────────────────
async function warmupCache() {
  console.log('🔥 Прогрев кеша...');
  try {
    const catResponse = await api.get('/categories', { params: { 'access-token': ALSTYLE_TOKEN } });
    const cats = Array.isArray(catResponse.data) ? catResponse.data : [];
    setCache('categories', cats);
    console.log(`✅ Категорий: ${cats.length}`);

    await loadProducts(null);

    const redisData = await getRedisCacheOrNull('search_all_products');
    if (redisData) {
      setCache('search_all_products', redisData);
      console.log(`✅ Кеш поиска из Redis: ${redisData.length} товаров`);
    } else {
      console.log('ℹ️  Redis пустой — поиск будет читать из Supabase до следующей синхронизации');
    }
  } catch (e) {
    console.warn('⚠️ Прогрев кеша не удался:', e.message);
  }
}

app.listen(PORT, () => {
  console.log('\n🚀 Stockera Backend v5.0');
  console.log('━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📡 Port: ${PORT}`);
  console.log(`🔑 Token: ${ALSTYLE_TOKEN ? '✅' : '❌'}`);
  console.log(`🔐 Auth: ${supabaseAdmin ? '✅ Supabase' : '⚠️  Disabled'}`);
  console.log('⏱️  Кеш: товары 10мин, категории 30мин');
  console.log('🔄 Синхронизация: Railway Cron Job (sync.js)');
  console.log('✨ Готово!\n');

  setTimeout(warmupCache, 30000);
});