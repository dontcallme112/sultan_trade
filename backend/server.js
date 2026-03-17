import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;
const TOKEN = process.env.ALSTYLE_ACCESS_TOKEN;

if (!TOKEN) {
  console.error('❌ Нет ALSTYLE_ACCESS_TOKEN');
  process.exit(1);
}

console.log('🔑 Token:', TOKEN.substring(0, 8) + '...');

// ===== CACHE =====
const cache = new Map();

function getCache(key, maxAge = 30000) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() - item.time > maxAge) {
    cache.delete(key);
    return null;
  }
  return item.data;
}

function setCache(key, data) {
  cache.set(key, { data, time: Date.now() });
}

// ===== RATE LIMIT =====
let lastCall = 0;
const MIN_DELAY = 6000;

async function waitRate() {
  const now = Date.now();
  const diff = now - lastCall;

  if (diff < MIN_DELAY) {
    const wait = MIN_DELAY - diff;
    console.log(`⏳ Ждем ${Math.round(wait / 1000)}с`);
    await new Promise(r => setTimeout(r, wait));
  }

  lastCall = Date.now();
}

// ===== AXIOS =====
const api = axios.create({
  baseURL: 'https://api.al-style.kz/api',
  timeout: 20000,
});

// ===== HELPERS =====
function normalizeProducts(data) {
  if (!data) return [];

  if (Array.isArray(data.elements)) return data.elements;
  if (Array.isArray(data.data?.elements)) return data.data.elements;
  if (Array.isArray(data.data)) return data.data;

  console.warn('⚠️ Неизвестный формат products:', data);
  return [];
}

function normalizeCategories(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.data)) return data.data;

  console.warn('⚠️ Неизвестный формат categories:', data);
  return [];
}

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// ===== PRODUCTS =====
app.get('/api/products', async (req, res) => {
  try {
    let cached = getCache('products');

    if (!cached) {
      console.log('📦 Загружаем товары...');

      await waitRate();

      const response = await api.get('/elements-pagination', {
        params: {
          access_token: TOKEN,
          limit: 100,
          offset: 0,
          additional_fields: 'brand,images'
        }
      });

      console.log('📡 RAW products:', JSON.stringify(response.data).slice(0, 300));

      cached = normalizeProducts(response.data);
      setCache('products', cached);
    } else {
      console.log('💾 Кеш товаров');
    }

    if (!Array.isArray(cached)) {
      throw new Error('products не массив');
    }

    let products = [...cached];

    // фильтры
    const { minPrice, maxPrice, brand, onlyNew, search } = req.query;

    if (brand) {
      products = products.filter(p => p.brand?.toLowerCase() === brand.toLowerCase());
    }

    if (minPrice || maxPrice) {
      products = products.filter(p => {
        const price = p.price2 || p.price1 || 0;
        return (!minPrice || price >= Number(minPrice)) &&
               (!maxPrice || price <= Number(maxPrice));
      });
    }

    if (onlyNew === 'true') {
      products = products.filter(p => p.isnew === 1);
    }

    if (search) {
      const s = search.toLowerCase();
      products = products.filter(p =>
        p.name?.toLowerCase().includes(s) ||
        p.full_name?.toLowerCase().includes(s)
      );
    }

    const limit = Number(req.query.limit) || 12;
    const offset = Number(req.query.offset) || 0;

    const paginated = products.slice(offset, offset + limit);

    res.json({
      elements: paginated,
      pagination: {
        total: products.length,
        hasMore: offset + limit < products.length
      }
    });

  } catch (err) {
    console.error('❌ PRODUCTS ERROR:', err.response?.data || err.message);

    if (err.response?.status === 403) {
      return res.status(403).json({
        error: 'API доступ запрещён (403)',
        details: err.response.data
      });
    }

    res.status(500).json({
      error: 'Ошибка сервера',
      details: err.message
    });
  }
});

// ===== CATEGORIES =====
app.get('/api/categories', async (req, res) => {
  try {
    let cached = getCache('categories', 300000);

    if (!cached) {
      console.log('📦 Загружаем категории...');

      await waitRate();

      const response = await api.get('/categories', {
        params: { access_token: TOKEN }
      });

      console.log('📡 RAW categories:', response.data);

      cached = normalizeCategories(response.data);
      setCache('categories', cached);
    }

    res.json(cached);

  } catch (err) {
    console.error('❌ CATEGORIES ERROR:', err.response?.data || err.message);

    if (err.response?.status === 403) {
      return res.status(403).json({
        error: 'API доступ запрещён (403)',
        details: err.response.data
      });
    }

    res.status(500).json({ error: err.message });
  }
});

// ===== HEALTH =====
app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on ${PORT}`);
});