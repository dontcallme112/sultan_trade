import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { BACKEND_URL } from '../../../api/client';
import './SearchBar.css';

export default function SearchBar() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const searchRef = useRef(null);
  const navigate = useNavigate();

  // Закрытие при клике вне компонента
  useEffect(() => {
    function handleClickOutside(event) {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Автодополнение при вводе
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
        setSuggestions(data.suggestions || []);
        setIsOpen(true);
      } catch (error) {
        console.error('Search error:', error);
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 300); // Debounce 300ms

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
    const priceWithMarkup = Math.round(price * 1.1);
    return new Intl.NumberFormat('ru-RU').format(priceWithMarkup) + ' ₸';
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
              <p>Ничего не найдено</p>
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
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                  )}
                  <div className="suggestion-info">
                    {item.brand && (
                      <span className="suggestion-brand">{item.brand}</span>
                    )}
                    <p className="suggestion-name">{item.name}</p>
                    <span className="suggestion-price">{formatPrice(item.price)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}