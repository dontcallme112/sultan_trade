import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useCart } from '../../../context/CartContext';
import './Header.css';

const Header = () => {
  const { cartItems } = useCart();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Закрывать меню при смене роута
  useEffect(() => {
    setMobileMenu(false);
  }, [location]);

  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  // Закрытие меню при клике на ссылку
  const handleLinkClick = () => {
    setMobileMenu(false);
  };

  return (
    <header className={`header ${scrolled ? 'scrolled' : ''}`}>
      <div className="header-bg"></div>
      
      <div className="container">
        <div className="header-content">
          {/* Logo */}
          <Link to="/" className="logo" onClick={handleLinkClick}>
            <div className="logo-icon">⚡</div>
            <span className="logo-text">LUXE</span>
            <div className="logo-glow"></div>
          </Link>

          {/* Navigation */}
          <nav className={`nav ${mobileMenu ? 'active' : ''}`}>
            <Link to="/" className="nav-link" onClick={handleLinkClick}>
              <span>Главная</span>
              <div className="nav-link-glow"></div>
            </Link>
            <Link to="/catalog" className="nav-link" onClick={handleLinkClick}>
              <span>Каталог</span>
              <div className="nav-link-glow"></div>
            </Link>
            <Link to="/catalog?onlyNew=true" className="nav-link" onClick={handleLinkClick}>
              <span>Новинки</span>
              <div className="nav-link-glow"></div>
            </Link>
            <Link to="/catalog?sortBy=price_desc" className="nav-link" onClick={handleLinkClick}>
              <span>Sale</span>
              <div className="nav-link-glow"></div>
            </Link>
          </nav>

          {/* Actions */}
          <div className="header-actions">
            <button className="icon-btn">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
              </svg>
            </button>

            <Link to="/cart" className="icon-btn cart-btn" onClick={handleLinkClick}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="9" cy="21" r="1"/>
                <circle cx="20" cy="21" r="1"/>
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
              </svg>
              {cartCount > 0 && (
                <span className="cart-badge">{cartCount}</span>
              )}
            </Link>

            <button 
              className="mobile-menu-btn" 
              onClick={() => setMobileMenu(!mobileMenu)}
              aria-label="Toggle menu"
            >
              <span></span>
              <span></span>
              <span></span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;