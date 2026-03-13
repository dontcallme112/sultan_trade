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
console.log('🚀 LUXE Backend Server');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`📡 Server: http://localhost:${PORT}`);
console.log(`🔗 API: ${API_BASE_URL}`);
console.log(`🔑 Token: ${ACCESS_TOKEN ? '✓ ' + ACCESS_TOKEN.substring(0, 10) + '...' : '✗ Missing'}`);
console.log(`🌐 CORS: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

if (!ACCESS_TOKEN) {
  console.error('❌ ОШИБКА: ALSTYLE_ACCESS_TOKEN не найден в .env файле');
  process.exit(1);
}

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

// Логирование запросов
app.use((req, res, next) => {
  console.log(`${new Date().toLocaleTimeString()} - ${req.method} ${req.path}`);
  next();
});

// ============================================
// КЕШИРОВАНИЕ (увеличено для избежания 403)
// ============================================
const cache = new Map();
const CACHE_TTL = 30000; // 30 секунд (увеличено с 5!)
const PRODUCT_CACHE_TTL = 60000; // 60 секунд для отдельных товаров

function getCacheKey(endpoint, params) {
  return `${endpoint}:${JSON.stringify(params)}`;
}

function getFromCache(key, customTTL = CACHE_TTL) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < customTTL) {
    console.log('📦 Из кеша (возраст:', Math.round((Date.now() - cached.timestamp) / 1000), 'сек)');
    return cached.data;
  }
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
  console.log('💾 Сохранено в кеш');
}

// Health Check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    token: !!ACCESS_TOKEN,
    cacheSize: cache.size
  });
});

// GET /api/products
app.get('/api/products', async (req, res) => {
  try {
    const { category, brand, limit = 10, offset = 0 } = req.query;
    
    const params = {
      'access-token': ACCESS_TOKEN,
      limit,
      offset,
      exclude_min_price: 'true',
      additional_fields: 'description,brand,images,url'
    };
    
    if (category && category !== 'null') params.category = category;
    if (brand && brand !== 'null') params.brand = brand;
    
    // Проверяем кеш
    const cacheKey = getCacheKey('products', params);
    const cached = getFromCache(cacheKey);
    if (cached) {
      return res.json(cached);
    }
    
    console.log('📦 Запрос товаров:', { limit, offset, category, brand });
    
    const response = await axios.get(`${API_BASE_URL}/elements-pagination`, { params });
    
    console.log(`✅ Получено товаров: ${response.data?.elements?.length || 0}`);
    
    setCache(cacheKey, response.data);
    res.json(response.data);
    
  } catch (error) {
    console.error('❌ Ошибка при получении товаров:', error.message);
    
    if (error.response) {
      console.error('Статус:', error.response.status);
      console.error('Данные:', JSON.stringify(error.response.data, null, 2));
      
      // Если 403 - возможно rate limit, попробуем вернуть из кеша даже старый
      if (error.response.status === 403) {
        const cacheKey = getCacheKey('products', { limit, offset, category, brand });
        const staleCache = cache.get(cacheKey);
        if (staleCache) {
          console.log('⚠️ Возвращаем старые данные из-за rate limit');
          return res.json(staleCache.data);
        }
      }
      
      res.status(error.response.status).json({
        error: 'API Error',
        message: error.response.data?.message || error.message,
        status: error.response.status
      });
    } else {
      res.status(500).json({
        error: 'Internal Error',
        message: error.message
      });
    }
  }
});

// GET /api/product/:article - получить ОДИН товар
app.get('/api/product/:article', async (req, res) => {
  try {
    const { article } = req.params;
    
    console.log('🔍 Запрос товара:', article);
    
    // Проверяем кеш (ДОЛГИЙ TTL для товаров)
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
    
    console.log('📡 Запрос к Al-Style API...');
    
    const response = await axios.get(`${API_BASE_URL}/elements`, { params });
    
    if (response.data && response.data.elements && response.data.elements.length > 0) {
      const product = response.data.elements[0];
      console.log('✅ Товар найден:', product.name);
      
      const result = {
        status: true,
        data: product
      };
      
      setCache(cacheKey, result);
      res.json(result);
    } else {
      console.log('❌ Товар не найден в ответе API');
      res.status(404).json({
        status: false,
        message: 'Товар не найден'
      });
    }
    
  } catch (error) {
    console.error('❌ Ошибка получения товара:', error.message);
    
    if (error.response) {
      console.error('Статус:', error.response.status);
      console.error('Данные:', JSON.stringify(error.response.data, null, 2));
      
      // Если 403 - пытаемся вернуть из кеша даже если он старый
      if (error.response.status === 403) {
        const cacheKey = getCacheKey('product', { article: req.params.article });
        const staleCache = cache.get(cacheKey);
        
        if (staleCache) {
          console.log('⚠️ Rate limit! Возвращаем старые данные из кеша');
          return res.json(staleCache.data);
        } else {
          console.log('⚠️ Rate limit! Кеш пуст, возвращаем ошибку');
        }
      }
      
      res.status(error.response.status).json({
        status: false,
        error: 'API Error',
        message: error.response.data?.message || 'Al-Style API временно недоступен'
      });
    } else {
      res.status(500).json({
        status: false,
        error: 'Internal Error',
        message: error.message
      });
    }
  }
});

// GET /api/categories
app.get('/api/categories', async (req, res) => {
  try {
    const cacheKey = 'categories';
    const cached = getFromCache(cacheKey, 3600000); // 1 час для категорий
    if (cached) {
      return res.json(cached);
    }
    
    const response = await axios.get(`${API_BASE_URL}/category`, {
      params: { 'access-token': ACCESS_TOKEN }
    });
    
    setCache(cacheKey, response.data);
    res.json(response.data);
  } catch (error) {
    console.error('❌ Ошибка категорий:', error.message);
    
    // Пытаемся вернуть из кеша даже старые данные
    const staleCache = cache.get('categories');
    if (staleCache) {
      console.log('⚠️ Возвращаем старые категории');
      return res.json(staleCache.data);
    }
    
    res.status(500).json({ error: error.message });
  }
});

// 404
app.use((req, res) => {
  console.log('❌ 404:', req.path);
  res.status(404).json({ error: 'Not Found', path: req.path });
});

// Очистка старого кеша каждые 10 минут
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
    console.log(`🧹 Очищено ${deleted} старых записей. Осталось: ${cache.size}`);
  }
}, 600000);

// Запуск
app.listen(PORT, () => {
  console.log('');
  console.log('✨ Backend готов!');
  console.log('⚡ Кеш: 30 сек (товары), 60 сек (один товар)');
  console.log('');
  console.log('📍 Endpoints:');
  console.log('  GET /health');
  console.log('  GET /api/products');
  console.log('  GET /api/product/:article');
  console.log('  GET /api/categories');
  console.log('');
});

export default app;