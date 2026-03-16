import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const API_BASE_URL = 'https://api.al-style.kz/api';
const ACCESS_TOKEN = process.env.ALSTYLE_ACCESS_TOKEN;

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🚀 LUXE Backend Server v2.1');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`📡 Server: http://localhost:${PORT}`);
console.log(`🔗 API: ${API_BASE_URL}`);
console.log(`🔑 Token: ${ACCESS_TOKEN ? '✓ ' + ACCESS_TOKEN.substring(0, 10) + '...' : '✗ Missing'}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

if (!ACCESS_TOKEN) {
  console.error('❌ ОШИБКА: ALSTYLE_ACCESS_TOKEN не найден');
  process.exit(1);
}

// ============================================
// CORS
// ============================================
app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    
    const allowedPatterns = [
      /^http:\/\/localhost(:\d+)?$/,
      /^https:\/\/sultantrade\.vercel\.app$/,
      /^https:\/\/sultantrade-.*\.vercel\.app$/,
    ];
    
    const isAllowed = allowedPatterns.some(pattern => pattern.test(origin));
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.warn(`⚠️ Blocked CORS from: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());

app.use((req, res, next) => {
  console.log(`${new Date().toLocaleTimeString()} - ${req.method} ${req.path}`);
  next();
});

// ============================================
// КЕШИРОВАНИЕ
// ============================================
const cache = new Map();
const CACHE_TTL = 30000;
const PRODUCT_CACHE_TTL = 60000;

function getCacheKey(endpoint, params) {
  return `${endpoint}:${JSON.stringify(params)}`;
}

function getFromCache(key, customTTL = CACHE_TTL) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < customTTL) {
    console.log('📦 Из кеша');
    return cached.data;
  }
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
  console.log('💾 Сохранено в кеш');
}

// ============================================
// HELPER FUNCTIONS
// ============================================

// Фильтрация и сортировка на стороне сервера
function filterAndSortProducts(products, filters) {
  let filtered = [...products];
  
  // Фильтр по цене
  if (filters.minPrice !== undefined) {
    filtered = filtered.filter(p => {
      const price = p.price2 || p.price1 || p.price || 0;
      return price >= filters.minPrice;
    });
  }
  
  if (filters.maxPrice !== undefined) {
    filtered = filtered.filter(p => {
      const price = p.price2 || p.price1 || p.price || 0;
      return price <= filters.maxPrice;
    });
  }
  
  // Фильтр по бренду
  if (filters.brand) {
    filtered = filtered.filter(p => p.brand === filters.brand);
  }
  
  // Только новинки
  if (filters.onlyNew) {
    filtered = filtered.filter(p => p.isnew === 1);
  }
  
  // Поиск
  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    filtered = filtered.filter(p => {
      const name = (p.name || '').toLowerCase();
      const fullName = (p.full_name || '').toLowerCase();
      const article = (p.article || '').toString();
      
      return name.includes(searchLower) ||
             fullName.includes(searchLower) ||
             article.includes(searchLower);
    });
  }
  
  // Сортировка
  switch (filters.sortBy) {
    case 'price_asc':
      filtered.sort((a, b) => {
        const priceA = a.price2 || a.price1 || a.price || 0;
        const priceB = b.price2 || b.price1 || b.price || 0;
        return priceA - priceB;
      });
      break;
    
    case 'price_desc':
      filtered.sort((a, b) => {
        const priceA = a.price2 || a.price1 || a.price || 0;
        const priceB = b.price2 || b.price1 || b.price || 0;
        return priceB - priceA;
      });
      break;
    
    case 'name_asc':
      filtered.sort((a, b) => {
        const nameA = (a.name || '').toLowerCase();
        const nameB = (b.name || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });
      break;
    
    case 'newest':
      filtered.sort((a, b) => {
        if (a.isnew && !b.isnew) return -1;
        if (!a.isnew && b.isnew) return 1;
        return 0;
      });
      break;
  }
  
  return filtered;
}

// ============================================
// HEALTH CHECK
// ============================================
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    token: !!ACCESS_TOKEN,
    cacheSize: cache.size,
    version: '2.1'
  });
});

