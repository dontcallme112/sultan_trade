import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

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
  console.log(`💾 Кеш hit: ${key}`);
  return item.data;
}
function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

// ─── In-flight дедупликация ───────────────────────────────────
// Если два запроса хотят одни и те же данные — второй ждёт первого,
// а не делает свой API-запрос.
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

// ─── Rate limiting (очередь вместо sleep) ────────────────────
// Вместо того чтобы блокировать каждый запрос на 10с,
// ставим их в очередь — API дёргается строго по одному.
const API_MIN_INTERVAL = 2000; // 2 секунды между вызовами — безопаснее и быстрее
let apiQueue = Promise.resolve();

function enqueueApiCall(fn) {
  const next = apiQueue.then(async () => {
    const result = await fn();
    await new Promise(r => setTimeout(r, API_MIN_INTERVAL));
    return result;
  });
  // Не даём ошибкам ломать очередь
  apiQueue = next.catch(() => {});
  return next;
}

// ─── Middleware ───────────────────────────────────────────────
app.use(cors({ origin: (origin, cb) => cb(null, true), credentials: true }));
app.use(express.json());
app.use((req, res, next) => {
  console.log(`${new Date().toLocaleTimeString()} ${req.method} ${req.path}`);
  next();
});

// JWT Auth middleware
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
// FIX: ранее объект попадал как [object Object] и API возвращал 500
function parseCategoryParam(rawCategory) {
  if (!rawCategory) return null;

  const cats = Array.isArray(rawCategory) ? rawCategory : [rawCategory];
  const valid = cats
    .map(c => {
      if (c === null || c === undefined) return null;
      if (typeof c === 'object') return null; // выбрасываем объекты
      const str = String(c).trim();
      // Проверяем что это число или список чисел через запятую
      if (!/^[\d,]+$/.test(str)) return null;
      return str;
    })
    .filter(Boolean);

  return valid.length > 0 ? valid.join(',') : null;
}

