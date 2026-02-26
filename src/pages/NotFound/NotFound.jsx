import React from 'react';
import { Link } from 'react-router-dom';
import './NotFound.css';

const NotFound = () => {
  return (
    <div className="not-found-page">
      <div className="container">
        <div className="not-found-content animate-fadeIn">
          <div className="error-code">404</div>
          <h1 className="error-title">Страница не найдена</h1>
          <p className="error-description">
            К сожалению, запрашиваемая страница не существует или была перемещена.
          </p>
          
          <div className="error-actions">
            <Link to="/" className="btn-primary">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              </svg>
              На главную
            </Link>
            <Link to="/catalog" className="btn-secondary">
              Перейти в каталог
            </Link>
          </div>

          <div className="helpful-links">
            <h3>Полезные ссылки:</h3>
            <ul>
              <li><Link to="/catalog">Каталог товаров</Link></li>
              <li><Link to="/cart">Корзина</Link></li>
              <li><Link to="/">Главная страница</Link></li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotFound;