import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { BACKEND_URL } from '../../../api/client';
import './SearchBar.css';

const POPULAR = ['iPhone', 'AirPods', 'Samsung', 'Ноутбук', 'SSD', 'Наушники'];

function highlight(text, query) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="suggestion-highlight">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export default function SearchBar() {
  const [query, setQuery]           = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen]         = useState(false);
  const [loading, setLoading]       = useState(false);
  const [activeIdx, setActiveIdx]   = useState(-1);

  const searchRef  = useRef(null);
  const inputRef   = useRef(null);
  const timerRef   = useRef(null);
  const navigate   = useNavigate();

  // Закрытие по клику снаружи
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setIsOpen(false);
        setActiveIdx(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Дебаунс-поиск
  useEffect(() => {
    clearTimeout(timerRef.current);
    setActiveIdx(-1);

    if (query.length < 2) {
      setSuggestions([]);
      // Открываем с популярными если поле в фокусе
      return;
    }

    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res  = await fetch(`${BACKEND_URL}/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        const results = Array.isArray(data) ? data : (data.suggestions || []);
        setSuggestions(results);
        setIsOpen(true);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timerRef.current);
  }, [query]);

  const handleSearch = useCallback((e) => {
    e.preventDefault();
    if (!query.trim()) return;
    navigate(`/catalog?search=${encodeURIComponent(query.trim())}`);
    setIsOpen(false);
    setQuery('');
  }, [query, navigate]);

  const handleSuggestionClick = useCallback((article) => {
    navigate(`/product/${article}`);
    setIsOpen(false);
    setQuery('');
  }, [navigate]);

  const handlePopularClick = useCallback((term) => {
    setQuery(term);
    inputRef.current?.focus();
  }, []);

  // Клавиатурная навигация
  const handleKeyDown = useCallback((e) => {
    if (!isOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault();
      handleSuggestionClick(suggestions[activeIdx].article);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setActiveIdx(-1);
    }
  }, [isOpen, activeIdx, suggestions, handleSuggestionClick]);

  const formatPrice = (price) => {
    if (!price) return '';
    return new Intl.NumberFormat('ru-RU').format(Math.round(price * 1.1)) + ' ₸';
  };

  const showPopular = isOpen && query.length < 2;
  const showResults = isOpen && query.length >= 2;

  return (
    <div className="search-bar" ref={searchRef}>
      <form onSubmit={handleSearch} className="search-form">
        <svg className="search-icon-left" width="16" height="16" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setIsOpen(true); }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="iPhone, SSD, наушники..."
          className="search-input"
          autoComplete="off"
        />

        {query && (
          <button
            type="button"
            className="search-clear"
            onClick={() => { setQuery(''); setSuggestions([]); inputRef.current?.focus(); }}
            aria-label="Очистить"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}

        <button type="submit" className="search-button" aria-label="Найти">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
          </svg>
        </button>
      </form>

      {isOpen && (
        <div className="search-dropdown">

          {/* Популярные запросы — когда поле пустое */}
          {showPopular && (
            <div className="search-popular">
              <p className="search-section-label">Популярные запросы</p>
              <div className="popular-tags">
                {POPULAR.map((term) => (
                  <button
                    key={term}
                    className="popular-tag"
                    onClick={() => handlePopularClick(term)}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2">
                      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
                      <polyline points="17 6 23 6 23 12"/>
                    </svg>
                    {term}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Скелетон загрузки */}
          {showResults && loading && (
            <div className="search-skeletons">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="suggestion-skeleton">
                  <div className="sk-img" />
                  <div className="sk-lines">
                    <div className="sk-line" style={{ width: '40%', height: 10 }} />
                    <div className="sk-line" style={{ width: '85%', height: 13, marginTop: 5 }} />
                    <div className="sk-line" style={{ width: '30%', height: 11, marginTop: 5 }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Результаты */}
          {showResults && !loading && suggestions.length > 0 && (
            <>
              <p className="search-section-label" style={{ padding: '10px 16px 4px' }}>
                Найдено товаров
              </p>
              <div className="search-suggestions">
                {suggestions.map((item, i) => (
                  <button
                    key={item.article}
                    className={`search-suggestion-item${activeIdx === i ? ' active' : ''}`}
                    onClick={() => handleSuggestionClick(item.article)}
                    onMouseEnter={() => setActiveIdx(i)}
                  >
                    <div className="suggestion-img-wrap">
                      {item.image
                        ? <img src={item.image} alt={item.name} className="suggestion-image"
                            onError={(e) => { e.target.style.display = 'none'; }} />
                        : <div className="suggestion-img-placeholder">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                              stroke="currentColor" strokeWidth="1.5" opacity="0.3">
                              <rect x="3" y="3" width="18" height="18" rx="2"/>
                              <circle cx="8.5" cy="8.5" r="1.5"/>
                              <polyline points="21 15 16 10 5 21"/>
                            </svg>
                          </div>
                      }
                    </div>
                    <div className="suggestion-info">
                      {item.brand && (
                        <span className="suggestion-brand">{item.brand}</span>
                      )}
                      <p className="suggestion-name">
                        {highlight(item.name, query)}
                      </p>
                      {item.price && (
                        <span className="suggestion-price">{formatPrice(item.price)}</span>
                      )}
                    </div>
                    <svg className="suggestion-arrow" width="14" height="14"
                      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </button>
                ))}
              </div>

              <button
                className="search-show-all"
                onClick={() => {
                  navigate(`/catalog?search=${encodeURIComponent(query)}`);
                  setIsOpen(false);
                  setQuery('');
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="m21 21-4.35-4.35"/>
                </svg>
                Все результаты по «{query}»
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" style={{ marginLeft: 'auto' }}>
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            </>
          )}

          {/* Ничего не найдено */}
          {showResults && !loading && suggestions.length === 0 && (
            <div className="search-empty">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.5" opacity="0.3">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
              </svg>
              <p>Ничего не найдено по «{query}»</p>
              <span>Попробуйте другой запрос</span>
            </div>
          )}

        </div>
      )}
    </div>
  );
}