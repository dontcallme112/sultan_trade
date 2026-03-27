import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ProductCard from '../../components/features/ProductCard/ProductCard';
import ProductCardSkeleton from '../../components/features/ProductCard/ProductCardSkeleton';
import { BACKEND_URL } from '../../api/client';
import './NewProducts.css';

const LIMIT = 20;

const SORT_OPTIONS = [
  { value: 'newest',     label: 'Новинки' },
  { value: 'price_desc', label: 'Дороже' },
  { value: 'price_asc',  label: 'Дешевле' },
  { value: 'name_asc',   label: 'А — Я' },
];

export default function NewProducts() {
  const navigate = useNavigate();
  const [products, setProducts]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError]           = useState(null);
  const [hasMore, setHasMore]       = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [offset, setOffset]         = useState(0);
  const [sortBy, setSortBy]         = useState('newest');

  // Локальный поиск внутри новинок
  const [localSearch, setLocalSearch] = useState('');
  const debounceRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setOffset(0);
    setProducts([]);
    load(true);
  }, [sortBy, searchQuery]);

  const load = async (reset = false) => {
    if (reset) setLoading(true);
    else setLoadingMore(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('limit', LIMIT);
      params.set('offset', reset ? 0 : offset);
      params.set('onlyNew', 'true');
      if (sortBy && sortBy !== 'newest') params.set('sortBy', sortBy);
      if (searchQuery) params.set('search', searchQuery);

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
    debounceRef.current = setTimeout(() => setSearchQuery(val.trim()), 350);
  };

  return (
    <div className="np-page">

      {/* ── Хедер ── */}
      <div className="np-header">
        <button className="np-back" onClick={() => navigate(-1)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div className="np-header-title">
          <span className="np-star">✦</span>
          <h1>Новинки</h1>
        </div>
        {totalCount > 0 && (
          <span className="np-count">{totalCount}</span>
        )}
      </div>

      {/* ── Поиск ── */}
      <div className="np-search-wrap">
        <div className="np-search-box">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            className="np-search-input"
            placeholder="Поиск среди новинок..."
            value={localSearch}
            onChange={e => handleSearch(e.target.value)}
          />
          {localSearch && (
            <button className="np-search-clear" onClick={() => handleSearch('')}>×</button>
          )}
        </div>
      </div>

      {/* ── Сортировка ── */}
      <div className="np-sort-row">
        {SORT_OPTIONS.map(opt => (
          <button
            key={opt.value}
            className={`np-sort-btn ${sortBy === opt.value ? 'active' : ''}`}
            onClick={() => setSortBy(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* ── Ошибка ── */}
      {error && !loading && (
        <div className="np-error">
          <p>⚠️ {error}</p>
          <button onClick={() => load(true)}>Повторить</button>
        </div>
      )}

      {/* ── Скелетон ── */}
      {loading && (
        <div className="np-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* ── Товары ── */}
      {!loading && !error && (
        <>
          {products.length === 0 ? (
            <div className="np-empty">
              <div className="np-empty-icon">✦</div>
              <p className="np-empty-title">Новинок не найдено</p>
              <p className="np-empty-sub">
                {searchQuery ? `Нет результатов по «${searchQuery}»` : 'В этой категории пока нет новинок'}
              </p>
              {searchQuery && (
                <button className="np-empty-btn" onClick={() => handleSearch('')}>
                  Сбросить поиск
                </button>
              )}
            </div>
          ) : (
            <div className="np-grid">
              {products.map((product, i) => (
                <ProductCard key={product.article} product={product} index={i} />
              ))}
            </div>
          )}

          {hasMore && products.length > 0 && (
            <div className="np-load-more">
              <button
                className="np-load-btn"
                onClick={() => load(false)}
                disabled={loadingMore}
              >
                {loadingMore
                  ? <span className="np-spinner" />
                  : `Показать ещё · ${products.length} из ${totalCount}`}
              </button>
            </div>
          )}

          {!hasMore && products.length > 0 && (
            <p className="np-end">Показаны все {totalCount} новинок</p>
          )}
        </>
      )}
    </div>
  );
}