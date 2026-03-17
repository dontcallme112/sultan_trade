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

// Простой кеш в памяти
const cache = new Map();
const CACHE_TIME = 30000; // 30 секунд

function getCache(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() - item.timestamp > CACHE_TIME) {
    cache.delete(key);
    return null;
  }
  return item.data;
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
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
      callback(null, true); // Разрешаем всё для упрощения
    }
  },
  credentials: true
}));

app.use(express.json());

// API клиент
const api = axios.create({
  baseURL: 'https://api.al-style.kz/api',
  timeout: 10000
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

// PRODUCTS
app.get('/api/products', async (req, res) => {
  try {
    const { limit = 12, offset = 0, minPrice, maxPrice, brand, onlyNew, search, sortBy, category } = req.query;

    let cached = getCache('products');
    
    if (!cached) {
      console.log('📦 Загрузка товаров из API...');
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
    }

    let products = cached.elements || [];

    // Фильтрация
    if (category) {
      products = products.filter(p => p.category && p.category.toString() === category.toString());
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
      products = products.filter(p => p.brand?.toLowerCase() === brand.toLowerCase());
    }

    if (onlyNew === 'true') {
      products = products.filter(p => p.isnew === 1);
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
    if (sortBy === 'price_asc') {
      products.sort((a, b) => (a.price2 || a.price1 || 0) - (b.price2 || b.price1 || 0));
    } else if (sortBy === 'price_desc') {
      products.sort((a, b) => (b.price2 || b.price1 || 0) - (a.price2 || a.price1 || 0));
    } else if (sortBy === 'name_asc') {
      products.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else if (sortBy === 'newest') {
      products.sort((a, b) => (b.isnew || 0) - (a.isnew || 0));
    }

    // Пагинация
    const start = Number(offset);
    const end = start + Number(limit);
    const paginated = products.slice(start, end);

    res.json({
      elements: paginated,
      pagination: {
        total: products.length,
        offset: start,
        limit: Number(limit),
        hasMore: end < products.length
      }
    });

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    res.status(500).json({ 
      error: 'Ошибка загрузки товаров',
      elements: [],
      pagination: { total: 0, offset: 0, limit: 12, hasMore: false }
    });
  }
});

// SINGLE PRODUCT
app.get('/api/product/:article', async (req, res) => {
  try {
    const { article } = req.params;
    const key = `product_${article}`;
    
    let product = getCache(key);
    
    if (!product) {
      const response = await api.get('/element-info', {
        params: {
          access_token: ALSTYLE_TOKEN,
          article: article
        }
      });
      product = response.data;
      setCache(key, product);
    }

    res.json(product);

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    res.status(500).json({ error: 'Ошибка загрузки товара' });
  }
});

// CATEGORIES
app.get('/api/categories', async (req, res) => {
  try {
    let categories = getCache('categories');

    if (!categories) {
      const response = await api.get('/categories', {
        params: { access_token: ALSTYLE_TOKEN }
      });
      categories = response.data;
      setCache('categories', categories);
    }

    res.json(categories);

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    res.status(500).json({ error: 'Ошибка загрузки категорий' });
  }
});

// FILTERS
app.get('/api/filters', async (req, res) => {
  try {
    let filters = getCache('filters');
    
    if (!filters) {
      let brands = [];
      
      // Пробуем получить бренды
      try {
        const response = await api.get('/brands', {
          params: { access_token: ALSTYLE_TOKEN }
        });
        brands = response.data
          .filter(b => b.name && b.name.trim())
          .map(b => b.name)
          .sort();
      } catch (e) {
        console.log('⚠️  Используем бренды из товаров');
        const products = getCache('products');
        if (products?.elements) {
          const set = new Set();
          products.elements.forEach(p => {
            if (p.brand && p.brand.trim()) set.add(p.brand);
          });
          brands = Array.from(set).sort();
        }
      }

      // Диапазон цен
      let priceRange = { min: 0, max: 1000000 };
      const products = getCache('products');
      if (products?.elements) {
        const prices = products.elements
          .map(p => p.price2 || p.price1 || p.price || 0)
          .filter(p => p > 0);
        if (prices.length > 0) {
          priceRange.min = Math.min(...prices);
          priceRange.max = Math.max(...prices);
        }
      }

      filters = { brands: brands.slice(0, 50), priceRange };
      setCache('filters', filters);
    }

    res.json(filters);

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    res.json({ brands: [], priceRange: { min: 0, max: 1000000 } });
  }
});

// SEARCH
app.get('/api/search', async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.length < 2) {
      return res.json([]);
    }

    const products = getCache('products');
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
    console.error('❌ Ошибка:', error.message);
    res.json([]);
  }
});

// Запуск
app.listen(PORT, () => {
  console.log('\n🚀 LUXE Backend Server');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📡 Server: http://localhost:${PORT}`);
  console.log('✅ Только товары в наличии');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✨ Готово!\n');
});