// ============================================
// GET /api/products - С ФИЛЬТРАЦИЕЙ И ПОИСКОМ
// ============================================
app.get('/api/products', async (req, res) => {
  try {
    const { 
      category, 
      brand, 
      limit = 12, 
      offset = 0,
      minPrice,
      maxPrice,
      onlyNew,
      search,
      sortBy = 'default'
    } = req.query;
    
    // Параметры для Al-Style API - ВАЖНО: exclude_missing=true
    const params = {
      'access-token': ACCESS_TOKEN,
      limit: 100,
      offset: 0,
      exclude_missing: 'true', // ← СКРЫВАЕТ ТОВАРЫ БЕЗ ОСТАТКА!
      additional_fields: 'description,brand,images,url'
    };
    
    if (category && category !== 'null') params.category = category;
    if (brand && brand !== 'null') params.brand = brand;
    
    const cacheKey = getCacheKey('products_all', params);
    let allProducts = getFromCache(cacheKey);
    
    if (!allProducts) {
      console.log('📦 Запрос товаров из API (только с остатком!)');
      const response = await axios.get(`${API_BASE_URL}/elements-pagination`, { params });
      allProducts = response.data?.elements || [];
      setCache(cacheKey, allProducts);
    }
    
    console.log(`📊 Получено товаров: ${allProducts.length}`);
    
    // Применяем фильтры на стороне сервера
    const filters = {
      brand: brand !== 'null' ? brand : undefined,
      minPrice: minPrice ? parseFloat(minPrice) : undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
      onlyNew: onlyNew === 'true',
      search: search || undefined,
      sortBy: sortBy
    };
    
    let filteredProducts = filterAndSortProducts(allProducts, filters);
    console.log(`🔍 После фильтрации: ${filteredProducts.length}`);
    
    // Пагинация
    const startIndex = parseInt(offset);
    const endIndex = startIndex + parseInt(limit);
    const paginatedProducts = filteredProducts.slice(startIndex, endIndex);
    
    console.log(`📄 Отправляем: ${paginatedProducts.length} товаров`);
    
    res.json({
      elements: paginatedProducts,
      pagination: {
        totalCount: filteredProducts.length,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: endIndex < filteredProducts.length
      }
    });
    
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    
    if (error.response?.status === 403) {
      const cacheKey = getCacheKey('products_all', {});
      const staleCache = cache.get(cacheKey);
      
      if (staleCache) {
        console.log('⚠️ Rate limit! Возвращаем кеш');
        return res.json({ 
          elements: staleCache.data.slice(0, 12),
          pagination: { totalCount: 0, hasMore: false }
        });
      }
    }
    
    res.status(error.response?.status || 500).json({
      error: error.message,
      elements: [],
      pagination: { totalCount: 0, hasMore: false }
    });
  }
});

// ============================================
// GET /api/search - АВТОДОПОЛНЕНИЕ
// ============================================
app.get('/api/search', async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.length < 2) {
      return res.json({ suggestions: [] });
    }
    
    const cacheKey = getCacheKey('products_all', {});
    let allProducts = getFromCache(cacheKey);
    
    if (!allProducts) {
      const params = {
        'access-token': ACCESS_TOKEN,
        limit: 100,
        offset: 0,
        exclude_missing: 'true', // Только товары с остатком
        additional_fields: 'brand,images'
      };
      
      const response = await axios.get(`${API_BASE_URL}/elements-pagination`, { params });
      allProducts = response.data?.elements || [];
      setCache(cacheKey, allProducts);
    }
    
    const searchLower = q.toLowerCase();
    const suggestions = allProducts
      .filter(p => {
        const name = (p.name || '').toLowerCase();
        const brand = (p.brand || '').toLowerCase();
        const article = (p.article || '').toString();
        return name.includes(searchLower) || 
               brand.includes(searchLower) ||
               article.includes(searchLower);
      })
      .slice(0, 10)
      .map(p => ({
        article: p.article,
        name: p.name,
        brand: p.brand,
        price: p.price2 || p.price1 || p.price,
        image: p.images?.[0] || null
      }));
    
    res.json({ suggestions });
    
  } catch (error) {
    console.error('❌ Ошибка поиска:', error.message);
    res.json({ suggestions: [] });
  }
});

