import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import ProductCard from '../../components/features/ProductCard/ProductCard';
import CategorySidebar from '../../components/features/Categorysidebar/Categorysidebar';
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

  // Дата 3 месяца назад
  const getThreeMonthsAgo = () => {
    const date = new Date();
    date.setMonth(date.getMonth() - 3);
    return date.toISOString().split('T')[0]; // формат YYYY-MM-DD
  };

  const [activeCategory, setActiveCategory] = useState(
    searchParams.get('category') || null
  );

  useEffect(() => {
    loadProducts(true);
  }, [activeCategory]);

  const loadProducts = async (reset = false) => {
    try {
      setLoading(true);
      setError(null);

      const currentOffset = reset ? 0 : offset;
      const params = new URLSearchParams({
        limit: LIMIT,
        offset: currentOffset,
        onlyNew: 'true',
        dateFrom: getThreeMonthsAgo(), // ← фильтр по дате: последние 3 месяца
      });

      if (activeCategory) params.append('category', activeCategory);

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

  const handleCategoryChange = (categoryId) => {
    setActiveCategory(categoryId);
    setOffset(0);

    // Обновляем URL
    const params = new URLSearchParams();
    if (categoryId) params.set('category', categoryId);
    setSearchParams(params);
  };

  const handleLoadMore = () => {
    loadProducts(false);
  };

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
                {totalCount > 0
                  ? `Найдено новинок за последние 3 месяца: ${totalCount}`
                  : 'Новинки не найдены'}
              </p>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="catalog-content">
          {/* Sidebar with Categories */}
          <aside className="catalog-sidebar">
            <CategorySidebar
              onCategoryChange={handleCategoryChange}
              activeCategory={activeCategory}
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
                <p>Попробуйте выбрать другую категорию</p>
                <button
                  className="btn btn-primary"
                  onClick={() => handleCategoryChange(null)}
                >
                  Показать все новинки
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