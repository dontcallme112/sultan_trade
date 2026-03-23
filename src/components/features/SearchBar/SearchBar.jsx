import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { BACKEND_URL } from '../../../api/client';
import './SearchBar.css';

export default function SearchBar() {
  const [query, setQuery]           = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen]         = useState(false);
  const [loading, setLoading]       = useState(false);
  const searchRef = useRef(null);
  const navigate  = useNavigate();

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (query.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `${BACKEND_URL}/api/search?q=${encodeURIComponent(query)}`
        );
        const data = await response.json();

        // Сервер возвращает массив напрямую — не объект с suggestions
        const results = Array.isArray(data) ? data : (data.suggestions || []);
        setSuggestions(results);
        setIsOpen(true);
      } catch (error) {
        console.error('Search error:', error);
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (query.trim()) {
      navigate(`/catalog?search=${encodeURIComponent(query.trim())}`);
      setIsOpen(false);
      setQuery('');
    }
  };

  const handleSuggestionClick = (article) => {
    navigate(`/product/${article}`);
    setIsOpen(false);
    setQuery('');
  };

  const formatPrice = (price) => {
    if (!price) return '';
    return new Intl.NumberFormat('ru-RU').format(Math.round(price * 1.1)) + ' ₸';
  };

  return (
    <div className="search-bar" ref={searchRef}>
      <form onSubmit={handleSearch} className="search-form">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск товаров..."
          className="search-input"
        />
        <button type="submit" className="search-button">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
          </svg>
        </button>
      </form>

      {isOpen && (
        <div className="search-dropdown">
          {loading && (
            <div className="search-loading">
              <div className="spinner"></div>
              <p>Поиск...</p>
            </div>
          )}

          {!loading && suggestions.length === 0 && query.length >= 2 && (
            <div className="search-empty">
              <p>Ничего не найдено по запросу «{query}»</p>
            </div>
          )}

          {!loading && suggestions.length > 0 && (
            <div className="search-suggestions">
              {suggestions.map((item) => (
                <button
                  key={item.article}
                  className="search-suggestion-item"
                  onClick={() => handleSuggestionClick(item.article)}
                >
                  {item.image && (
                    <img
                      src={item.image}
                      alt={item.name}
                      className="suggestion-image"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  )}
                  <div className="suggestion-info">
                    {item.brand && <span className="suggestion-brand">{item.brand}</span>}
                    <p className="suggestion-name">{item.name}</p>
                    {item.price && <span className="suggestion-price">{formatPrice(item.price)}</span>}
                  </div>
                </button>
              ))}

              {/* Кнопка "показать все результаты" */}
              <button
                className="search-show-all"
                onClick={() => {
                  navigate(`/catalog?search=${encodeURIComponent(query)}`);
                  setIsOpen(false);
                  setQuery('');
                }}
              >
                Показать все результаты по «{query}»
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}