// ============================================
// GET /api/filters - ДОСТУПНЫЕ ФИЛЬТРЫ
// ============================================
app.get('/api/filters', async (req, res) => {
  try {
    const cacheKey = 'filters_data';
    let filtersData = getFromCache(cacheKey, 300000); // 5 минут
    
    if (!filtersData) {
      console.log('📊 Загрузка данных для фильтров...');
      
      // Получаем бренды из Al-Style API
      const brandsResponse = await axios.get(`${API_BASE_URL}/brands`, {
        params: { 'access-token': ACCESS_TOKEN }
      });
      
      const brandsData = brandsResponse.data?.data || [];
      const brands = brandsData
        .filter(b => b.count > 0) // Только бренды с товарами
        .map(b => b.name)
        .sort();
      
      // Получаем товары для определения диапазона цен
      const productsResponse = await axios.get(`${API_BASE_URL}/elements-pagination`, {
        params: {
          'access-token': ACCESS_TOKEN,
          limit: 100,
          offset: 0,
          exclude_missing: 'true'
        }
      });
      
      const products = productsResponse.data?.elements || [];
      
      // Диапазон цен
      const prices = products
        .map(p => p.price2 || p.price1 || p.price || 0)
        .filter(p => p > 0);
      
      const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
      const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
      
      filtersData = {
        brands: brands,
        priceRange: {
          min: Math.floor(minPrice),
          max: Math.ceil(maxPrice)
        },
        totalProducts: productsResponse.data?.pagination?.totalCount || products.length
      };
      
      setCache(cacheKey, filtersData);
      console.log('✅ Фильтры готовы:', filtersData);
    }
    
    res.json(filtersData);
    
  } catch (error) {
    console.error('❌ Ошибка фильтров:', error.message);
    
    // Fallback данные
    res.json({
      brands: [],
      priceRange: { min: 0, max: 1000000 },
      totalProducts: 0
    });
  }
});

// ============================================
// GET /api/product/:article
// ============================================
app.get('/api/product/:article', async (req, res) => {
  const { article } = req.params;
  
  try {
    console.log('🔍 Запрос товара:', article);
    
    const cacheKey = getCacheKey('product', { article });
    const cached = getFromCache(cacheKey, PRODUCT_CACHE_TTL);
    if (cached) {
      return res.json(cached);
    }
    
    const params = {
      'access-token': ACCESS_TOKEN,
      article: article,
      additional_fields: 'description,brand,images,url,warranty,weight'
    };
    
    const response = await axios.get(`${API_BASE_URL}/element-info`, { params });
    
    if (response.data && Array.isArray(response.data) && response.data.length > 0) {
      const product = response.data[0];
      console.log('✅ Товар найден:', product.name);
      
      const result = {
        status: true,
        data: product
      };
      
      setCache(cacheKey, result);
      res.json(result);
    } else {
      res.status(404).json({
        status: false,
        message: 'Товар не найден'
      });
    }
    
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    
    if (error.response?.status === 403) {
      const cacheKey = getCacheKey('product', { article });
      const staleCache = cache.get(cacheKey);
      
      if (staleCache) {
        console.log('⚠️ Rate limit! Возвращаем кеш');
        return res.json(staleCache.data);
      }
    }
    
    res.status(error.response?.status || 500).json({
      status: false,
      error: error.message
    });
  }
});

// ============================================
// GET /api/categories
// ============================================
app.get('/api/categories', async (req, res) => {
  try {
    const cacheKey = 'categories';
    const cached = getFromCache(cacheKey, 3600000);
    if (cached) {
      return res.json(cached);
    }
    
    // Используем правильный endpoint: /categories (не /category)
    const response = await axios.get(`${API_BASE_URL}/categories`, {
      params: { 'access-token': ACCESS_TOKEN }
    });
    
    setCache(cacheKey, response.data);
    res.json(response.data);
  } catch (error) {
    console.error('❌ Ошибка категорий:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Очистка кеша
setInterval(() => {
  const now = Date.now();
  let deleted = 0;
  
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > 600000) {
      cache.delete(key);
      deleted++;
    }
  }
  
  if (deleted > 0) {
    console.log(`🧹 Очищено ${deleted} записей`);
  }
}, 600000);

// Запуск
app.listen(PORT, () => {
  console.log('');
  console.log('✨ Backend готов!');
  console.log('🔍 Фильтрация: цена, бренд, поиск');
  console.log('📊 Сортировка: цена, название, новизна');
  console.log('✅ exclude_missing=true - только товары в наличии!');
  console.log('');
  console.log('📍 Endpoints:');
  console.log('  GET /health');
  console.log('  GET /api/products');
  console.log('  GET /api/search?q=...');
  console.log('  GET /api/filters');
  console.log('  GET /api/product/:article');
  console.log('  GET /api/categories');
  console.log('');
});

export default app;