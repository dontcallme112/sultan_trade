import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import ProductCard from '../../components/features/ProductCard/ProductCard';
import CategorySidebar from '../../components/features/Categorysidebar/Categorysidebar';
import { BACKEND_URL } from '../../api/client';
import './Catalog.css';
import ProductCardSkeleton from '../../components/features/ProductCard/ProductCardSkeleton';

// Категории для горизонтального скролла на мобилке
const MOBILE_CATEGORIES = [
  { id: 'phones',       icon: '📱', label: 'Телефоны',    keywords: ['мобильн', 'телефон', 'смартфон', 'планшет', 'iphone'] },
  { id: 'computers',    icon: '💻', label: 'Компьютеры',  keywords: ['ноутбук', 'laptop', 'системн блок', 'компьютер', 'процессор'] },
  { id: 'peripherals',  icon: '⌨️', label: 'Периферия',   keywords: ['клавиатур', 'мышь', 'монитор', 'принтер'] },
  { id: 'audio',        icon: '🎧', label: 'Аудио',       keywords: ['наушник', 'колонк', 'микрофон', 'аудио'] },
  { id: 'gaming',       icon: '🎮', label: 'Игры',        keywords: ['игров', 'консол', 'джойстик', 'геймпад'] },
  { id: 'tv_media',     icon: '📺', label: 'ТВ',          keywords: ['телевизор', 'проектор', 'медиаплеер'] },
  { id: 'network',      icon: '🌐', label: 'Сеть',        keywords: ['роутер', 'сетев', 'wifi', 'коммутатор'] },
  { id: 'wearables',    icon: '⌚', label: 'Умные',       keywords: ['смарт час', 'фитнес', 'умный дом'] },
  { id: 'cables_power', icon: '🔌', label: 'Кабели',      keywords: ['кабел', 'зарядн', 'переходник'] },
  { id: 'storage',      icon: '💾', label: 'Память',      keywords: ['флешк', 'карт памят', 'ssd', 'накопитель'] },
  { id: 'office',       icon: '🖨️', label: 'Офис',        keywords: ['принтер', 'сканер', 'картридж', 'офисн'] },
  { id: 'photo_video',  icon: '📷', label: 'Фото/Видео',  keywords: ['камер', 'фотоаппарат', 'штатив', 'дрон'] },
];

function getGroupId(categoryName) {
  const name = categoryName.toLowerCase();
  for (const group of MOBILE_CATEGORIES) {
    if (group.keywords.some(kw => name.includes(kw))) return group.id;
  }
  return null;
}

export default function Catalog() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  // Категории для горизонтального скролла
  const [mobileCategories, setMobileCategories] = useState([]);
  const [activeMobileChip, setActiveMobileChip] = useState(null);

  const LIMIT = 12;

  const [activeCategory, setActiveCategory] = useState(
    searchParams.get('group') || null
  );
  const [activeCategoryIds, setActiveCategoryIds] = useState(
    searchParams.getAll('category') || []
  );

  const searchQuery = searchParams.get('search') || null;
  const sortBy = searchParams.get('sortBy') || 'default';

  // Загружаем категории для чипов
  useEffect(() => {
    fetch(`${BACKEND_URL}/api/categories`)
      .then(r => r.json())
      .then(data => {
        const arr = Array.isArray(data) ? data : (data?.data || []);
        // Группируем по groupId
        const grouped = {};
        arr.filter(c => c.elements > 0).forEach(c => {
          const gid = getGroupId(c.name);
          if (!gid) return;
          if (!grouped[gid]) grouped[gid] = { categoryIds: [] };
          grouped[gid].categoryIds.push(c.id.toString());
        });
        // Собираем чипы только для тех групп где есть товары
        const chips = MOBILE_CATEGORIES.filter(m => grouped[m.id]?.categoryIds.length > 0)
          .map(m => ({ ...m, categoryIds: grouped[m.id].categoryIds }));
        setMobileCategories(chips);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setOffset(0);
    loadProducts(true);
  }, [activeCategoryIds, searchQuery, sortBy]);

  useEffect(() => {
    const groupFromUrl = searchParams.get('group') || null;
    const idsFromUrl = searchParams.getAll('category') || [];
    setActiveCategory(groupFromUrl);
    setActiveCategoryIds(idsFromUrl);
    setActiveMobileChip(groupFromUrl);
  }, [searchParams]);

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

  // Клик по чипу категории
  const handleChipClick = (chip) => {
    if (activeMobileChip === chip.id) {
      // Снимаем фильтр
      setActiveMobileChip(null);
      setActiveCategory(null);
      setActiveCategoryIds([]);
      setOffset(0);
      setSearchParams(new URLSearchParams());
    } else {
      setActiveMobileChip(chip.id);
      setActiveCategory(chip.id);
      setActiveCategoryIds(chip.categoryIds);
      setOffset(0);
      const params = new URLSearchParams();
      params.set('group', chip.id);
      chip.categoryIds.forEach(id => params.append('category', id));
      setSearchParams(params);
    }
  };

  const handleCategoryChange = (groupId, categoryIds) => {
    setActiveCategory(groupId);
    setActiveCategoryIds(categoryIds || []);
    setActiveMobileChip(groupId);
    setOffset(0);
    const params = new URLSearchParams();
    if (groupId) params.set('group', groupId);
    if (categoryIds?.length) categoryIds.forEach(id => params.append('category', id));
    if (searchQuery) params.set('search', searchQuery);
    if (sortBy && sortBy !== 'default') params.set('sortBy', sortBy);
    setSearchParams(params);
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
    setActiveMobileChip(null);
    setOffset(0);
    setSearchParams(new URLSearchParams());
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

        {/* ── Горизонтальный скролл категорий (мобилка) ── */}
        <div className="catalog-categories-scroll">
          <div className="categories-scroll-wrapper">
            <div className="categories-scroll-track">
              {/* Чип "Все" */}
              <button
                className={`category-chip category-chip-all${!activeMobileChip ? ' active' : ''}`}
                onClick={handleClearFilters}
              >
                🏠 Все
              </button>

              {mobileCategories.map(chip => (
                <button
                  key={chip.id}
                  className={`category-chip${activeMobileChip === chip.id ? ' active' : ''}`}
                  onClick={() => handleChipClick(chip)}
                >
                  <span className="category-chip-icon">{chip.icon}</span>
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Активные фильтры ── */}
        {searchQuery && (
          <div className="active-filters">
            <div className="filter-tag">
              <span>«{searchQuery}»</span>
              <button onClick={handleClearFilters}>×</button>
            </div>
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
                <p>Попробуйте выбрать другую категорию</p>
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
                      {loading
                        ? <><span className="btn-loader" />Загрузка...</>
                        : `Показать ещё (${products.length} из ${totalCount})`
                      }
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