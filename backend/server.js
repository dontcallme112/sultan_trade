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

// ─── Rate limiting ────────────────────────────────────────────
let lastApiCall = 0;
const MIN_INTERVAL = 10000;
async function waitForRateLimit() {
  const wait = MIN_INTERVAL - (Date.now() - lastApiCall);
  if (wait > 0) {
    console.log(`⏳ Rate limit: ждем ${Math.round(wait/1000)}с`);
    await new Promise(r => setTimeout(r, wait));
  }
  lastApiCall = Date.now();
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

// ─── Загрузка всех товаров (используется в поиске) ───────────
async function loadAllProducts() {
  let cached = getCache('products_cat_all', CACHE_TIMES.products);
  if (cached) return cached.elements || [];

  console.log('📦 Загрузка всех товаров для поиска...');
  await waitForRateLimit();
  const response = await api.get('/elements-pagination', {
    params: {
      'access-token': ALSTYLE_TOKEN,
      exclude_missing: 'true',
      limit: 250,
      offset: 0,
      additional_fields: 'brand,images',
    }
  });
  const data = response.data;
  setCache('products_cat_all', data);
  console.log('✅ Загружено для поиска:', data.elements?.length || 0);
  return data.elements || [];
}

app.get('/health', (req, res) => {
  res.json({ status: 'OK', token: !!ALSTYLE_TOKEN, supabase: !!supabaseAdmin, cache: cache.size });
});

// ─── PRODUCTS ────────────────────────────────────────────────
app.get('/api/products', async (req, res) => {
  try {
    const { limit = 12, offset = 0, minPrice, maxPrice, brand, onlyNew, search, sortBy } = req.query;

    let categoryParam = null;
    if (req.query.category) {
      categoryParam = Array.isArray(req.query.category)
        ? req.query.category.join(',')
        : req.query.category;
    }

    const cacheKey = `products_cat_${categoryParam || 'all'}`;
    let cached = getCache(cacheKey, CACHE_TIMES.products);

    if (!cached) {
      console.log(`📦 Загрузка товаров... категория: ${categoryParam || 'все'}`);
      await waitForRateLimit();
      const apiParams = {
        'access-token': ALSTYLE_TOKEN,
        exclude_missing: 'true',
        limit: 250,
        offset: 0,
        additional_fields: 'brand,images',
      };
      if (categoryParam) apiParams.category = categoryParam;
      const response = await api.get('/elements-pagination', { params: apiParams });
      cached = response.data;
      setCache(cacheKey, cached);
      // Если это запрос всех товаров — сохраняем и в общий кеш для поиска
      if (!categoryParam) setCache('products_cat_all', cached);
      console.log('✅ Загружено и закешировано:', cached.elements?.length || 0);
    }

    let products = cached.elements || [];

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

    if (sortBy === 'price_asc') products.sort((a, b) => (a.price2||a.price1||0) - (b.price2||b.price1||0));
    else if (sortBy === 'price_desc') products.sort((a, b) => (b.price2||b.price1||0) - (a.price2||a.price1||0));
    else if (sortBy === 'name_asc') products.sort((a, b) => (a.name||'').localeCompare(b.name||''));
    else if (sortBy === 'newest') products.sort((a, b) => (b.isnew||0) - (a.isnew||0));

    const start = Number(offset);
    const end   = start + Number(limit);
    const paginated = products.slice(start, end);

    res.json({
      elements: paginated,
      pagination: { totalCount: products.length, total: products.length, offset: start, limit: Number(limit), hasMore: end < products.length }
    });
  } catch (error) {
    console.error('❌ products:', error.message);
    res.status(500).json({ error: error.message, elements: [], pagination: { totalCount: 0, hasMore: false } });
  }
});

// ─── SINGLE PRODUCT ──────────────────────────────────────────
app.get('/api/product/:article', async (req, res) => {
  try {
    const key = `product_${req.params.article}`;
    let product = getCache(key, CACHE_TIMES.product);
    if (!product) {
      await waitForRateLimit();
      const response = await api.get('/element-info', {
        params: { 'access-token': ALSTYLE_TOKEN, article: req.params.article, additional_fields: 'brand,images,description' }
      });
      product = Array.isArray(response.data) ? response.data[0] : response.data;
      setCache(key, product);
    }
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── CATEGORIES ──────────────────────────────────────────────
app.get('/api/categories', async (req, res) => {
  try {
    let categories = getCache('categories', CACHE_TIMES.categories);
    if (!categories) {
      console.log('📦 Загрузка категорий из API...');
      await waitForRateLimit();
      const response = await api.get('/categories', { params: { 'access-token': ALSTYLE_TOKEN } });
      categories = Array.isArray(response.data) ? response.data : [];
      setCache('categories', categories);
      console.log('✅ Категорий:', categories.length);
    }
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── FILTERS ─────────────────────────────────────────────────
app.get('/api/filters', async (req, res) => {
  try {
    let filters = getCache('filters', CACHE_TIMES.filters);
    if (filters) return res.json(filters);
    let brands = [];
    try {
      await waitForRateLimit();
      const response = await api.get('/brands', { params: { 'access-token': ALSTYLE_TOKEN } });
      if (response.data.status && Array.isArray(response.data.data)) {
        brands = response.data.data.filter(b => b.name?.trim()).map(b => b.name).sort();
      }
    } catch (e) {
      const products = getCache('products_cat_all', 999999);
      if (products?.elements) brands = [...new Set(products.elements.map(p => p.brand).filter(Boolean))].sort();
    }
    let priceRange = { min: 0, max: 1000000 };
    const products = getCache('products_cat_all', 999999);
    if (products?.elements) {
      const prices = products.elements.map(p => p.price2 || p.price1 || 0).filter(p => p > 0);
      if (prices.length) priceRange = { min: Math.min(...prices), max: Math.max(...prices) };
    }
    filters = { brands: brands.slice(0, 50), priceRange };
    setCache('filters', filters);
    res.json(filters);
  } catch (error) {
    res.json({ brands: [], priceRange: { min: 0, max: 1000000 } });
  }
});

// ─── SEARCH — теперь работает даже без кеша ──────────────────
app.get('/api/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);

    // Пробуем взять из кеша — если нет, загружаем
    let products;
    try {
      products = await loadAllProducts();
    } catch (e) {
      console.error('❌ Не удалось загрузить товары для поиска:', e.message);
      return res.json([]);
    }

    const s = q.toLowerCase();
    const results = products
      .filter(p =>
        p.name?.toLowerCase().includes(s) ||
        p.full_name?.toLowerCase().includes(s) ||
        p.brand?.toLowerCase().includes(s)
      )
      .slice(0, 10)
      .map(p => ({
        article: p.article,
        name:    p.name || p.full_name,
        brand:   p.brand,
        price:   p.price2 || p.price1,
        image:   p.images?.[0] || null,
      }));

    console.log(`🔍 Поиск "${q}": найдено ${results.length}`);
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

    await waitForRateLimit();
    const userDataResponse = await api.get('/user-data', { params: { 'access-token': ALSTYLE_TOKEN } });
    const userData = userDataResponse.data?.data;
    if (!userData) return res.status(500).json({ error: 'Не удалось получить данные пользователя' });

    const attorney = userData['Доверенности']?.find(d => d['Основной'] && !d['empty']) || userData['Доверенности']?.[0];
    const delivery = userData['Транспортники']?.find(d => d['Основной']) || userData['Транспортники']?.[0];
    if (!attorney || !delivery) return res.status(500).json({ error: 'Не найдены доверенность или способ доставки' });

    await waitForRateLimit();
    await cartApi.get('/clear', { params: { 'access-token': ALSTYLE_TOKEN } });

    await waitForRateLimit();
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

    await waitForRateLimit();
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

app.listen(PORT, () => {
  console.log('\n🚀 LUXE Backend v4.2');
  console.log('━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📡 Port: ${PORT}`);
  console.log(`🔑 Token: ${ALSTYLE_TOKEN ? '✅' : '❌'}`);
  console.log(`🔐 Auth: ${supabaseAdmin ? '✅ Supabase' : '⚠️  Disabled'}`);
  console.log('⏱️  Кеш: товары 10мин, категории 30мин');
  console.log('✨ Готово!\n');
});