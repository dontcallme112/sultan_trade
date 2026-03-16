import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import ProductCard from '../../components/features/ProductCard/ProductCard';
import Filters from '../../components/features/Filters/Filters';
import { BACKEND_URL } from '../../api/client';
import './NewProducts.css';

export default function NewProducts() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const LIMIT = 12;

  // Фильтры (без onlyNew - он всегда true)
  const [filters, setFilters] = useState({
    brand: searchParams.get('brand') || null,
    minPrice: searchParams.get('minPrice') ? Number(searchParams.get('minPrice')) : null,
    maxPrice: searchParams.get('maxPrice') ? Number(searchParams.get('maxPrice')) : null,
    sortBy: searchParams.get('sortBy') || 'newest',
    search: searchParams.get('search') || null,
    onlyNew: true // ← Всегда включен!
  });

  useEffect(() => {
    loadProducts(true);
  }, [filters]);

  const loadProducts = async (reset = false) => {
    try {
      setLoading(true);
      setError(null);

      const currentOffset = reset ? 0 : offset;
      const params = new URLSearchParams({
        limit: LIMIT,
        offset: currentOffset,
        onlyNew: 'true' // ← Обязательный параметр
      });

      if (filters.brand) params.append('brand', filters.brand);
      if (filters.minPrice) params.append('minPrice', filters.minPrice);
      if (filters.maxPrice) params.append('maxPrice', filters.maxPrice);
      if (filters.sortBy && filters.sortBy !== 'default') params.append('sortBy', filters.sortBy);
      if (filters.search) params.append('search', filters.search);

      console.log('🆕 Loading new products:', params.toString());

      const response = await fetch(`${BACKEND_URL}/api/products?${params}`);
      const data = await response.json();

      console.log('📦 Received:', data);

      if (reset) {
        setProducts(data.elements || []);
        setOffset(LIMIT);
      } else {
        setProducts(prev => [...prev, ...(data.elements || [])]);
        setOffset(prev => prev + LIMIT);
      }

      setTotalCount(data.pagination?.totalCount || 0);
      setHasMore(data.pagination?.hasMore || false);

    } catch (err) {
      console.error('❌ Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (newFilters) => {
    // Всегда включаем onlyNew
    const filtersWithNew = { ...newFilters, onlyNew: true };
    setFilters(filtersWithNew);

    // Обновляем URL
    const params = new URLSearchParams();
    if (newFilters.brand) params.set('brand', newFilters.brand);
    if (newFilters.minPrice) params.set('minPrice', newFilters.minPrice);
    if (newFilters.maxPrice) params.set('maxPrice', newFilters.maxPrice);
    if (newFilters.sortBy && newFilters.sortBy !== 'default') params.set('sortBy', newFilters.sortBy);
    if (newFilters.search) params.set('search', newFilters.search);

    setSearchParams(params);
    setOffset(0);
  };

  const handleLoadMore = () => {
    loadProducts(false);
  };

  const handleRemoveFilter = (filterKey) => {
    const newFilters = { ...filters };
    if (filterKey === 'price') {
      newFilters.minPrice = null;
      newFilters.maxPrice = null;
    } else if (filterKey !== 'onlyNew') { // Не удаляем onlyNew
      newFilters[filterKey] = null;
    }
    handleFilterChange(newFilters);
  };

  // Активные фильтры (без onlyNew - он всегда активен)
  const activeFilterTags = [];
  if (filters.brand) activeFilterTags.push({ key: 'brand', label: filters.brand });
  if (filters.minPrice || filters.maxPrice) {
    const priceLabel = `${filters.minPrice || 0} ₸ - ${filters.maxPrice || '∞'} ₸`;
    activeFilterTags.push({ key: 'price', label: priceLabel });
  }
  if (filters.search) activeFilterTags.push({ key: 'search', label: `Поиск: "${filters.search}"` });

  if (loading && products.length === 0) {
    return (
      <div className="new-products-page">
        <div className="container">
          <div className="catalog-loading">
            <div className="loader"></div>
            <p>Загрузка новинок...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="new-products-page">
        <div className="container">
          <div className="catalog-error">
            <div className="error-icon">⚠️</div>
            <h3>Ошибка загрузки</h3>
            <p>{error}</p>
            <button className="btn btn-primary" onClick={() => loadProducts(true)}>
              Попробовать снова
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="new-products-page">
      <div className="container">
        {/* Header */}
        <div className="new-products-header">
          <div className="header-content">
            <div className="new-badge-large">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
              NEW
            </div>
            <div>
              <h1 className="new-products-title">Новинки</h1>
              <p className="new-products-subtitle">
                {totalCount > 0 ? `Найдено новинок: ${totalCount}` : 'Новинки не найдены'}
              </p>
            </div>
          </div>
        </div>

        {/* Active Filters */}
        {activeFilterTags.length > 0 && (
          <div className="active-filters">
            {activeFilterTags.map((tag) => (
              <div key={tag.key} className="filter-tag">
                <span>{tag.label}</span>
                <button onClick={() => handleRemoveFilter(tag.key)}>×</button>
              </div>
            ))}
          </div>
        )}

        {/* Main Content */}
        <div className="catalog-content">
          {/* Sidebar with Filters */}
          <aside className="catalog-sidebar">
            <Filters 
              onFilterChange={handleFilterChange}
              activeFilters={filters}
              hideOnlyNew={true} // ← Скрываем чекбокс "Только новинки"
            />
          </aside>

          {/* Products Grid */}
          <div className="catalog-main">
            {products.length === 0 ? (
              <div className="catalog-empty">
                <div className="empty-icon">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                </div>
                <h2>Новинки не найдены</h2>
                <p>Попробуйте изменить параметры поиска или фильтры</p>
                <button 
                  className="btn btn-primary"
                  onClick={() => handleFilterChange({
                    brand: null,
                    minPrice: null,
                    maxPrice: null,
                    sortBy: 'newest',
                    search: null,
                    onlyNew: true
                  })}
                >
                  Сбросить фильтры
                </button>
              </div>
            ) : (
              <>
                <div className="products-grid">
                  {products.map((product) => (
                    <ProductCard key={product.article} product={product} />
                  ))}
                </div>

                {/* Load More */}
                {hasMore && (
                  <div className="load-more-container">
                    <button 
                      className="btn btn-secondary load-more-btn"
                      onClick={handleLoadMore}
                      disabled={loading}
                    >
                      {loading ? (
                        <>
                          <span className="btn-loader"></span>
                          Загрузка...
                        </>
                      ) : (
                        `Показать ещё (${products.length} из ${totalCount})`
                      )}
                    </button>
                  </div>
                )}

                {/* End of List */}
                {!hasMore && products.length > 0 && (
                  <div className="end-of-list">
                    <p>Показаны все новинки ({totalCount})</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}