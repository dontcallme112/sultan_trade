import { BACKEND_URL } from '../client.js';

export const productsAPI = {
  getAll: async (params = {}) => {
    try {
      // Убираем null значения
      const cleanParams = {};
      Object.keys(params).forEach(key => {
        const value = params[key];
        if (value !== null && value !== undefined && value !== 'null' && value !== '') {
          cleanParams[key] = value;
        }
      });

      const queryString = new URLSearchParams(cleanParams).toString();
      const url = `${BACKEND_URL}/api/products${queryString ? '?' + queryString : ''}`;
      
      console.log('Fetching:', url);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        console.error('Response not OK:', response.status);
        return { status: false, data: [] };
      }
      
      const data = await response.json();
      
      console.log('Raw API response:', data);
      
      // Al-style API возвращает { elements: [...] }
      // Преобразуем в { data: [...] }
      const products = data.elements || data.data || [];
      
      console.log('Parsed products:', products.length);
      
      // Маппим каждый товар в наш формат
      const mappedProducts = products.map(product => ({
        id: product.article,
        article: product.article,
        title: product.name,
        fullName: product.full_name || product.name,
        description: product.description || product.full_name,
        category: product.category,
        price: product.price2 || product.price,
        priceDealer: product.price1,
        image: product.images?.[0] || product.image || '/placeholder.png',
        images: product.images || [],
        quantity: product.quantity,
        brand: product.brand,
        isNew: product.isnew === 1,
        rating: { rate: 4.5, count: 100 } // Добавляем фейковый рейтинг
      }));
      
      console.log('Mapped products:', mappedProducts.length);
      
      return {
        status: true,
        data: mappedProducts
      };
    } catch (error) {
      console.error('Products Error:', error);
      return { status: false, data: [] };
    }
  },

  getById: async (id) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/product/${id}`);
      
      if (!response.ok) {
        return { status: false, data: null };
      }
      
      const data = await response.json();
      const product = data.elements?.[0] || data;
      
      if (!product) {
        return { status: false, data: null };
      }
      
      // Маппим товар
      return {
        status: true,
        data: {
          id: product.article,
          article: product.article,
          title: product.name,
          fullName: product.full_name || product.name,
          description: product.description || product.full_name,
          category: product.category,
          price: product.price2 || product.price,
          priceDealer: product.price1,
          image: product.images?.[0] || '/placeholder.png',
          images: product.images || [],
          quantity: product.quantity,
          brand: product.brand,
          isNew: product.isnew === 1,
          rating: { rate: 4.5, count: 100 }
        }
      };
    } catch (error) {
      console.error('Product Error:', error);
      return { status: false, data: null };
    }
  },
};

export default productsAPI;