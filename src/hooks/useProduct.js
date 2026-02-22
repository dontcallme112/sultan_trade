import { useState, useEffect } from 'react';
import { productsAPI, productUtils } from '../api/services/product.js';

export const useProduct = (productArticle) => {
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!productArticle) {
      setLoading(false);
      return;
    }

    const fetchProduct = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const data = await productsAPI.getProductByArticle(productArticle);
        
        if (data) {
          setProduct(productUtils.mapProduct(data));
        } else {
          setProduct(null);
        }
      } catch (err) {
        setError(err.message || 'Failed to fetch product');
        console.error('Error fetching product:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchProduct();
  }, [productArticle]);

  return {
    product,
    loading,
    error,
  };
};