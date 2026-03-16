const express = require('express');
const cors = require('cors');
const axios = require('axios');
const NodeCache = require('node-cache');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

// Токен Al-Style API
const ALSTYLE_TOKEN = process.env.ALSTYLE_ACCESS_TOKEN;

if (!ALSTYLE_TOKEN) {
  console.error('❌ ОШИБКА: ALSTYLE_ACCESS_TOKEN не найден в .env');
  process.exit(1);
}

console.log('🔑 Token:', '✓', ALSTYLE_TOKEN.substring(0, 10) + '...');

// Инициализация кеша (30 сек для товаров, 60 сек для одного товара, 5 мин для фильтров)
const cache = new NodeCache({ stdTTL: 30, checkperiod: 60 });

// CORS настройка
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://sultantrade.vercel.app',
  process.env.FRONTEND_URL
].filter(Boolean);

const allowedPatterns = [
  /^http:\/\/localhost(:\d+)?$/,
  /^https:\/\/sultantrade\.vercel\.app$/,
  /^https:\/\/sultantrade-.*\.vercel\.app$/
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    if (allowedPatterns.some(pattern => pattern.test(origin))) {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

app.use(express.json());

// Al-Style API клиент
const alStyleAPI = axios.create({
  baseURL: 'https://api.al-style.kz/api',
  timeout: 10000,
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  }
});

// Rate limiting для API
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 5000; // 5 секунд между запросами

async function rateLimitedRequest(config) {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  lastRequestTime = Date.now();
  return alStyleAPI(config);
}

// Middleware для логирования
app.use((req, res, next) => {
  console.log(`${new Date().toLocaleTimeString()} - ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ============================================
// PRODUCTS ENDPOINT с фильтрацией
// ============================================
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
      sortBy = 'default',
      category
    } = req.query;

    // Проверяем кеш
    const cacheKey = 'products';
    let cachedData = cache.get(cacheKey);

    if (!cachedData) {
      console.log('📦 Запрос товаров из API (только с остатком!)');
      
      try {
        const response = await rateLimitedRequest({
          method: 'GET',
          url: '/elements-pagination',
          params: {
            access_token: ALSTYLE_TOKEN,
            exclude_missing: 'true', // ВАЖНО! Только товары в наличии
            limit: 100,
            offset: 0
          }
        });

        cachedData = response.data;
        cache.set(cacheKey, cachedData, 30);
        console.log('💾 Сохранено в кеш');
        console.log('📊 Получено товаров:', cachedData.elements?.length || 0);
      } catch (error) {
        if (error.response?.status === 403) {
          console.log('⚠️  Rate limit, используем старый кеш');
          cachedData = cache.get(cacheKey) || { elements: [] };
        } else {
          throw error;
        }
      }
    } else {
      console.log('📦 Из кеша');
      console.log('📊 Получено товаров:', cachedData.elements?.length || 0);
    }

    let filteredProducts = cachedData.elements || [];

    // Фильтрация по категории
    if (category) {
      filteredProducts = filteredProducts.filter(p => 
        p.category && p.category.toString() === category.toString()
      );
    }

    // Фильтрация по цене
    if (minPrice || maxPrice) {
      filteredProducts = filteredProducts.filter(product => {
        const price = product.price2 || product.price1 || product.price || 0;
        if (minPrice && price < Number(minPrice)) return false;
        if (maxPrice && price > Number(maxPrice)) return false;
        return true;
      });
    }

    // Фильтрация по бренду
    if (brand) {
      filteredProducts = filteredProducts.filter(product => 
        product.brand?.toLowerCase() === brand.toLowerCase()
      );
    }

    // Фильтрация "Только новинки"
    if (onlyNew === 'true') {
      filteredProducts = filteredProducts.filter(product => product.isnew === 1);
    }

    // Поиск
    if (search) {
      const searchLower = search.toLowerCase();
      filteredProducts = filteredProducts.filter(product => 
        product.name?.toLowerCase().includes(searchLower) ||
        product.full_name?.toLowerCase().includes(searchLower) ||
        product.brand?.toLowerCase().includes(searchLower)
      );
    }

    // Сортировка
    switch (sortBy) {
      case 'price_asc':
        filteredProducts.sort((a, b) => {
          const priceA = a.price2 || a.price1 || a.price || 0;
          const priceB = b.price2 || b.price1 || b.price || 0;
          return priceA - priceB;
        });
        break;
      case 'price_desc':
        filteredProducts.sort((a, b) => {
          const priceA = a.price2 || a.price1 || a.price || 0;
          const priceB = b.price2 || b.price1 || b.price || 0;
          return priceB - priceA;
        });
        break;
      case 'name_asc':
        filteredProducts.sort((a, b) => 
          (a.name || '').localeCompare(b.name || '')
        );
        break;
      case 'newest':
        filteredProducts.sort((a, b) => (b.isnew || 0) - (a.isnew || 0));
        break;
    }

    console.log('🔍 После фильтрации:', filteredProducts.length);

    // Пагинация
    const startIndex = Number(offset);
    const endIndex = startIndex + Number(limit);
    const paginatedProducts = filteredProducts.slice(startIndex, endIndex);

    console.log('📄 Отправляем:', paginatedProducts.length, 'товаров');

    res.json({
      elements: paginatedProducts,
      pagination: {
        total: filteredProducts.length,
        offset: Number(offset),
        limit: Number(limit),
        hasMore: endIndex < filteredProducts.length,
        totalCount: filteredProducts.length
      }
    });

  } catch (error) {
    console.error('❌ Ошибка /api/products:', error.message);
    res.status(500).json({ 
      error: 'Ошибка загрузки товаров',
      elements: [],
      pagination: { total: 0, offset: 0, limit: 12, hasMore: false }
    });
  }
});

// ============================================
// SINGLE PRODUCT
// ============================================
app.get('/api/product/:article', async (req, res) => {
  try {
    const { article } = req.params;
    const cacheKey = `product_${article}`;
    
    let cachedProduct = cache.get(cacheKey);
    
    if (!cachedProduct) {
      const response = await rateLimitedRequest({
        method: 'GET',
        url: '/element-info',
        params: {
          access_token: ALSTYLE_TOKEN,
          article: article
        }
      });

      cachedProduct = response.data;
      cache.set(cacheKey, cachedProduct, 60);
    }

    res.json(cachedProduct);

  } catch (error) {
    console.error('❌ Ошибка /api/product:', error.message);
    res.status(500).json({ error: 'Ошибка загрузки товара' });
  }
});

// ============================================
// CATEGORIES
// ============================================
app.get('/api/categories', async (req, res) => {
  try {
    const cacheKey = 'categories';
    let cachedCategories = cache.get(cacheKey);

    if (!cachedCategories) {
      const response = await rateLimitedRequest({
        method: 'GET',
        url: '/categories',
        params: {
          access_token: ALSTYLE_TOKEN
        }
      });

      cachedCategories = response.data;
      cache.set(cacheKey, cachedCategories, 300);
      console.log('💾 Сохранено в кеш');
    }

    res.json(cachedCategories);

  } catch (error) {
    console.error('❌ Ошибка /api/categories:', error.message);
    res.status(500).json({ error: 'Ошибка загрузки категорий' });
  }
});

// ============================================
// FILTERS с улучшенной обработкой ошибок
// ============================================
app.get('/api/filters', async (req, res) => {
  try {
    const cached = cache.get('filters');
    if (cached) {
      console.log('💾 Фильтры из кеша');
      return res.json(cached);
    }

    console.log('📊 Загрузка данных для фильтров...');

    let brands = [];
    let priceRange = { min: 0, max: 1000000 };

    // Пытаемся получить бренды из API
    try {
      const brandsResponse = await rateLimitedRequest({
        method: 'GET',
        url: '/brands',
        params: { access_token: ALSTYLE_TOKEN }
      });

      if (brandsResponse.data && Array.isArray(brandsResponse.data)) {
        brands = brandsResponse.data
          .filter(brand => brand.name && brand.name.trim())
          .map(brand => brand.name)
          .sort();
      }
    } catch (brandError) {
      console.log('⚠️  Не удалось загрузить бренды из API, используем кеш товаров');
      
      // Fallback: берем бренды из закешированных товаров
      const cachedProducts = cache.get('products');
      if (cachedProducts && cachedProducts.elements) {
        const uniqueBrands = new Set();
        cachedProducts.elements.forEach(product => {
          if (product.brand && product.brand.trim()) {
            uniqueBrands.add(product.brand);
          }
        });
        brands = Array.from(uniqueBrands).sort();
        console.log(`✅ Извлечено ${brands.length} брендов из кеша товаров`);
      }
    }

    // Получаем диапазон цен из кеша товаров
    const cachedProducts = cache.get('products');
    if (cachedProducts && cachedProducts.elements) {
      const prices = cachedProducts.elements
        .map(p => p.price2 || p.price1 || p.price || 0)
        .filter(p => p > 0);

      if (prices.length > 0) {
        priceRange.min = Math.min(...prices);
        priceRange.max = Math.max(...prices);
      }
    }

    const filtersData = {
      brands: brands.slice(0, 50),
      priceRange: priceRange
    };

    cache.set('filters', filtersData, 300);
    console.log(`✅ Фильтры готовы: ${brands.length} брендов`);

    res.json(filtersData);

  } catch (error) {
    console.error('❌ Ошибка фильтров:', error.message);
    
    // Возвращаем минимальные данные вместо ошибки
    res.json({
      brands: [],
      priceRange: { min: 0, max: 1000000 }
    });
  }
});

// ============================================
// SEARCH (автодополнение)
// ============================================
app.get('/api/search', async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.length < 2) {
      return res.json([]);
    }

    const cachedProducts = cache.get('products');
    if (!cachedProducts || !cachedProducts.elements) {
      return res.json([]);
    }

    const searchLower = q.toLowerCase();
    const results = cachedProducts.elements
      .filter(product => 
        product.name?.toLowerCase().includes(searchLower) ||
        product.full_name?.toLowerCase().includes(searchLower) ||
        product.brand?.toLowerCase().includes(searchLower)
      )
      .slice(0, 10)
      .map(product => ({
        article: product.article,
        name: product.name || product.full_name,
        brand: product.brand,
        price: product.price2 || product.price1 || product.price,
        image: product.images?.[0] || null
      }));

    res.json(results);

  } catch (error) {
    console.error('❌ Ошибка /api/search:', error.message);
    res.json([]);
  }
});

// Запуск сервера
app.listen(PORT, () => {
  console.log('\n🚀 LUXE Backend Server v2.2');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📡 Server: http://localhost:${PORT}`);
  console.log('🔗 API: https://api.al-style.kz/api');
  console.log('✅ exclude_missing=true - только товары в наличии!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📍 Endpoints:');
  console.log('  GET /health');
  console.log('  GET /api/products');
  console.log('  GET /api/product/:article');
  console.log('  GET /api/categories');
  console.log('  GET /api/filters');
  console.log('  GET /api/search?q=...');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔍 Фильтрация: цена, бренд, поиск');
  console.log('📊 Сортировка: цена, название, новизна');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✨ Backend готов!\n');
});