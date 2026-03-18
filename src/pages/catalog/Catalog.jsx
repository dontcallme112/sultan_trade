import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import ProductCard from '../../components/features/ProductCard/ProductCard';
import CategorySidebar from '../../components/features/Categorysidebar/Categorysidebar';
import { BACKEND_URL } from '../../api/client';
import './Catalog.css';

export default function Catalog() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const LIMIT = 12;

  // activeCategory — groupId для подсветки в сайдбаре (например 'tv_monitors')
  // activeCategoryIds — реальные числовые ID для запроса (например ['3510', '3786'])
  const [activeCategory, setActiveCategory] = useState(
    searchParams.get('category') || null
  );
  const [activeCategoryIds, setActiveCategoryIds] = useState([]);

  const searchQuery = searchParams.get('search') || null;
  const sortBy = searchParams.get('sortBy') || 'default';

  useEffect(() => {
    loadProducts(true);
  }, [activeCategoryIds, searchQuery, sortBy]);

  const loadProducts = async (reset = false) => {
    try {
      setLoading(true);
      setError(null);

      const currentOffset = reset ? 0 : offset;

      // Строим params вручную — категории передаём как ?category=3&category=7
      const params = new URLSearchParams();
      params.set('limit', LIMIT);
      params.set('offset', currentOffset);

      // Передаём реальные числовые ID категорий
      activeCategoryIds.forEach(id => params.append('category', id));

      if (searchQuery) params.append('search', searchQuery);
      if (sortBy && sortBy !== 'default') params.append('sortBy', sortBy);

      console.log('🔍 Loading products:', params.toString());

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

      setTotalCount(data.pagination?.totalCount || data.pagination?.total || 0);
      setHasMore(data.pagination?.hasMore || false);

    } catch (err) {
      console.error('❌ Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // CategorySidebar передаёт (groupId, realCategoryIds[])
  const handleCategoryChange = (groupId, categoryIds) => {
    setActiveCategory(groupId);
    setActiveCategoryIds(categoryIds || []);
    setOffset(0);

    // Сохраняем groupId в URL только для отображения
    const params = new URLSearchParams();
    if (groupId) params.set('category', groupId);
    if (searchQuery) params.set('search', searchQuery);
    if (sortBy && sortBy !== 'default') params.set('sortBy', sortBy);
    setSearchParams(params);
  };

  const handleSortChange = (e) => {
    const newSort = e.target.value;
    const params = new URLSearchParams();
    if (activeCategory) params.set('category', activeCategory);
    if (searchQuery) params.set('search', searchQuery);
    if (newSort && newSort !== 'default') params.set('sortBy', newSort);
    setSearchParams(params);
  };

  const handleLoadMore = () => {
    loadProducts(false);
  };

  const handleClearFilters = () => {
    setActiveCategory(null);
    setActiveCategoryIds([]);
    setOffset(0);
    setSearchParams(new URLSearchParams());
  };

  if (loading && products.length === 0) {
    return (
      <div className="catalog-page">
        <div className="container">
          <div className="catalog-loading">
            <div className="loader"></div>
            <p>Загрузка товаров...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="catalog-page">
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
    <div className="catalog-page">
      <div className="container">
        {/* Header */}
        <div className="catalog-header">
          <div>
            <h1 className="catalog-title">Каталог товаров</h1>
            <p className="catalog-subtitle">
              {totalCount > 0 ? `Найдено товаров: ${totalCount}` : 'Товары не найдены'}
            </p>
          </div>

          {/* Сортировка */}
          <div className="catalog-sort">
            <label htmlFor="sort">Сортировка:</label>
            <select
              id="sort"
              value={sortBy}
              onChange={handleSortChange}
              className="sort-select"
            >
              <option value="default">По умолчанию</option>
              <option value="price_asc">Цена: по возрастанию</option>
              <option value="price_desc">Цена: по убыванию</option>
              <option value="name_asc">По названию (А-Я)</option>
              <option value="newest">Сначала новинки</option>
            </select>
          </div>
        </div>

        {/* Active Filters */}
        {(activeCategory || searchQuery) && (
          <div className="active-filters">
            {searchQuery && (
              <div className="filter-tag">
                <span>Поиск: "{searchQuery}"</span>
                <button onClick={handleClearFilters}>×</button>
              </div>
            )}
            <button className="clear-all-btn" onClick={handleClearFilters}>
              Сбросить все
            </button>
          </div>
        )}

        {/* Main Content */}
        <div className="catalog-content">
          <aside className="catalog-sidebar">
            <CategorySidebar
              onCategoryChange={handleCategoryChange}
              activeCategory={activeCategory}
            />
          </aside>

          <div className="catalog-main">
            {products.length === 0 ? (
              <div className="catalog-empty">
                <div className="empty-icon">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="11" cy="11" r="8"/>
                    <path d="m21 21-4.35-4.35"/>
                  </svg>
                </div>
                <h2>Товары не найдены</h2>
                <p>Попробуйте выбрать другую категорию или изменить поисковый запрос</p>
                <button className="btn btn-primary" onClick={handleClearFilters}>
                  Показать все товары
                </button>
              </div>
            ) : (
              <>
                <div className="products-grid">
                  {products.map((product) => (
                    <ProductCard key={product.article} product={product} />
                  ))}
                </div>

                {hasMore && (
                  <div className="load-more-container">
                    <button
                      className="btn btn-secondary load-more-btn"
                      onClick={handleLoadMore}
                      disabled={loading}
                    >
                      {loading ? (
                        <><span className="btn-loader"></span>Загрузка...</>
                      ) : (
                        `Показать ещё (${products.length} из ${totalCount})`
                      )}
                    </button>
                  </div>
                )}

                {!hasMore && products.length > 0 && (
                  <div className="end-of-list">
                    <p>Показаны все товары ({totalCount})</p>
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