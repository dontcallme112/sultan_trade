import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useProducts } from '../../hooks/useProducts.js';
import { productUtils } from '../../api/services/product.js';
import ProductCard from '../../components/features/ProductCard/ProductCard.jsx';
import './Catalog.css';

const Catalog = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { products: allProducts, loading } = useProducts();
  
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [sortBy, setSortBy] = useState('default');
  const [filters, setFilters] = useState({
    category: searchParams.get('category') || '',
    minPrice: '',
    maxPrice: '',
    minRating: '',
  });
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    if (!loading && allProducts.length > 0) {
      let result = [...allProducts];

      // Применяем фильтры
      result = productUtils.filterProducts(result, filters);

      // Применяем сортировку
      result = productUtils.sortProducts(result, sortBy);

      setFilteredProducts(result);
    }
  }, [allProducts, filters, sortBy, loading]);

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleSortChange = (value) => {
    setSortBy(value);
  };

  const clearFilters = () => {
    setFilters({
      category: '',
      minPrice: '',
      maxPrice: '',
      minRating: '',
    });
    setSearchParams({});
  };

  const categories = ['electronics', 'jewelery', "men's clothing", "women's clothing"];

  return (
    <div className="catalog">
      <div className="container">
        <div className="catalog-header">
          <div>
            <h1 className="catalog-title">Каталог</h1>
            <p className="catalog-subtitle">
              {filteredProducts.length} {filteredProducts.length === 1 ? 'товар' : 'товаров'}
            </p>
          </div>

          <div className="catalog-controls">
            <button 
              className="filter-toggle"
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
              </svg>
              Фильтры
            </button>

            <select 
              className="sort-select"
              value={sortBy}
              onChange={(e) => handleSortChange(e.target.value)}
            >
              <option value="default">По умолчанию</option>
              <option value="price-asc">Цена: по возрастанию</option>
              <option value="price-desc">Цена: по убыванию</option>
              <option value="rating">По рейтингу</option>
              <option value="name">По названию</option>
            </select>
          </div>
        </div>

        <div className="catalog-content">
          {/* Sidebar Filters */}
          <aside className={`filters-sidebar ${filtersOpen ? 'open' : ''}`}>
            <div className="filters-header">
              <h3>Фильтры</h3>
              <button 
                className="clear-filters"
                onClick={clearFilters}
              >
                Сбросить
              </button>
            </div>

            <div className="filter-group">
              <label className="filter-label">Категория</label>
              <div className="filter-options">
                {categories.map(category => (
                  <button
                    key={category}
                    className={`filter-chip ${filters.category === category ? 'active' : ''}`}
                    onClick={() => handleFilterChange('category', 
                      filters.category === category ? '' : category
                    )}
                  >
                    {formatCategoryName(category)}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-group">
              <label className="filter-label">Цена</label>
              <div className="price-inputs">
                <input
                  type="number"
                  placeholder="От"
                  value={filters.minPrice}
                  onChange={(e) => handleFilterChange('minPrice', e.target.value)}
                  className="price-input"
                />
                <span>—</span>
                <input
                  type="number"
                  placeholder="До"
                  value={filters.maxPrice}
                  onChange={(e) => handleFilterChange('maxPrice', e.target.value)}
                  className="price-input"
                />
              </div>
            </div>

            <div className="filter-group">
              <label className="filter-label">Минимальный рейтинг</label>
              <div className="rating-filter">
                {[5, 4, 3, 2, 1].map(rating => (
                  <button
                    key={rating}
                    className={`rating-option ${filters.minRating === rating.toString() ? 'active' : ''}`}
                    onClick={() => handleFilterChange('minRating', 
                      filters.minRating === rating.toString() ? '' : rating.toString()
                    )}
                  >
                    {'★'.repeat(rating)}
                    {'☆'.repeat(5 - rating)}
                  </button>
                ))}
              </div>
            </div>

            <button 
              className="mobile-close"
              onClick={() => setFiltersOpen(false)}
            >
              Применить
            </button>
          </aside>

          {/* Products Grid */}
          <div className="catalog-grid">
            {loading ? (
              [...Array(12)].map((_, i) => (
                <div key={i} className="product-skeleton">
                  <div className="skeleton" style={{ paddingTop: '125%' }}></div>
                  <div style={{ padding: 'var(--space-lg)' }}>
                    <div className="skeleton" style={{ height: '12px', width: '40%', marginBottom: '8px' }}></div>
                    <div className="skeleton" style={{ height: '20px', width: '80%', marginBottom: '8px' }}></div>
                    <div className="skeleton" style={{ height: '24px', width: '30%' }}></div>
                  </div>
                </div>
              ))
            ) : filteredProducts.length > 0 ? (
              filteredProducts.map((product, index) => (
                <div key={product.id} className={`animate-fadeInScale stagger-${(index % 3) + 1}`}>
                  <ProductCard product={product} />
                </div>
              ))
            ) : (
              <div className="empty-state">
                <div className="empty-icon">🔍</div>
                <h3>Ничего не найдено</h3>
                <p>Попробуйте изменить параметры поиска или фильтры</p>
                <button className="btn-primary" onClick={clearFilters}>
                  Сбросить фильтры
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const formatCategoryName = (category) => {
  const names = {
    'electronics': 'Электроника',
    'jewelery': 'Украшения',
    "men's clothing": 'Мужская одежда',
    "women's clothing": 'Женская одежда',
  };
  return names[category] || category;
};

export default Catalog;