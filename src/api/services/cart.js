import axios from 'axios';

const CART_API_BASE = 'https://api.al-style.kz/cart-api';
const ACCESS_TOKEN = import.meta.env.VITE_ALSTYLE_ACCESS_TOKEN || '';

// Создаем отдельный instance для cart API
const cartClient = axios.create({
  baseURL: CART_API_BASE,
  timeout: 10000,
});

// Добавляем access-token к каждому запросу
cartClient.interceptors.request.use(
  (config) => {
    if (!config.params) {
      config.params = {};
    }
    config.params['access-token'] = ACCESS_TOKEN;
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export const cartAPI = {
  // Добавить товары в корзину
  add: async (articles, quantities = null) => {
    try {
      const params = {
        add: Array.isArray(articles) ? articles.join(',') : articles,
      };
      
      if (quantities) {
        params.quantity = Array.isArray(quantities) 
          ? quantities.join(',') 
          : quantities;
      }

      const response = await cartClient.get('/add', { params });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Удалить товар из корзины
  remove: async (article) => {
    try {
      const response = await cartClient.get('/remove', {
        params: { item: article }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Получить состав корзины
  get: async () => {
    try {
      const response = await cartClient.get('/get');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Очистить корзину
  clear: async () => {
    try {
      const response = await cartClient.get('/clear');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Создать заказ
  submit: async (orderData) => {
    try {
      const response = await cartClient.post('/submit', orderData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Отменить заказ
  cancel: async (orderId) => {
    try {
      const response = await cartClient.get('/cancel', {
        params: { order: orderId }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },
};

// Утилиты для работы с корзиной
export const cartUtils = {
  // Подсчет общей суммы корзины
  calculateTotal: (cartData) => {
    if (!cartData || !cartData.data) return 0;
    
    return Object.values(cartData.data).reduce((total, item) => {
      return total + (item.total || 0);
    }, 0);
  },

  // Подсчет общего количества товаров
  calculateItemCount: (cartData) => {
    if (!cartData || !cartData.data) return 0;
    
    return Object.values(cartData.data).reduce((count, item) => {
      return count + (item.quantity || 0);
    }, 0);
  },

  // Подсчет общего веса
  calculateTotalWeight: (cartData) => {
    if (!cartData || !cartData.data) return 0;
    
    return Object.values(cartData.data).reduce((weight, item) => {
      return weight + ((item.weight || 0) * (item.quantity || 1));
    }, 0);
  },

  // Подсчет общего объема
  calculateTotalVolume: (cartData) => {
    if (!cartData || !cartData.data) return 0;
    
    return Object.values(cartData.data).reduce((volume, item) => {
      return volume + ((item.volume || 0) * (item.quantity || 1));
    }, 0);
  },

  // Форматирование данных корзины для отображения
  formatCartItems: (cartData) => {
    if (!cartData || !cartData.data) return [];
    
    return Object.values(cartData.data).map(item => ({
      id: item.article,
      article: item.article,
      itemId: item.item_id,
      title: item.label,
      fullTitle: item.full_title,
      price: item.price,
      price2: item.price2,
      quantity: item.quantity,
      total: item.total,
      balance: item.balance,
      url: item.url,
      weight: item.weight,
      volume: item.volume,
      inPackage: item.in_package,
      isMarkdown: item.is_markdown,
      multiplicity: item.multiplicity,
    }));
  },
};