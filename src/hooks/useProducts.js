import { useState, useEffect } from 'react';
import { productsAPI } from '../api/services/product.js';

export const useProducts = (options = {}) => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const { category, limit = 12, offset = 0, brand } = options;

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await productsAPI.getAll({
          category,
          limit,
          offset,
          brand,
        });

        if (response && response.data) {
          setProducts(response.data);
        } else {
          setProducts([]);
        }
      } catch (err) {
        setError(err.message || 'Failed to fetch products');
        console.error('Error fetching products:', err);
        setProducts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [category, limit, offset, brand]);

  return { products, loading, error };
};

export default useProducts;