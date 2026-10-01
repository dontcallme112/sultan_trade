import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import ProductCard from '../ProductCard/ProductCard';
import ProductCardSkeleton from '../ProductCard/ProductCardSkeleton';
import { BACKEND_URL } from '../../../api/client';
import './ProductGrid.css';

const LIMIT = 20;
const SKELETON_COUNT = 8;

const SORT_OPTIONS = [
  { value: 'smart',      label: 'Популярные' },
  { value: 'newest',     label: 'Новинки' },
  { value: 'price_desc', label: 'Дороже' },
  { value: 'price_asc',  label: 'Дешевле' },
  { value: 'name_asc',   label: 'А — Я' },
];

// Для страницы «Новинки»: все товары и так новые, поэтому пункт «Новинки» — это сортировка по умолчанию
const NEW_SORT_OPTIONS = [
  { value: 'smart',      label: 'Новинки' },
  { value: 'price_desc', label: 'Дороже' },
  { value: 'price_asc',  label: 'Дешевле' },
  { value: 'name_asc',   label: 'А — Я' },
];

const fmt = (n) => Number(n || 0).toLocaleString('ru-RU');

// 1 товар, 2–4 товара, 5+ товаров
const plural = (n, [one, few, many]) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

// onlyNew + title используются страницей «Новинки» (NewProducts.jsx)
export default function ProductGrid({ onlyNew = false, title = '' }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const categoryId   = onlyNew ? '' : (searchParams.get('category') || '');
  const categoryName = title || searchParams.get('name') || 'Товары';
  const sortOptions  = onlyNew ? NEW_SORT_OPTIONS : SORT_OPTIONS;
  const searchQuery  = searchParams.get('search') || '';
  const sortBy       = searchParams.get('sortBy') || 'smart';

  const [products, setProducts]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError]             = useState(null);
  const [hasMore, setHasMore]         = useState(true);
  const [totalCount, setTotalCount]   = useState(0);
  const [offset, setOffset]           = useState(0);

  // Локальный поиск внутри категории
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const debounceRef = useRef(null);
  const reqId = useRef(0);                 // защита от «устаревших» ответов при быстрых кликах
  const prevCategory = useRef(categoryId);

  useEffect(() => {
    // при смене категории очищаем список; при смене сортировки/поиска оставляем старые карточки,
    // пока грузятся новые (они просто притухают), без резкого пропадания
    if (prevCategory.current !== categoryId) {
      setProducts([]);
      prevCategory.current = categoryId;
    }
    load(true);
    // eslint-disable-next-line
  }, [categoryId, sortBy, searchQuery]);

  // если параметр поиска изменился снаружи, обновляем поле
  useEffect(() => { setLocalSearch(searchQuery); }, [searchQuery]);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const load = async (reset = false) => {
    const id = ++reqId.current;
    if (reset) setLoading(true);
    else setLoadingMore(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('limit', LIMIT);
      params.set('offset', reset ? 0 : offset);
      if (categoryId) params.append('category', categoryId);
      if (onlyNew) params.append('onlyNew', 'true');
      if (searchQuery) params.append('search', searchQuery);
      if (sortBy && sortBy !== 'smart') params.append('sortBy', sortBy);
      // smart = сортировка на сервере (новинки + дорогие)

      const res = await fetch(`${BACKEND_URL}/api/products?${params}`);
      if (!res.ok) throw new Error(`Не удалось загрузить товары (${res.status})`);
      const data = await res.json();
      if (id !== reqId.current) return;   // пока грузили, пользователь уже выбрал другое
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
      if (id === reqId.current) setError(e.message);
    } finally {
      if (id === reqId.current) {
        setLoading(false);
        setLoadingMore(false);
      }
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

  const showSkeleton = loading && products.length === 0;
  const showEmpty = !loading && !error && products.length === 0;

  return (
    <div className="pl-page">
      <div className="pl-inner">
        {/* ── Заголовок ── */}
        <div className="pl-heading">
          {!onlyNew && (
            <button type="button" className="pl-back" onClick={() => navigate(-1)} aria-label="Назад">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}
          <div className="pl-heading-text">
            <h1 className="pl-title">{categoryName}</h1>
            {totalCount > 0 && !error && (
              <p className="pl-count">Найдено {fmt(totalCount)} {plural(totalCount, ['товар', 'товара', 'товаров'])}</p>
            )}
          </div>
        </div>

        {/* ── Панель: поиск + сортировка ── */}
        <div className="pl-toolbar">
          <div className="pl-search-box">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              className="pl-search-input"
              placeholder={onlyNew ? 'Найти среди новинок' : `Найти в «${categoryName}»`}
              value={localSearch}
              onChange={e => handleSearch(e.target.value)}
            />
            {localSearch && (
              <button type="button" className="pl-search-clear" onClick={() => handleSearch('')} aria-label="Очистить">×</button>
            )}
          </div>

          <div className="pl-sort-row" role="group" aria-label="Сортировка">
            {sortOptions.map(opt => (
              <button
                type="button"
                key={opt.value}
                className={`pl-sort-btn ${sortBy === opt.value ? 'active' : ''}`}
                onClick={() => handleSort(opt.value)}
                aria-pressed={sortBy === opt.value}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Ошибка ── */}
        {error && !loading && (
          <div className="pl-error">
            <p>⚠️ {error}</p>
            <button type="button" onClick={() => load(true)}>Повторить</button>
          </div>
        )}

        {/* ── Скелетоны (первая загрузка) ── */}
        {showSkeleton && (
          <div className="pl-grid" aria-busy="true">
            {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        )}

        {/* ── Товары (при смене сортировки/поиска притухают, пока грузятся новые) ── */}
        {products.length > 0 && (
          <div className={`pl-grid${loading ? ' is-refreshing' : ''}`}>
            {products.map((product, i) => (
              <ProductCard key={product.article} product={product} index={i} />
            ))}
          </div>
        )}

        {/* ── Ничего не найдено ── */}
        {showEmpty && (
          <div className="pl-empty">
            <div className="pl-empty-icon">🔍</div>
            <p className="pl-empty-title">Товары не найдены</p>
            <p className="pl-empty-sub">
              {searchQuery ? `Нет результатов по «${searchQuery}»` : (onlyNew ? 'Новинок пока нет' : 'В этой категории пока нет товаров')}
            </p>
            {searchQuery && (
              <button type="button" className="pl-empty-btn" onClick={() => handleSearch('')}>
                Сбросить поиск
              </button>
            )}
          </div>
        )}

        {/* ── Загрузить ещё ── */}
        {!error && !loading && hasMore && products.length > 0 && (
          <div className="pl-load-more">
            <button type="button" className="pl-load-btn" onClick={() => load(false)} disabled={loadingMore}>
              {loadingMore
                ? <span className="pl-spinner" />
                : `Показать ещё · ${fmt(products.length)} из ${fmt(totalCount)}`}
            </button>
          </div>
        )}

        {!error && !loading && !hasMore && products.length > 0 && (
          <p className="pl-end">Показаны все {fmt(totalCount)} {plural(totalCount, ['товар', 'товара', 'товаров'])}</p>
        )}
      </div>
    </div>
  );
}