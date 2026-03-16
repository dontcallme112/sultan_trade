import { useState, useEffect } from 'react';
import { BACKEND_URL } from '../../../api/client';
import './Filters.css';

export default function Filters({ onFilterChange, activeFilters }) {
  const [filtersData, setFiltersData] = useState({
    brands: [],
    priceRange: { min: 0, max: 1000000 }
  });
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [priceRange, setPriceRange] = useState([0, 1000000]);

  useEffect(() => {
    loadFilters();
  }, []);

  useEffect(() => {
    if (filtersData.priceRange && filtersData.priceRange.max > 0) {
      setPriceRange([
        activeFilters.minPrice || filtersData.priceRange.min,
        activeFilters.maxPrice || filtersData.priceRange.max
      ]);
    }
  }, [filtersData, activeFilters]);

  const loadFilters = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${BACKEND_URL}/api/filters`);
      
      if (!response.ok) {
        throw new Error('Failed to load filters');
      }
      
      const data = await response.json();
      
      setFiltersData({
        brands: data.brands || [],
        priceRange: data.priceRange || { min: 0, max: 1000000 }
      });
      
      setPriceRange([
        data.priceRange?.min || 0,
        data.priceRange?.max || 1000000
      ]);
      
    } catch (error) {
      console.error('Filters error:', error);
      // Используем fallback данные
      setFiltersData({
        brands: [],
        priceRange: { min: 0, max: 1000000 }
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBrandChange = (brand) => {
    onFilterChange({
      ...activeFilters,
      brand: activeFilters.brand === brand ? null : brand
    });
  };

  const handlePriceChange = () => {
    onFilterChange({
      ...activeFilters,
      minPrice: priceRange[0],
      maxPrice: priceRange[1]
    });
  };

  const handleSortChange = (e) => {
    onFilterChange({
      ...activeFilters,
      sortBy: e.target.value
    });
  };

  const handleOnlyNewChange = (e) => {
    onFilterChange({
      ...activeFilters,
      onlyNew: e.target.checked
    });
  };

  const handleReset = () => {
    setPriceRange([
      filtersData.priceRange?.min || 0,
      filtersData.priceRange?.max || 1000000
    ]);
    onFilterChange({
      brand: null,
      minPrice: null,
      maxPrice: null,
      onlyNew: false,
      sortBy: 'default'
    });
  };

  const formatPrice = (price) => {
    if (!price && price !== 0) return '0 ₸';
    return new Intl.NumberFormat('ru-RU').format(Math.round(price)) + ' ₸';
  };

  const activeFiltersCount = [
    activeFilters.brand,
    activeFilters.minPrice !== null,
    activeFilters.onlyNew
  ].filter(Boolean).length;

  if (loading) {
    return (
      <div className="filters-container">
        <div className="filters-panel">
          <div className="filters-loading">
            <div className="spinner"></div>
            <p>Загрузка фильтров...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="filters-container">
      {/* Mobile toggle */}
      <button 
        className="filters-toggle"
        onClick={() => setIsOpen(!isOpen)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="4" x2="20" y1="12" y2="12"/>
          <line x1="4" x2="20" y1="6" y2="6"/>
          <line x1="4" x2="20" y1="18" y2="18"/>
        </svg>
        Фильтры
        {activeFiltersCount > 0 && (
          <span className="filters-badge">{activeFiltersCount}</span>
        )}
      </button>

      <div className={`filters-panel ${isOpen ? 'open' : ''}`}>
        <div className="filters-header">
          <h3>Фильтры</h3>
          {activeFiltersCount > 0 && (
            <button className="filters-reset" onClick={handleReset}>
              Сбросить все
            </button>
          )}
        </div>

        {/* Сортировка */}
        <div className="filter-section">
          <label className="filter-label">Сортировка</label>
          <select 
            className="filter-select"
            value={activeFilters.sortBy || 'default'}
            onChange={handleSortChange}
          >
            <option value="default">По умолчанию</option>
            <option value="price_asc">Цена: по возрастанию</option>
            <option value="price_desc">Цена: по убыванию</option>
            <option value="name_asc">Название: А-Я</option>
            <option value="newest">Сначала новинки</option>
          </select>
        </div>

        {/* Цена */}
        <div className="filter-section">
          <label className="filter-label">
            Цена: {formatPrice(priceRange[0])} - {formatPrice(priceRange[1])}
          </label>
          <div className="price-inputs">
            <input
              type="number"
              placeholder="От"
              value={priceRange[0]}
              onChange={(e) => setPriceRange([Number(e.target.value), priceRange[1]])}
              className="price-input"
            />
            <span>—</span>
            <input
              type="number"
              placeholder="До"
              value={priceRange[1]}
              onChange={(e) => setPriceRange([priceRange[0], Number(e.target.value)])}
              className="price-input"
            />
          </div>
          <button className="filter-apply-btn" onClick={handlePriceChange}>
            Применить
          </button>
        </div>

        {/* Бренды */}
        {filtersData.brands && filtersData.brands.length > 0 && (
          <div className="filter-section">
            <label className="filter-label">Бренд ({filtersData.brands.length})</label>
            <div className="filter-options">
              {filtersData.brands.slice(0, 20).map((brand) => (
                <label key={brand} className="filter-checkbox">
                  <input
                    type="checkbox"
                    checked={activeFilters.brand === brand}
                    onChange={() => handleBrandChange(brand)}
                  />
                  <span>{brand}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Только новинки */}
        <div className="filter-section">
          <label className="filter-checkbox">
            <input
              type="checkbox"
              checked={activeFilters.onlyNew || false}
              onChange={handleOnlyNewChange}
            />
            <span>Только новинки</span>
          </label>
        </div>
      </div>
    </div>
  );
}