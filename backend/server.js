import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

const ALSTYLE_TOKEN = process.env.ALSTYLE_ACCESS_TOKEN;

console.log('\n🔧 Проверка переменных окружения:');
console.log('PORT:', PORT);
console.log('ALSTYLE_ACCESS_TOKEN:', ALSTYLE_TOKEN ? `${ALSTYLE_TOKEN.substring(0, 10)}...` : '❌ НЕ НАЙДЕН');

if (!ALSTYLE_TOKEN) {
  console.error('\n❌ КРИТИЧЕСКАЯ ОШИБКА: ALSTYLE_ACCESS_TOKEN не найден!');
  process.exit(1);
}

// Простой кеш
const cache = new Map();

function getCache(key, maxAge = 30000) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() - item.timestamp > maxAge) {
    cache.delete(key);
    return null;
  }
  return item.data;
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

// Rate limiting
let lastApiCall = 0;
const MIN_INTERVAL = 10000;

async function waitForRateLimit() {
  const now = Date.now();
  const timeSinceLastCall = now - lastApiCall;
  if (timeSinceLastCall < MIN_INTERVAL) {
    const waitTime = MIN_INTERVAL - timeSinceLastCall;
    console.log(`⏳ Rate limit: ждем ${Math.round(waitTime / 1000)}с`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  lastApiCall = Date.now();
}

app.use(cors({ origin: (origin, cb) => cb(null, true), credentials: true }));
app.use(express.json());
app.use((req, res, next) => {
  console.log(`${new Date().toLocaleTimeString()} ${req.method} ${req.path}`);
  next();
});

const api = axios.create({
  baseURL: 'https://api.al-style.kz/api',
  timeout: 20000
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', token: ALSTYLE_TOKEN ? 'configured' : 'missing', cache: cache.size });
});

// PRODUCTS
app.get('/api/products', async (req, res) => {
  try {
    const {
      limit = 12,
      offset = 0,
      minPrice,
      maxPrice,
      brand,
      onlyNew,
      search,
      sortBy,
    } = req.query;

    // category может прийти как одно значение или массив: ?category=1&category=2
    // Преобразуем в строку через запятую для al-style API
    let categoryParam = null;
    if (req.query.category) {
      if (Array.isArray(req.query.category)) {
        categoryParam = req.query.category.join(',');
      } else {
        categoryParam = req.query.category;
      }
    }

    // Ключ кеша включает категорию — разные категории = разные кеши
    const cacheKey = `products_cat_${categoryParam || 'all'}`;
    let cached = getCache(cacheKey, 30000);

    if (!cached) {
      console.log(`📦 Загрузка товаров из API... категория: ${categoryParam || 'все'}`);

      await waitForRateLimit();

      const apiParams = {
        'access-token': ALSTYLE_TOKEN,
        exclude_missing: 'true',
        limit: 250, // максимум от al-style
        offset: 0,
        additional_fields: 'brand,images',
      };

      // Передаём category прямо в al-style API — они поддерживают через запятую
      if (categoryParam) {
        apiParams.category = categoryParam;
      }

      const response = await api.get('/elements-pagination', { params: apiParams });

      cached = response.data;
      setCache(cacheKey, cached);
      console.log('✅ Загружено:', cached.elements?.length || 0);
    } else {
      console.log('💾 Кеш:', cacheKey);
    }

    let products = cached.elements || [];

    // Локальные фильтры (категория уже отфильтрована на уровне API)
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

    // Сортировка
    if (sortBy === 'price_asc') products.sort((a, b) => (a.price2 || a.price1 || 0) - (b.price2 || b.price1 || 0));
    else if (sortBy === 'price_desc') products.sort((a, b) => (b.price2 || b.price1 || 0) - (a.price2 || a.price1 || 0));
    else if (sortBy === 'name_asc') products.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    else if (sortBy === 'newest') products.sort((a, b) => (b.isnew || 0) - (a.isnew || 0));

    const start = Number(offset);
    const end = start + Number(limit);
    const paginated = products.slice(start, end);

    console.log(`📄 Отправляем: ${paginated.length} (всего после фильтров: ${products.length})`);

    res.json({
      elements: paginated,
      pagination: {
        totalCount: products.length,
        total: products.length,
        offset: start,
        limit: Number(limit),
        hasMore: end < products.length,
      }
    });

  } catch (error) {
    console.error('❌ Ошибка products:', error.response?.status, error.message);
    res.status(500).json({
      error: error.message,
      status: error.response?.status,
      elements: [],
      pagination: { totalCount: 0, total: 0, offset: 0, limit: 12, hasMore: false }
    });
  }
});

// SINGLE PRODUCT
app.get('/api/product/:article', async (req, res) => {
  try {
    const key = `product_${req.params.article}`;
    let product = getCache(key, 60000);

    if (!product) {
      await waitForRateLimit();
      const response = await api.get('/element-info', {
        params: {
          'access-token': ALSTYLE_TOKEN,
          article: req.params.article,
          additional_fields: 'brand,images,description'
        }
      });
      product = Array.isArray(response.data) ? response.data[0] : response.data;
      setCache(key, product);
    }

    res.json(product);
  } catch (error) {
    console.error('❌ Ошибка product:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// CATEGORIES
app.get('/api/categories', async (req, res) => {
  try {
    let categories = getCache('categories', 300000);

    if (!categories) {
      console.log('📦 Загрузка категорий...');
      await waitForRateLimit();

      const response = await api.get('/categories', {
        params: { 'access-token': ALSTYLE_TOKEN }
      });

      categories = Array.isArray(response.data) ? response.data : [];
      setCache('categories', categories);
      console.log('✅ Категорий:', categories.length);
    }

    res.json(categories);
  } catch (error) {
    console.error('❌ Ошибка categories:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// FILTERS
app.get('/api/filters', async (req, res) => {
  try {
    let filters = getCache('filters', 300000);
    if (filters) return res.json(filters);

    let brands = [];

    try {
      await waitForRateLimit();
      const response = await api.get('/brands', {
        params: { 'access-token': ALSTYLE_TOKEN }
      });

      let brandsData = response.data;
      if (brandsData.status && Array.isArray(brandsData.data)) {
        brands = brandsData.data.filter(b => b.name?.trim()).map(b => b.name).sort();
        console.log('✅ Бренды из API:', brands.length);
      }
    } catch (e) {
      console.log('⚠️  Бренды из товаров');
      const products = getCache('products_cat_all', 999999);
      if (products?.elements) {
        brands = [...new Set(products.elements.map(p => p.brand).filter(Boolean))].sort();
      }
    }

    let priceRange = { min: 0, max: 1000000 };
    const products = getCache('products_cat_all', 999999);
    if (products?.elements) {
      const prices = products.elements.map(p => p.price2 || p.price1 || 0).filter(p => p > 0);
      if (prices.length) {
        priceRange = { min: Math.min(...prices), max: Math.max(...prices) };
      }
    }

    filters = { brands: brands.slice(0, 50), priceRange };
    setCache('filters', filters);
    res.json(filters);
  } catch (error) {
    console.error('❌ Ошибка filters:', error.message);
    res.json({ brands: [], priceRange: { min: 0, max: 1000000 } });
  }
});

// SEARCH
app.get('/api/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);

    const products = getCache('products_cat_all', 999999);
    if (!products?.elements) return res.json([]);

    const s = q.toLowerCase();
    const results = products.elements
      .filter(p =>
        p.name?.toLowerCase().includes(s) ||
        p.full_name?.toLowerCase().includes(s) ||
        p.brand?.toLowerCase().includes(s)
      )
      .slice(0, 10)
      .map(p => ({
        article: p.article,
        name: p.name || p.full_name,
        brand: p.brand,
        price: p.price2 || p.price1 || p.price,
        image: p.images?.[0] || null
      }));

    res.json(results);
  } catch (error) {
    res.json([]);
  }
});

app.listen(PORT, () => {
  console.log('\n🚀 LUXE Backend v2.7');
  console.log('━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📡 Port: ${PORT}`);
  console.log(`🔑 Token: ${ALSTYLE_TOKEN ? '✅ OK' : '❌ Отсутствует'}`);
  console.log('⏱️  Rate: 10 секунд');
  console.log('✨ Готово!\n');
});