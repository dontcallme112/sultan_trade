import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import ProductCard from '../../components/features/ProductCard/ProductCard';
import CategorySidebar from '../../components/features/Categorysidebar/Categorysidebar';
import { BACKEND_URL } from '../../api/client';
import './Catalog.css';
import ProductCardSkeleton from '../../components/features/ProductCard/ProductCardSkeleton';

export default function Catalog() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  // ── Bottom sheet состояние ──
  const [filtersOpen, setFiltersOpen] = useState(false);

  const LIMIT = 12;

  const [activeCategory, setActiveCategory] = useState(
    searchParams.get('group') || null
  );
  const [activeCategoryIds, setActiveCategoryIds] = useState(
    searchParams.getAll('category') || []
  );

  const searchQuery = searchParams.get('search') || null;
  const sortBy = searchParams.get('sortBy') || 'default';

  useEffect(() => {
    setOffset(0);
    loadProducts(true);
  }, [activeCategoryIds, searchQuery, sortBy]);

  useEffect(() => {
    const groupFromUrl = searchParams.get('group') || null;
    const idsFromUrl = searchParams.getAll('category') || [];
    setActiveCategory(groupFromUrl);
    setActiveCategoryIds(idsFromUrl);
  }, [searchParams]);

  // Закрываем sheet при скролле на мобилке
  useEffect(() => {
    if (filtersOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [filtersOpen]);

  const loadProducts = async (reset = false) => {
    try {
      setLoading(true);
      setError(null);

      const currentOffset = reset ? 0 : offset;
      const params = new URLSearchParams();
      params.set('limit', LIMIT);
      params.set('offset', currentOffset);
      activeCategoryIds.forEach(id => params.append('category', id));
      if (searchQuery) params.append('search', searchQuery);
      if (sortBy && sortBy !== 'default') params.append('sortBy', sortBy);

      const response = await fetch(`${BACKEND_URL}/api/products?${params}`);
      const data = await response.json();

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
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryChange = (groupId, categoryIds) => {
    setActiveCategory(groupId);
    setActiveCategoryIds(categoryIds || []);
    setOffset(0);

    const params = new URLSearchParams();
    if (groupId) params.set('group', groupId);
    if (categoryIds?.length) categoryIds.forEach(id => params.append('category', id));
    if (searchQuery) params.set('search', searchQuery);
    if (sortBy && sortBy !== 'default') params.set('sortBy', sortBy);
    setSearchParams(params);

    // Закрываем sheet после выбора категории
    setFiltersOpen(false);
  };

  const handleSortChange = (e) => {
    const newSort = e.target.value;
    const params = new URLSearchParams();
    if (activeCategory) params.set('group', activeCategory);
    activeCategoryIds.forEach(id => params.append('category', id));
    if (searchQuery) params.set('search', searchQuery);
    if (newSort && newSort !== 'default') params.set('sortBy', newSort);
    setSearchParams(params);
  };

  const handleLoadMore = () => loadProducts(false);

  const handleClearFilters = () => {
    setActiveCategory(null);
    setActiveCategoryIds([]);
    setOffset(0);
    setSearchParams(new URLSearchParams());
    setFiltersOpen(false);
  };

  if (loading && products.length === 0) {
    return (
      <div className="catalog-page">
        <div className="container">
          <div className="products-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
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

        {/* ── Header ── */}
        <div className="catalog-header">
          <div className="catalog-header-left">
            <h1 className="catalog-title">Каталог</h1>
            <p className="catalog-subtitle">
              {totalCount > 0 ? `${totalCount} товаров` : 'Товары не найдены'}
            </p>
          </div>

          <div className="catalog-header-right">
            {/* Кнопка фильтров — только на мобилке */}
            <button
              className="filter-btn"
              onClick={() => setFiltersOpen(true)}
              aria-label="Открыть фильтры"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2">
                <line x1="4" y1="6" x2="20" y2="6"/>
                <line x1="8" y1="12" x2="20" y2="12"/>
                <line x1="12" y1="18" x2="20" y2="18"/>
              </svg>
              Категории
              {activeCategory && <span className="filter-btn-dot" />}
            </button>

            <div className="catalog-sort">
              <select
                id="sort"
                value={sortBy}
                onChange={handleSortChange}
                className="sort-select"
                aria-label="Сортировка"
              >
                <option value="default">По умолчанию</option>
                <option value="price_asc">Дешевле</option>
                <option value="price_desc">Дороже</option>
                <option value="name_asc">По названию</option>
                <option value="newest">Новинки</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── Активные фильтры ── */}
        {(activeCategory || searchQuery) && (
          <div className="active-filters">
            {searchQuery && (
              <div className="filter-tag">
                <span>«{searchQuery}»</span>
                <button onClick={handleClearFilters}>×</button>
              </div>
            )}
            {activeCategory && (
              <div className="filter-tag">
                <span>Категория выбрана</span>
                <button onClick={handleClearFilters}>×</button>
              </div>
            )}
            <button className="clear-all-btn" onClick={handleClearFilters}>
              Сбросить
            </button>
          </div>
        )}

        {/* ── Основной контент ── */}
        <div className="catalog-content">

          {/* Sidebar — только десктоп */}
          <aside className="catalog-sidebar">
            <CategorySidebar
              onCategoryChange={handleCategoryChange}
              activeCategory={activeCategory}
            />
          </aside>

          {/* Товары */}
          <div className="catalog-main">
            {products.length === 0 ? (
              <div className="catalog-empty">
                <div className="empty-icon">
                  <svg width="64" height="64" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="1.5">
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
                  {products.map((product, i) => (
                    <ProductCard
                      key={product.article}
                      product={product}
                      index={i}
                    />
                  ))}
                </div>

                {hasMore && (
                  <div className="load-more-container">
                    <button
                      className="load-more-btn"
                      onClick={handleLoadMore}
                      disabled={loading}
                    >
                      {loading ? (
                        <><span className="btn-loader" />Загрузка...</>
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

      {/* ══════════════════════════════════════
          BOTTOM SHEET — категории на мобилке
          ══════════════════════════════════════ */}

      {/* Оверлей */}
      <div
        className={`mobile-filters-overlay${filtersOpen ? ' open' : ''}`}
        onClick={() => setFiltersOpen(false)}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        className={`mobile-filters${filtersOpen ? ' open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Категории товаров"
      >
        {/* Ручка */}
        <div className="mobile-filters-handle" />

        {/* Заголовок */}
        <div className="mobile-filters-header">
          <h3>Категории</h3>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {activeCategory && (
              <button
                className="mobile-filters-reset"
                onClick={handleClearFilters}
              >
                Сбросить
              </button>
            )}
            <button
              className="mobile-filters-close"
              onClick={() => setFiltersOpen(false)}
              aria-label="Закрыть"
            >
              ×
            </button>
          </div>
        </div>

        {/* Сайдбар внутри шита */}
        <CategorySidebar
          onCategoryChange={handleCategoryChange}
          activeCategory={activeCategory}
        />
      </div>
    </div>
  );
}