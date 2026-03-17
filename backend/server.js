import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;
const ALSTYLE_TOKEN = process.env.ALSTYLE_ACCESS_TOKEN;

if (!ALSTYLE_TOKEN) {
  console.error('❌ ОШИБКА: ALSTYLE_ACCESS_TOKEN не найден');
  process.exit(1);
}

console.log('🔑 Token:', ALSTYLE_TOKEN.substring(0, 10) + '...');

// Простой кеш в памяти
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

// Rate limiting для API запросов
let lastApiCall = 0;
const MIN_INTERVAL = 5000; // 5 секунд между запросами

async function waitForRateLimit() {
  const now = Date.now();
  const timeSinceLastCall = now - lastApiCall;
  
  if (timeSinceLastCall < MIN_INTERVAL) {
    const waitTime = MIN_INTERVAL - timeSinceLastCall;
    console.log(`⏳ Ждем ${waitTime}ms для rate limit...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  lastApiCall = Date.now();
}

// CORS
app.use(cors({
  origin: function (origin, callback) {
    const allowed = [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://sultantrade.vercel.app'
    ];
    
    if (!origin || allowed.includes(origin) || /^https:\/\/sultantrade.*\.vercel\.app$/.test(origin)) {
      callback(null, true);
    } else {
      callback(null, true);
    }
  },
  credentials: true
}));

app.use(express.json());

// Логирование запросов
app.use((req, res, next) => {
  console.log(`${new Date().toLocaleTimeString()} - ${req.method} ${req.path}`);
  next();
});

// API клиент
const api = axios.create({
  baseURL: 'https://api.al-style.kz/api',
  timeout: 15000,
  headers: {
    'Accept': 'application/json'
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    cache_size: cache.size 
  });
});

// PRODUCTS с улучшенным кешированием
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
      category 
    } = req.query;

    // Проверяем кеш (30 сек для products)
    let cached = getCache('products', 30000);
    
    if (!cached) {
      console.log('📦 Загрузка товаров из Al-Style API...');
      
      try {
        await waitForRateLimit();
        
        const response = await api.get('/elements-pagination', {
          params: {
            access_token: ALSTYLE_TOKEN,
            exclude_missing: 'true', // ВАЖНО! Только товары в наличии
            limit: 100,
            offset: 0
          }
        });
        
        cached = response.data;
        setCache('products', cached);
        console.log('✅ Загружено товаров:', cached.elements?.length || 0);
        
      } catch (apiError) {
        console.error('❌ Ошибка API:', apiError.response?.status, apiError.message);
        
        // Если 403 - пытаемся использовать старый кеш
        if (apiError.response?.status === 403) {
          console.log('⚠️  Rate limit! Используем старый кеш если есть...');
          const oldCache = cache.get('products');
          if (oldCache) {
            cached = oldCache.data;
            console.log('✅ Используем старый кеш');
          } else {
            throw apiError;
          }
        } else {
          throw apiError;
        }
      }
    } else {
      console.log('💾 Товары из кеша');
    }

    let products = cached.elements || [];
    console.log('📊 Всего товаров в базе:', products.length);

    // Фильтрация по категории
    if (category) {
      products = products.filter(p => 
        p.category && p.category.toString() === category.toString()
      );
      console.log('🔍 После фильтра категории:', products.length);
    }

    // Фильтрация по цене
    if (minPrice || maxPrice) {
      products = products.filter(p => {
        const price = p.price2 || p.price1 || p.price || 0;
        if (minPrice && price < Number(minPrice)) return false;
        if (maxPrice && price > Number(maxPrice)) return false;
        return true;
      });
      console.log('🔍 После фильтра цены:', products.length);
    }

    // Фильтрация по бренду
    if (brand) {
      products = products.filter(p => 
        p.brand?.toLowerCase() === brand.toLowerCase()
      );
      console.log('🔍 После фильтра бренда:', products.length);
    }

    // Только новинки
    if (onlyNew === 'true') {
      products = products.filter(p => p.isnew === 1);
      console.log('🔍 Только новинки:', products.length);
    }

    // Поиск
    if (search) {
      const s = search.toLowerCase();
      products = products.filter(p => 
        p.name?.toLowerCase().includes(s) ||
        p.full_name?.toLowerCase().includes(s) ||
        p.brand?.toLowerCase().includes(s)
      );
      console.log('🔍 После поиска:', products.length);
    }

    // Сортировка
    switch (sortBy) {
      case 'price_asc':
        products.sort((a, b) => {
          const priceA = a.price2 || a.price1 || a.price || 0;
          const priceB = b.price2 || b.price1 || b.price || 0;
          return priceA - priceB;
        });
        break;
      case 'price_desc':
        products.sort((a, b) => {
          const priceA = a.price2 || a.price1 || a.price || 0;
          const priceB = b.price2 || b.price1 || b.price || 0;
          return priceB - priceA;
        });
        break;
      case 'name_asc':
        products.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        break;
      case 'newest':
        products.sort((a, b) => (b.isnew || 0) - (a.isnew || 0));
        break;
    }

    // Пагинация
    const start = Number(offset);
    const end = start + Number(limit);
    const paginated = products.slice(start, end);

    console.log('📄 Отправляем товаров:', paginated.length);

    res.json({
      elements: paginated,
      pagination: {
        total: products.length,
        offset: start,
        limit: Number(limit),
        hasMore: end < products.length,
        totalCount: products.length
      }
    });

  } catch (error) {
    console.error('❌ Критическая ошибка /api/products:', error.message);
    res.status(500).json({ 
      error: 'Ошибка загрузки товаров',
      elements: [],
      pagination: { total: 0, offset: 0, limit: 12, hasMore: false, totalCount: 0 }
    });
  }
});

// SINGLE PRODUCT
app.get('/api/product/:article', async (req, res) => {
  try {
    const { article } = req.params;
    const key = `product_${article}`;
    
    let product = getCache(key, 60000); // 1 минута
    
    if (!product) {
      console.log('📦 Загрузка товара:', article);
      await waitForRateLimit();
      
      const response = await api.get('/element-info', {
        params: {
          access_token: ALSTYLE_TOKEN,
          article: article
        }
      });
      
      product = response.data;
      setCache(key, product);
      console.log('✅ Товар загружен');
    } else {
      console.log('💾 Товар из кеша');
    }

    res.json(product);

  } catch (error) {
    console.error('❌ Ошибка /api/product:', error.message);
    res.status(500).json({ error: 'Ошибка загрузки товара' });
  }
});

// CATEGORIES
app.get('/api/categories', async (req, res) => {
  try {
    let categories = getCache('categories', 300000); // 5 минут

    if (!categories) {
      console.log('📦 Загрузка категорий...');
      await waitForRateLimit();
      
      const response = await api.get('/categories', {
        params: { access_token: ALSTYLE_TOKEN }
      });
      
      categories = response.data;
      setCache('categories', categories);
      console.log('✅ Категории загружены:', categories.length);
    } else {
      console.log('💾 Категории из кеша');
    }

    res.json(categories);

  } catch (error) {
    console.error('❌ Ошибка /api/categories:', error.message);
    res.status(500).json({ error: 'Ошибка загрузки категорий' });
  }
});

// FILTERS с fallback
app.get('/api/filters', async (req, res) => {
  try {
    let filters = getCache('filters', 300000); // 5 минут
    
    if (filters) {
      console.log('💾 Фильтры из кеша');
      return res.json(filters);
    }

    console.log('📦 Загрузка фильтров...');
    let brands = [];
    
    // Пытаемся получить бренды из API
    try {
      await waitForRateLimit();
      
      const response = await api.get('/brands', {
        params: { access_token: ALSTYLE_TOKEN }
      });
      
      if (Array.isArray(response.data)) {
        brands = response.data
          .filter(b => b.name && b.name.trim())
          .map(b => b.name)
          .sort();
        console.log('✅ Бренды из API:', brands.length);
      }
    } catch (e) {
      console.log('⚠️  Ошибка API брендов, используем товары');
      
      // Fallback: берем бренды из кеша товаров
      const products = getCache('products', 999999);
      if (products?.elements) {
        const set = new Set();
        products.elements.forEach(p => {
          if (p.brand && p.brand.trim()) set.add(p.brand);
        });
        brands = Array.from(set).sort();
        console.log('✅ Бренды из товаров:', brands.length);
      }
    }

    // Диапазон цен из товаров
    let priceRange = { min: 0, max: 1000000 };
    const products = getCache('products', 999999);
    
    if (products?.elements) {
      const prices = products.elements
        .map(p => p.price2 || p.price1 || p.price || 0)
        .filter(p => p > 0);
        
      if (prices.length > 0) {
        priceRange.min = Math.min(...prices);
        priceRange.max = Math.max(...prices);
        console.log('✅ Диапазон цен:', priceRange);
      }
    }

    filters = { 
      brands: brands.slice(0, 50), 
      priceRange 
    };
    
    setCache('filters', filters);
    console.log('✅ Фильтры готовы');

    res.json(filters);

  } catch (error) {
    console.error('❌ Ошибка /api/filters:', error.message);
    res.json({ 
      brands: [], 
      priceRange: { min: 0, max: 1000000 } 
    });
  }
});

// SEARCH
app.get('/api/search', async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.length < 2) {
      return res.json([]);
    }

    const products = getCache('products', 999999);
    if (!products?.elements) {
      return res.json([]);
    }

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
    console.error('❌ Ошибка /api/search:', error.message);
    res.json([]);
  }
});

// Запуск сервера
app.listen(PORT, () => {
  console.log('\n🚀 LUXE Backend Server v2.3');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📡 Server: http://localhost:${PORT}`);
  console.log('🔗 API: https://api.al-style.kz/api');
  console.log('✅ exclude_missing=true - только товары в наличии');
  console.log('⏱️  Rate limit: 5 секунд между запросами');
  console.log('💾 Кеш: 30с товары, 1м товар, 5м категории');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✨ Backend готов!\n');
});