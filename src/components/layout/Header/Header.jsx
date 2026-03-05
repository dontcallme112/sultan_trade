import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../../../context/CartContext';
import './Header.css';

const Header = () => {
  const { cartItems } = useCart();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <header className={`header ${scrolled ? 'scrolled' : ''}`}>
      <div className="header-bg"></div>
      
      <div className="container">
        <div className="header-content">
          {/* Logo */}
          <Link to="/" className="logo">
            <div className="logo-icon">⚡</div>
            <span className="logo-text">LUXE</span>
            <div className="logo-glow"></div>
          </Link>

          {/* Navigation */}
          <nav className={`nav ${mobileMenu ? 'active' : ''}`}>
            <Link to="/" className="nav-link">
              <span>Главная</span>
              <div className="nav-link-glow"></div>
            </Link>
            <Link to="/catalog" className="nav-link">
              <span>Каталог</span>
              <div className="nav-link-glow"></div>
            </Link>
            <Link to="/catalog" className="nav-link">
              <span>Новинки</span>
              <div className="nav-link-glow"></div>
            </Link>
            <Link to="/catalog" className="nav-link">
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

            <Link to="/cart" className="icon-btn cart-btn">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="9" cy="21" r="1"/>
                <circle cx="20" cy="21" r="1"/>
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
              </svg>
              {cartCount > 0 && (
                <span className="cart-badge">{cartCount}</span>
              )}
            </Link>

            <button className="mobile-menu-btn" onClick={() => setMobileMenu(!mobileMenu)}>
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