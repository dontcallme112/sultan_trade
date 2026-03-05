import apiClient from '../client.js';

// Проверяем режим работы
const USE_BACKEND = import.meta.env.VITE_USE_BACKEND === 'true';
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

console.log('Products service mode:', USE_BACKEND ? 'BACKEND' : 'DEMO');

// ========================================
// PRODUCTS
// ========================================

export const productsAPI = {
  // Получить список товаров
  getAll: async (params = {}) => {
    if (!USE_BACKEND) {
      // DEMO режим - возвращаем mock данные
      console.info('📦 Returning mock products');
      return {
        status: true,
        data: mockProducts.slice(0, params.limit || 10)
      };
    }

    try {
      // Backend режим
      const response = await fetch(`${BACKEND_URL}/api/products?${new URLSearchParams(params)}`);
      const data = await response.json();
      
      // Маппим данные
      if (data.status && data.data) {
        return {
          status: true,
          data: data.data.map(product => mapProduct(product))
        };
      }
      
      return data;
    } catch (error) {
      console.error('Products API Error:', error);
      // Fallback на mock данные при ошибке
      console.warn('⚠️ Falling back to mock data');
      return {
        status: true,
        data: mockProducts.slice(0, params.limit || 10)
      };
    }
  },

  // Получить товар по ID/артикулу
  getById: async (id) => {
    if (!USE_BACKEND) {
      const product = mockProducts.find(p => p.article == id);
      return {
        status: !!product,
        data: product || null
      };
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/product/${id}`);
      const data = await response.json();
      
      if (data.status && data.data) {
        return {
          status: true,
          data: mapProduct(data.data)
        };
      }
      
      return data;
    } catch (error) {
      console.error('Product API Error:', error);
      // Fallback
      const product = mockProducts.find(p => p.article == id);
      return {
        status: !!product,
        data: product || null
      };
    }
  },

  // Поиск товаров
  search: async (query, params = {}) => {
    if (!USE_BACKEND) {
      const filtered = mockProducts.filter(p => 
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.full_name.toLowerCase().includes(query.toLowerCase())
      );
      return {
        status: true,
        data: filtered.slice(0, params.limit || 10)
      };
    }

    try {
      const searchParams = new URLSearchParams({ 
        search: query,
        ...params 
      });
      const response = await fetch(`${BACKEND_URL}/api/products?${searchParams}`);
      const data = await response.json();
      
      if (data.status && data.data) {
        return {
          status: true,
          data: data.data.map(product => mapProduct(product))
        };
      }
      
      return data;
    } catch (error) {
      console.error('Search API Error:', error);
      return { status: false, data: [] };
    }
  },

  // Маппинг товара из al-style формата в наш формат
  mapProduct: (product) => mapProduct(product),
};

// ========================================
// CATEGORIES
// ========================================

export const categoriesAPI = {
  // Получить все категории
  getAll: async () => {
    if (!USE_BACKEND) {
      return {
        status: true,
        data: mockCategories
      };
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/categories`);
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Categories API Error:', error);
      return {
        status: true,
        data: mockCategories
      };
    }
  },
};

// ========================================
// BRANDS
// ========================================

export const brandsAPI = {
  // Получить все бренды
  getAll: async () => {
    if (!USE_BACKEND) {
      return {
        status: true,
        data: mockBrands
      };
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/brands`);
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Brands API Error:', error);
      return {
        status: true,
        data: mockBrands
      };
    }
  },
};

// ========================================
// HELPER FUNCTIONS
// ========================================

// Маппинг товара al-style → наш формат
function mapProduct(product) {
  return {
    id: product.article,
    article: product.article,
    article_pn: product.article_pn,
    title: product.name,
    fullName: product.full_name,
    description: product.description || product.full_name,
    category: product.category,
    price: product.price2 || product.price, // Розничная цена
    priceDealer: product.price1, // Дилерская
    image: product.images?.[0] || '/placeholder.png',
    images: product.images || [],
    quantity: product.quantity,
    isNew: product.isnew === 1,
    brand: product.brand,
    url: product.url,
    warranty: product.warranty,
    weight: product.weight,
    properties: product.properties,
    detailText: product.detailText,
    quantityMarkdown: product.quantityMarkdown,
    priceMarkdown: product.priceMarkdown,
  };
}

export default productsAPI;