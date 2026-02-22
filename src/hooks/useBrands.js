import { useState, useEffect } from 'react';
import { productsAPI } from '../api/services/products';

export const useBrands = () => {
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchBrands = async () => {
      try {
        setLoading(true);
        setError(null);

        const data = await productsAPI.getBrands();
        setBrands(data || []);
      } catch (err) {
        setError(err.message || 'Failed to fetch brands');
        console.error('Error fetching brands:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchBrands();
  }, []);

  return {
    brands,
    loading,
    error,
  };
};