import apiClient from '../client';

export const productsAPI = {
  // Получить актуальность данных
  getDate: async () => {
    try {
      const response = await apiClient.get('/date');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Получить все категории
  getCategories: async (parentId = null) => {
    try {
      const params = parentId ? { id: parentId } : {};
      const response = await apiClient.get('/categories', { params });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Получить список брендов
  getBrands: async () => {
    try {
      const response = await apiClient.get('/brands');
      return response.data?.data || [];
    } catch (error) {
      throw error;
    }
  },

  // Получить список товаров с пагинацией
  getProducts: async (params = {}) => {
    try {
      const {
        category = null,
        limit = 100,
        offset = 0,
        exclude_missing = true,
        brand = null,
        additional_fields = 'description,brand,images,url,warranty'
      } = params;

      const queryParams = {
        limit,
        offset,
        exclude_missing,
        additional_fields
      };

      if (category) queryParams.category = category;
      if (brand) queryParams.brand = brand;

      const response = await apiClient.get('/elements-pagination', { 
        params: queryParams 
      });
      
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Получить товар по артикулу
  getProductByArticle: async (article, additionalFields = 'description,brand,images,url,warranty,detailText,properties') => {
    try {
      const response = await apiClient.get('/element-info', {
        params: {
          article,
          additional_fields: additionalFields
        }
      });
      return response.data?.[0] || null;
    } catch (error) {
      throw error;
    }
  },

  // Получить изображения товара
  getProductImages: async (article, withThumbs = true) => {
    try {
      const response = await apiClient.get('/images', {
        params: {
          article,
          thumbs: withThumbs ? 1 : 0
        }
      });
      return response.data || [];
    } catch (error) {
      throw error;
    }
  },

  // Получить остатки товаров
  getQuantity: async (articles = null) => {
    try {
      const params = articles ? { article: articles } : {};
      const response = await apiClient.get('/quantity', { params });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Получить остатки и цены
  getQuantityPrice: async (params = {}) => {
    try {
      const {
        exclude_missing = true,
        brand = null,
        article = null
      } = params;

      const queryParams = { exclude_missing };
      if (brand) queryParams.brand = brand;
      if (article) queryParams.article = article;

      const response = await apiClient.get('/quantity-price', { 
        params: queryParams 
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Получить свойства товаров
  getProperties: async (params = {}) => {
    try {
      const { article = null, category = null } = params;
      const queryParams = {};
      
      if (article) queryParams.article = article;
      if (category) queryParams.category = category;

      const response = await apiClient.get('/properties', { 
        params: queryParams 
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Поиск товаров по названию
  searchByName: async (name, additionalFields = 'description,brand,images,url') => {
    try {
      const response = await apiClient.get('/element-info', {
        params: {
          name,
          additional_fields: additionalFields
        }
      });
      return response.data || [];
    } catch (error) {
      throw error;
    }
  },
};

// Утилиты для работы с данными товаров
export const productUtils = {
  // Форматирование цены в тенге
  formatPrice: (price) => {
    if (price === 1) return 'Цена по запросу';
    return `${parseInt(price).toLocaleString('ru-RU')} ₸`;
  },

  // Форматирование остатка
  formatQuantity: (quantity) => {
    if (typeof quantity === 'string') {
      if (quantity.startsWith('>')) {
        return `Более ${quantity.substring(1)} шт.`;
      }
      return quantity;
    }
    if (quantity === 0) return 'Нет в наличии';
    if (quantity > 50) return 'Много';
    return `${quantity} шт.`;
  },

  // Проверка наличия товара
  isInStock: (quantity) => {
    if (typeof quantity === 'string') {
      return quantity !== '0';
    }
    return quantity > 0;
  },

  // Фильтрация товаров
  filterProducts: (products, filters) => {
    let filtered = [...products];

    if (filters.category) {
      filtered = filtered.filter(p => p.category === filters.category);
    }

    if (filters.minPrice !== undefined && filters.minPrice !== '') {
      filtered = filtered.filter(p => p.price2 >= filters.minPrice);
    }

    if (filters.maxPrice !== undefined && filters.maxPrice !== '') {
      filtered = filtered.filter(p => p.price2 <= filters.maxPrice);
    }

    if (filters.brand) {
      filtered = filtered.filter(p => p.brand?.id === filters.brand);
    }

    if (filters.inStockOnly) {
      filtered = filtered.filter(p => productUtils.isInStock(p.quantity));
    }

    return filtered;
  },

  // Сортировка товаров
  sortProducts: (products, sortBy) => {
    const sorted = [...products];

    switch (sortBy) {
      case 'price-asc':
        return sorted.sort((a, b) => (a.price2 || 0) - (b.price2 || 0));
      case 'price-desc':
        return sorted.sort((a, b) => (b.price2 || 0) - (a.price2 || 0));
      case 'name':
        return sorted.sort((a, b) => a.name.localeCompare(b.name));
      case 'new':
        return sorted.sort((a, b) => (b.isnew || 0) - (a.isnew || 0));
      default:
        return sorted;
    }
  },

  // Маппинг товара al-style в формат приложения
  mapProduct: (product) => {
    return {
      id: product.article,
      article: product.article,
      article_pn: product.article_pn,
      title: product.name,
      fullName: product.full_name,
      description: product.description || product.full_name,
      category: product.category,
      price: product.price2, // розничная цена
      priceDealer: product.price1, // дилерская цена
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
  },
};