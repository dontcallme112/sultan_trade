import apiClient from '../client.js';

export const ordersAPI = {
  // Получить список заказов
  getOrders: async (params = {}) => {
    try {
      const {
        type = 'index', // index, current, archive, canceled
        page = 1,
        date_from = null,
        date_to = null,
      } = params;

      const queryParams = { type, page };
      if (date_from) queryParams.date_from = date_from;
      if (date_to) queryParams.date_to = date_to;

      const response = await apiClient.get('/orders', { params: queryParams });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Получить детали заказа
  getOrder: async (orderId) => {
    try {
      const response = await apiClient.get('/order', {
        params: { id: orderId }
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Выписать расходную накладную
  confirmOrder: async (orderData) => {
    try {
      const response = await apiClient.post('/order-confirm', orderData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Прикрепить файл к заказу
  uploadFile: async (orderId, file, index = null) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (index !== null) formData.append('index', index);

      const response = await apiClient.post('/orders-files', formData, {
        params: { order: orderId },
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Объединить заказы
  mergeOrders: async (fromId, toId, withoutDocs = false) => {
    try {
      const response = await apiClient.post('/orders-merge', {
        from_id: fromId,
        to_id: toId,
        without_docs: withoutDocs,
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Удалить позицию из заказа
  deleteOrderItem: async (orderId, article) => {
    try {
      const response = await apiClient.post('/order-item-delete', {
        id: orderId,
        article: Array.isArray(article) ? article.join(',') : article,
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Изменить количество в заказе
  updateOrderItem: async (orderId, article, quantity) => {
    try {
      const response = await apiClient.post('/order-item-update', {
        id: orderId,
        article: Array.isArray(article) ? article.join(',') : article,
        quantity: Array.isArray(quantity) ? quantity.join(',') : quantity,
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },
};

// Утилиты для работы с заказами
export const ordersUtils = {
  // Форматирование статуса заказа
  formatStatus: (status) => {
    const statuses = {
      'N': 'Ожидает оплаты',
      'P': 'Отгружен и ожидает оплаты',
      'SV': 'Готов к отгрузке',
      'OS': 'Отгружается самовывозом',
      'OK': 'Отгружается',
      'F': 'Отгружен и оплачен',
      'Un': 'Объединен',
      'R': 'Предварительный резерв',
      'DA': 'Отменен',
    };
    return statuses[status] || status;
  },

  // Цвет статуса
  getStatusColor: (status) => {
    const colors = {
      'N': '#fbbf24', // warning
      'P': '#fb923c', // orange
      'SV': '#60a5fa', // blue
      'OS': '#a78bfa', // purple
      'OK': '#34d399', // green
      'F': '#4ade80', // success
      'Un': '#94a3b8', // gray
      'R': '#f472b6', // pink
      'DA': '#f87171', // error
    };
    return colors[status] || '#94a3b8';
  },

  // Форматирование даты
  formatDate: (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  },

  // Подсчет общей суммы заказа
  calculateOrderTotal: (cart) => {
    if (!Array.isArray(cart)) return 0;
    return cart.reduce((total, item) => {
      return total + (item.price * item.quantity);
    }, 0);
  },
};