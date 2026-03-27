import { NavLink, useLocation } from 'react-router-dom';
import { useCart } from '../../../context/CartContext';
import './TabBar.css';

export default function TabBar() {
  const { cartItems } = useCart();
  const location = useLocation();
  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  // Скрываем tab bar на некоторых страницах
  const hidden = ['/checkout', '/auth/callback', '/auth/telegram'];
  if (hidden.includes(location.pathname)) return null;

  return (
    <nav className="tab-bar">
      <NavLink to="/" end className={({ isActive }) => `tab-item ${isActive ? 'active' : ''}`}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
        <span>Главная</span>
      </NavLink>

      <NavLink to="/catalog" className={({ isActive }) => `tab-item ${isActive ? 'active' : ''}`}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="3" width="7" height="7"/>
          <rect x="14" y="3" width="7" height="7"/>
          <rect x="3" y="14" width="7" height="7"/>
          <rect x="14" y="14" width="7" height="7"/>
        </svg>
        <span>Каталог</span>
      </NavLink>

      <NavLink to="/products" className={({ isActive }) => `tab-item tab-item-center ${isActive ? 'active' : ''}`}>
        <div className="tab-center-btn">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.35-4.35"/>
          </svg>
        </div>
        <span>Товары</span>
      </NavLink>

      <NavLink to="/cart" className={({ isActive }) => `tab-item ${isActive ? 'active' : ''}`}>
        <div className="tab-icon-wrap">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="9" cy="21" r="1"/>
            <circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
          </svg>
          {cartCount > 0 && <span className="tab-badge">{cartCount > 9 ? '9+' : cartCount}</span>}
        </div>
        <span>Корзина</span>
      </NavLink>

      <NavLink to="/profile" className={({ isActive }) => `tab-item ${isActive ? 'active' : ''}`}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
        <span>Профиль</span>
      </NavLink>
    </nav>
  );
}