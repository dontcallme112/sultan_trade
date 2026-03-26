import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import ProductCard from '../ProductCard/ProductCard';
import { BACKEND_URL } from '../../api/client';
import ProductCardSkeleton from '../../components/features/ProductCard/ProductCardSkeleton';
import './ProductGrid.css';

const LIMIT = 20;

const SORT_OPTIONS = [
  { value: 'smart',      label: 'Популярные' },
  { value: 'newest',     label: 'Новинки' },
  { value: 'price_desc', label: 'Дороже' },
  { value: 'price_asc',  label: 'Дешевле' },
  { value: 'name_asc',   label: 'А — Я' },
];

export default function ProductGrid() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const categoryId   = searchParams.get('category') || '';
  const categoryName = searchParams.get('name') || 'Товары';
  const searchQuery  = searchParams.get('search') || '';
  const sortBy       = searchParams.get('sortBy') || 'smart';

  const [products, setProducts]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError]         = useState(null);
  const [hasMore, setHasMore]     = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [offset, setOffset]       = useState(0);

  // Локальный поиск внутри категории
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const debounceRef = useRef(null);

  useEffect(() => {
    setOffset(0);
    setProducts([]);
    load(true);
    // eslint-disable-next-line
  }, [categoryId, sortBy, searchQuery]);

  const load = async (reset = false) => {
    if (reset) setLoading(true);
    else setLoadingMore(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('limit', LIMIT);
      params.set('offset', reset ? 0 : offset);
      if (categoryId) params.append('category', categoryId);
      if (searchQuery) params.append('search', searchQuery);
      if (sortBy && sortBy !== 'smart') params.append('sortBy', sortBy);
      // smart = сортировка на сервере (новинки + дорогие)

      const res = await fetch(`${BACKEND_URL}/api/products?${params}`);
      const data = await res.json();
      const els = data.elements || [];

      if (reset) {
        setProducts(els);
        setOffset(LIMIT);
      } else {
        setProducts(prev => [...prev, ...els]);
        setOffset(prev => prev + LIMIT);
      }
      setTotalCount(data.pagination?.totalCount || data.pagination?.total || 0);
      setHasMore(data.pagination?.hasMore || false);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const handleSearch = (val) => {
    setLocalSearch(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const p = new URLSearchParams(searchParams);
      if (val.trim()) p.set('search', val.trim());
      else p.delete('search');
      setSearchParams(p);
    }, 350);
  };

  const handleSort = (val) => {
    const p = new URLSearchParams(searchParams);
    p.set('sortBy', val);
    setSearchParams(p);
  };

  return (
    <div className="pl-page">
      {/* ── Хедер с навигацией ── */}
      <div className="pl-header">
        <button className="pl-back" onClick={() => navigate(-1)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <h1 className="pl-title">{categoryName}</h1>
        {totalCount > 0 && (
          <span className="pl-count">{totalCount}</span>
        )}
      </div>

      {/* ── Поиск внутри категории ── */}
      <div className="pl-search-wrap">
        <div className="pl-search-box">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            className="pl-search-input"
            placeholder={`Поиск в «${categoryName}»...`}
            value={localSearch}
            onChange={e => handleSearch(e.target.value)}
          />
          {localSearch && (
            <button className="pl-search-clear" onClick={() => handleSearch('')}>×</button>
          )}
        </div>
      </div>

      {/* ── Сортировка ── */}
      <div className="pl-sort-row">
        {SORT_OPTIONS.map(opt => (
          <button
            key={opt.value}
            className={`pl-sort-btn ${sortBy === opt.value ? 'active' : ''}`}
            onClick={() => handleSort(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* ── Ошибка ── */}
      {error && !loading && (
        <div className="pl-error">
          <p>⚠️ {error}</p>
          <button onClick={() => load(true)}>Повторить</button>
        </div>
      )}

      {/* ── Скелетон ── */}
      {loading && (
        <div className="pl-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* ── Товары ── */}
      {!loading && !error && (
        <>
          {products.length === 0 ? (
            <div className="pl-empty">
              <div className="pl-empty-icon">🔍</div>
              <p className="pl-empty-title">Товары не найдены</p>
              <p className="pl-empty-sub">
                {searchQuery ? `Нет результатов по «${searchQuery}»` : 'В этой категории пока нет товаров'}
              </p>
              {searchQuery && (
                <button className="pl-empty-btn" onClick={() => handleSearch('')}>
                  Сбросить поиск
                </button>
              )}
            </div>
          ) : (
            <div className="pl-grid">
              {products.map((product, i) => (
                <ProductCard key={product.article} product={product} index={i} />
              ))}
            </div>
          )}

          {/* Загрузить ещё */}
          {hasMore && products.length > 0 && (
            <div className="pl-load-more">
              <button
                className="pl-load-btn"
                onClick={() => load(false)}
                disabled={loadingMore}
              >
                {loadingMore
                  ? <span className="pl-spinner" />
                  : `Показать ещё · ${products.length} из ${totalCount}`}
              </button>
            </div>
          )}

          {!hasMore && products.length > 0 && (
            <p className="pl-end">Показаны все {totalCount} товаров</p>
          )}
        </>
      )}
    </div>
  );
}