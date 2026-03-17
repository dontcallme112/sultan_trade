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
const MIN_INTERVAL = 5000;

async function waitForRateLimit() {
  const now = Date.now();
  const timeSinceLastCall = now - lastApiCall;
  
  if (timeSinceLastCall < MIN_INTERVAL) {
    const waitTime = MIN_INTERVAL - timeSinceLastCall;
    console.log(`⏳ Ждем ${waitTime}ms...`);
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

// Логирование
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
      category 
    } = req.query;

    let cached = getCache('products', 30000);
    
    if (!cached) {
      console.log('📦 Загрузка товаров из API...');
      
      try {
        await waitForRateLimit();
        
        const response = await api.get('/elements-pagination', {
          params: {
            access_token: ALSTYLE_TOKEN,
            exclude_missing: 'true',
            limit: 100,
            offset: 0
          }
        });
        
        cached = response.data;
        setCache('products', cached);
        console.log('✅ Загружено:', cached.elements?.length || 0);
        
      } catch (apiError) {
        console.error('❌ API Error:', apiError.response?.status, apiError.message);
        
        if (apiError.response?.status === 403) {
          const oldCache = cache.get('products');
          if (oldCache) {
            cached = oldCache.data;
            console.log('⚠️  Используем старый кеш');
          } else {
            throw apiError;
          }
        } else {
          throw apiError;
        }
      }
    } else {
      console.log('💾 Из кеша');
    }

    // ВАЖНО! Проверяем что elements существует и это массив
    let products = [];
    if (cached && cached.elements && Array.isArray(cached.elements)) {
      products = cached.elements;
    } else if (cached && Array.isArray(cached)) {
      products = cached;
    } else {
      console.error('❌ Неверный формат данных:', typeof cached);
      throw new Error('Invalid data format from API');
    }

    console.log('📊 Товаров в базе:', products.length);

    // Фильтрация
    if (category) {
      products = products.filter(p => 
        p.category && p.category.toString() === category.toString()
      );
    }

    if (minPrice || maxPrice) {
      products = products.filter(p => {
        const price = p.price2 || p.price1 || p.price || 0;
        if (minPrice && price < Number(minPrice)) return false;
        if (maxPrice && price > Number(maxPrice)) return false;
        return true;
      });
    }

    if (brand) {
      products = products.filter(p => 
        p.brand?.toLowerCase() === brand.toLowerCase()
      );
    }

    if (onlyNew === 'true') {
      products = products.filter(p => p.isnew === 1);
      console.log('🆕 Только новинки:', products.length);
    }

    if (search) {
      const s = search.toLowerCase();
      products = products.filter(p => 
        p.name?.toLowerCase().includes(s) ||
        p.full_name?.toLowerCase().includes(s) ||
        p.brand?.toLowerCase().includes(s)
      );
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

    console.log('📄 Отправляем:', paginated.length);

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
    console.error('❌ Критическая ошибка:', error.message);
    res.status(500).json({ 
      error: 'Ошибка загрузки товаров',
      message: error.message,
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
    
    let product = getCache(key, 60000);
    
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
      console.log('💾 Из кеша');
    }

    res.json(product);

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    res.status(500).json({ 
      error: 'Ошибка загрузки товара',
      message: error.message 
    });
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
        params: { access_token: ALSTYLE_TOKEN }
      });
      
      categories = response.data;
      
      // ВАЖНО! Проверяем что это массив
      if (!Array.isArray(categories)) {
        console.log('⚠️  Категории не массив, преобразуем');
        // Если это объект с категориями внутри
        if (categories && typeof categories === 'object') {
          categories = Object.values(categories);
        } else {
          categories = [];
        }
      }
      
      setCache('categories', categories);
      console.log('✅ Категорий загружено:', categories.length);
    } else {
      console.log('💾 Из кеша');
    }

    res.json(categories);

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    res.status(500).json({ 
      error: 'Ошибка загрузки категорий',
      message: error.message 
    });
  }
});

// FILTERS
app.get('/api/filters', async (req, res) => {
  try {
    let filters = getCache('filters', 300000);
    
    if (filters) {
      console.log('💾 Фильтры из кеша');
      return res.json(filters);
    }

    console.log('📦 Загрузка фильтров...');
    let brands = [];
    
    try {
      await waitForRateLimit();
      
      const response = await api.get('/brands', {
        params: { access_token: ALSTYLE_TOKEN }
      });
      
      let brandsData = response.data;
      
      // Проверяем формат данных
      if (Array.isArray(brandsData)) {
        brands = brandsData
          .filter(b => b && b.name && b.name.trim())
          .map(b => b.name)
          .sort();
      } else if (brandsData && typeof brandsData === 'object') {
        brands = Object.values(brandsData)
          .filter(b => b && b.name && b.name.trim())
          .map(b => b.name)
          .sort();
      }
      
      console.log('✅ Бренды из API:', brands.length);
      
    } catch (e) {
      console.log('⚠️  Используем товары для брендов');
      
      const products = getCache('products', 999999);
      if (products?.elements && Array.isArray(products.elements)) {
        const set = new Set();
        products.elements.forEach(p => {
          if (p.brand && p.brand.trim()) set.add(p.brand);
        });
        brands = Array.from(set).sort();
        console.log('✅ Бренды из товаров:', brands.length);
      }
    }

    // Диапазон цен
    let priceRange = { min: 0, max: 1000000 };
    const products = getCache('products', 999999);
    
    if (products?.elements && Array.isArray(products.elements)) {
      const prices = products.elements
        .map(p => p.price2 || p.price1 || p.price || 0)
        .filter(p => p > 0);
        
      if (prices.length > 0) {
        priceRange.min = Math.min(...prices);
        priceRange.max = Math.max(...prices);
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
    console.error('❌ Ошибка:', error.message);
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
    
    if (!products?.elements || !Array.isArray(products.elements)) {
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
    console.error('❌ Ошибка:', error.message);
    res.json([]);
  }
});

// Запуск
app.listen(PORT, () => {
  console.log('\n🚀 LUXE Backend Server v2.4');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📡 Server: http://localhost:${PORT}`);
  console.log('🔗 API: https://api.al-style.kz/api');
  console.log('✅ exclude_missing=true');
  console.log('⏱️  Rate limit: 5 секунд');
  console.log('💾 Кеш: 30с товары, 1м товар, 5м остальное');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✨ Готово!\n');
});