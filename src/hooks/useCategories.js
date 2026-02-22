import { useState, useEffect } from 'react';
import { productsAPI } from '../api/services/products';

export const useCategories = (parentId = null) => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setLoading(true);
        setError(null);

        const data = await productsAPI.getCategories(parentId);
        setCategories(data || []);
      } catch (err) {
        setError(err.message || 'Failed to fetch categories');
        console.error('Error fetching categories:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchCategories();
  }, [parentId]);

  return {
    categories,
    loading,
    error,
  };
};