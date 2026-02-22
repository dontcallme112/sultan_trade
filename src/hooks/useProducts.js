import { useState, useEffect } from 'react';
import { productsAPI, productUtils } from '../api/services/product.js';

export const useProducts = (options = {}) => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState(null);

  const {
    category = null,
    limit = 100,
    offset = 0,
    brand = null,
    exclude_missing = true,
  } = options;

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await productsAPI.getProducts({
          category,
          limit,
          offset,
          brand,
          exclude_missing,
        });

        // Маппим товары в формат приложения
        const mappedProducts = (response.elements || []).map(product => 
          productUtils.mapProduct(product)
        );

        setProducts(mappedProducts);
        setPagination(response.pagination || null);
      } catch (err) {
        setError(err.message || 'Failed to fetch products');
        console.error('Error fetching products:', err);
      } finally { 
        setLoading(false);
      }
    };

    fetchProducts();
  }, [category, limit, offset, brand, exclude_missing]);

  const refetch = async () => {
    setLoading(true);
    try {
      const response = await productsAPI.getProducts({
        category,
        limit,
        offset,
        brand,
        exclude_missing,
      });

      const mappedProducts = (response.elements || []).map(product => 
        productUtils.mapProduct(product)
      );

      setProducts(mappedProducts);
      setPagination(response.pagination || null);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return {
    products,
    loading,
    error,
    pagination,
    refetch,
  };
};