// ─── Загрузка товаров через очередь + дедупликацию ───────────
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
      // Дополнительно кешируем как "все товары" если это запрос без категории
      if (!categoryParam) setCache('products_cat_all', data);
      console.log(`✅ Загружено: ${data.elements?.length || 0} товаров`);
      return data;
    })
  );
}

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
app.get('/api/products', async (req, res) => {
  try {
    const { limit = 12, offset = 0, minPrice, maxPrice, brand, onlyNew, search, sortBy } = req.query;

    const categoryParam = parseCategoryParam(req.query.category);

    let products;

    // onlyNew без категории — ищем по всему каталогу (полный кеш 6000+)
    if (onlyNew === 'true' && !categoryParam) {
      try {
        const allProducts = await loadAllProductsForSearch();
        products = allProducts;
      } catch (err) {
        console.error('❌ Ошибка загрузки всех товаров:', err.message);
        products = [];
      }
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

    if (sortBy === 'price_asc')  products.sort((a, b) => (a.price2||a.price1||0) - (b.price2||b.price1||0));
    else if (sortBy === 'price_desc') products.sort((a, b) => (b.price2||b.price1||0) - (a.price2||a.price1||0));
    else if (sortBy === 'name_asc')  products.sort((a, b) => (a.name||'').localeCompare(b.name||''));
    else if (sortBy === 'newest')    products.sort((a, b) => (b.isnew||0) - (a.isnew||0));

    const start = Number(offset);
    const end   = start + Number(limit);

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

// ─── Загрузка ВСЕХ товаров постранично для поиска ────────────
const ALL_PRODUCTS_CACHE_TIME = 30 * 60 * 1000;

async function loadAllProductsForSearch() {
  const cached = getCache('search_all_products', ALL_PRODUCTS_CACHE_TIME);
  if (cached) return cached;

  return fetchOnce('search_all_products_loading', async () => {
    console.log('🔍 Загрузка всех товаров для поиска...');
    const allProducts = [];
    let offset = 0;
    const limit = 250;
    let totalCount = null;

    do {
      const data = await enqueueApiCall(async () => {
        const response = await api.get('/elements-pagination', {
          params: {
            'access-token': ALSTYLE_TOKEN,
            exclude_missing: 'true',
            limit,
            offset,
            additional_fields: 'brand,images',
          }
        });
        return response.data;
      });

      allProducts.push(...(data.elements || []));

      if (totalCount === null && data.pagination?.totalCount) {
        totalCount = data.pagination.totalCount;
        console.log(`🔍 Всего товаров: ${totalCount}`);
      }

      offset += limit;
      console.log(`🔍 Загружено: ${allProducts.length} / ${totalCount || '?'}`);

    } while (totalCount && offset < totalCount);

    const compact = allProducts.map(p => ({
      article:   p.article,
      name:      p.name || '',
      full_name: p.full_name || '',
      brand:     p.brand || '',
      price:     p.price2 || p.price1 || 0,
      image:     p.images?.[0] || null,
    }));

    setCache('search_all_products', compact);
    console.log(`✅ Кеш поиска готов: ${compact.length} товаров`);
    return compact;
  });
}

// ─── SEARCH ──────────────────────────────────────────────────
app.get('/api/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);

    let products;
    try {
      products = await loadAllProductsForSearch();
    } catch (e) {
      console.error('❌ Поиск: не удалось загрузить товары:', e.message);
      return res.json([]);
    }

    const s = q.toLowerCase();

    // Поиск с релевантностью: бренд > название > full_name
    const results = products
      .map(p => {
        const name     = p.name.toLowerCase();
        const fullName = p.full_name.toLowerCase();
        const brand    = p.brand.toLowerCase();
        let score = 0;
        if (brand.includes(s))    score += 3;
        if (name.includes(s))     score += 2;
        if (fullName.includes(s)) score += 1;
        return score > 0 ? { ...p, score } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(({ score, ...p }) => p);

    console.log(`🔍 "${q}": ${results.length} из ${products.length}`);
    res.json(results);
  } catch (error) {
    console.error('❌ search:', error.message);
    res.json([]);
  }
});

// ─── AL-STYLE ORDER ───────────────────────────────────────────
app.post('/api/alstyle-order', async (req, res) => {
  try {
    const { items, comment, orderId } = req.body;
    if (!items?.length) return res.status(400).json({ error: 'items обязательны' });

    // Заказы не ставим в очередь — они должны исполняться быстро
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
        comments:      `Заказ с сайта sultantrade.vercel.app. ID: ${orderId || 'N/A'}. ${comment || ''}`,
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
app.post('/api/orders', requireAuth, async (req, res) => {
  try {
    const { items, address_id, address_text, comment, total_price } = req.body;
    if (!items?.length) return res.status(400).json({ error: 'items обязательны' });
    const { data, error } = await supabaseAdmin
      .from('orders')
      .insert({ user_id: req.user.id, items, total_price: total_price || 0, address_id: address_id || null, address_text: address_text || null, comment: comment || null, status: 'pending' })
      .select().single();
    if (error) return res.status(500).json({ error: error.message });
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
    // 1. Категории
    const catResponse = await api.get('/categories', { params: { 'access-token': ALSTYLE_TOKEN } });
    const cats = Array.isArray(catResponse.data) ? catResponse.data : [];
    setCache('categories', cats);
    console.log(`✅ Категорий: ${cats.length}`);

    // 2. Первые 250 для каталога
    await loadProducts(null);

    // 3. Все товары для поиска — в фоне, не блокируем старт
    // Займёт ~2-3 минуты из-за rate limit, но поиск заработает постепенно
    loadAllProductsForSearch().catch(e =>
      console.warn('⚠️ Фоновая загрузка поиска:', e.message)
    );

  } catch (e) {
    console.warn('⚠️ Прогрев кеша не удался:', e.message);
  }
}

app.listen(PORT, () => {
  console.log('\n🚀 LUXE Backend v4.3');
  console.log('━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📡 Port: ${PORT}`);
  console.log(`🔑 Token: ${ALSTYLE_TOKEN ? '✅' : '❌'}`);
  console.log(`🔐 Auth: ${supabaseAdmin ? '✅ Supabase' : '⚠️  Disabled'}`);
  console.log('⏱️  Кеш: товары 10мин, категории 30мин');
  console.log('✨ Готово!\n');

  // Прогрев через 1 секунду после старта
  setTimeout(warmupCache, 1000);
});