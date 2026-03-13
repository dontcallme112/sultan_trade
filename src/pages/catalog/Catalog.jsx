import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useProducts } from '../../hooks/useProducts';
import ProductCard from '../../components/features/ProductCard/ProductCard';
import './Catalog.css';

export default function Catalog() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [filters, setFilters] = useState({
    category: searchParams.get('category') || null,
    brand: searchParams.get('brand') || null,
    search: searchParams.get('search') || '',
    limit: 12,
    offset: 0
  });

  const [allProducts, setAllProducts] = useState([]);
  const [hasMore, setHasMore] = useState(true);

  const { products, loading, error } = useProducts(filters);

  // Загрузка товаров
  useEffect(() => {
    if (products && products.length > 0) {
      if (filters.offset === 0) {
        // Первая загрузка - заменяем товары
        setAllProducts(products);
      } else {
        // Подгрузка - добавляем товары
        setAllProducts(prev => [...prev, ...products]);
      }
      
      // Проверяем есть ли еще товары
      setHasMore(products.length === filters.limit);
    }
  }, [products]);

  // Загрузить еще товары
  const loadMore = () => {
    setFilters(prev => ({
      ...prev,
      offset: prev.offset + prev.limit
    }));
  };

  // Сброс фильтров
  const resetFilters = () => {
    setFilters({
      category: null,
      brand: null,
      search: '',
      limit: 12,
      offset: 0
    });
    setSearchParams({});
  };

  // Переход на страницу товара
  const handleProductClick = (product) => {
    navigate(`/product/${product.article || product.id}`);
  };

  return (
    <div className="catalog-page">
      <div className="container">
        {/* Header */}
        <div className="catalog-header">
          <div>
            <h1 className="catalog-title">Каталог товаров</h1>
            <p className="catalog-subtitle">
              {allProducts.length > 0 
                ? `Найдено товаров: ${allProducts.length}` 
                : 'Просмотрите нашу коллекцию премиум электроники'}
            </p>
          </div>

          {(filters.category || filters.brand || filters.search) && (
            <button className="btn btn-secondary" onClick={resetFilters}>
              Сбросить фильтры
            </button>
          )}
        </div>

        {/* Активные фильтры */}
        {(filters.category || filters.brand || filters.search) && (
          <div className="active-filters">
            {filters.category && (
              <span className="filter-tag">
                Категория: {filters.category}
                <button onClick={() => setFilters(prev => ({ ...prev, category: null }))}>×</button>
              </span>
            )}
            {filters.brand && (
              <span className="filter-tag">
                Бренд: {filters.brand}
                <button onClick={() => setFilters(prev => ({ ...prev, brand: null }))}>×</button>
              </span>
            )}
            {filters.search && (
              <span className="filter-tag">
                Поиск: {filters.search}
                <button onClick={() => setFilters(prev => ({ ...prev, search: '' }))}>×</button>
              </span>
            )}
          </div>
        )}

        {/* Loading состояние для первой загрузки */}
        {loading && allProducts.length === 0 && (
          <div className="catalog-loading">
            <div className="loader"></div>
            <p>Загружаем товары...</p>
          </div>
        )}

        {/* Error состояние */}
        {error && (
          <div className="catalog-error">
            <div className="error-icon">⚠️</div>
            <h3>Произошла ошибка</h3>
            <p>{error}</p>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              Попробовать снова
            </button>
          </div>
        )}

        {/* Товары */}
        {!loading && !error && allProducts.length === 0 && (
          <div className="catalog-empty">
            <div className="empty-icon">
              <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
              </svg>
            </div>
            <h2>Товары не найдены</h2>
            <p>Попробуйте изменить параметры поиска или фильтры</p>
            <button className="btn btn-primary" onClick={resetFilters}>
              Сбросить фильтры
            </button>
          </div>
        )}

        {/* Сетка товаров */}
        {allProducts.length > 0 && (
          <>
            <div className="products-grid">
              {allProducts.map((product, index) => (
                <ProductCard 
                  key={product.id || product.article || index} 
                  product={product}
                  onClick={() => handleProductClick(product)}
                />
              ))}
            </div>

            {/* Кнопка "Загрузить еще" */}
            {hasMore && (
              <div className="load-more-container">
                <button 
                  className="btn btn-secondary btn-lg load-more-btn"
                  onClick={loadMore}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <div className="btn-loader"></div>
                      Загрузка...
                    </>
                  ) : (
                    <>
                      Загрузить еще
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Конец списка */}
            {!hasMore && allProducts.length > 0 && (
              <div className="end-of-list">
                <p>Вы просмотрели все товары</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}