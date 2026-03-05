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
// КЕШИРОВАНИЕ (чтобы не превышать лимиты API)
// ============================================
const cache = new Map();
const CACHE_TTL = 5000; // 5 секунд

function getCacheKey(endpoint, params) {
  return `${endpoint}:${JSON.stringify(params)}`;
}

function getFromCache(key) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log('📦 Из кеша');
    return cached.data;
  }
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
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
    
    // Параметры для al-style API
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
    
    // Сохраняем в кеш
    setCache(cacheKey, response.data);
    
    res.json(response.data);
    
  } catch (error) {
    console.error('❌ Ошибка при получении товаров:');
    console.error('Сообщение:', error.message);
    
    if (error.response) {
      console.error('Статус:', error.response.status);
      console.error('Данные:', JSON.stringify(error.response.data, null, 2));
      
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

// GET /api/product/:article
app.get('/api/product/:article', async (req, res) => {
  try {
    const { article } = req.params;
    
    // Проверяем кеш
    const cacheKey = getCacheKey('product', { article });
    const cached = getFromCache(cacheKey);
    if (cached) {
      return res.json(cached);
    }
    
    console.log('📦 Запрос товара:', article);
    
    const response = await axios.get(`${API_BASE_URL}/elements`, {
      params: {
        'access-token': ACCESS_TOKEN,
        article,
        additional_fields: 'description,brand,images,url'
      }
    });
    
    console.log('✅ Товар найден');
    
    // Сохраняем в кеш
    setCache(cacheKey, response.data);
    
    res.json(response.data);
    
  } catch (error) {
    console.error('❌ Ошибка товара:', error.message);
    res.status(error.response?.status || 500).json({
      error: error.message
    });
  }
});

// GET /api/categories
app.get('/api/categories', async (req, res) => {
  try {
    // Проверяем кеш
    const cacheKey = 'categories';
    const cached = getFromCache(cacheKey);
    if (cached) {
      return res.json(cached);
    }
    
    const response = await axios.get(`${API_BASE_URL}/category`, {
      params: { 'access-token': ACCESS_TOKEN }
    });
    
    // Сохраняем в кеш на 60 секунд (категории меняются редко)
    cache.set(cacheKey, { data: response.data, timestamp: Date.now() });
    
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

// Очистка старого кеша каждые 10 минут
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > 600000) { // 10 минут
      cache.delete(key);
    }
  }
  console.log(`🧹 Кеш очищен. Осталось: ${cache.size} записей`);
}, 600000);

// Запуск
app.listen(PORT, () => {
  console.log('');
  console.log('✨ Backend готов к работе!');
  console.log('⚡ Кеширование включено (5 сек)');
  console.log('');
});

export default app;