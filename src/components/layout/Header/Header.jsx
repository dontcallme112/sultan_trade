import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useCart } from '../../../context/CartContext';
import { useAuth } from '../../../context/AuthContext';
import SearchBar from '../../features/SearchBar/SearchBar';
import AuthModal from '../../features/AuthModal/AuthModal';
import './Header.css';

const Header = () => {
  const { cartItems } = useCart();
  const { isAuthenticated, profile, user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setMobileMenu(false);
    setShowSearch(false);
  }, [location]);

  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const handleLinkClick = () => setMobileMenu(false);
  const toggleSearch = () => setShowSearch(!showSearch);

  const avatarLetter = (
    profile?.full_name?.[0] ||
    user?.user_metadata?.full_name?.[0] ||
    user?.email?.[0] ||
    'U'
  ).toUpperCase();

  const avatarUrl = profile?.avatar_url || user?.user_metadata?.avatar_url;

  return (
    <>
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

            {/* Navigation — Sale убран */}
            <nav className={`nav ${mobileMenu ? 'active' : ''}`}>
              <Link to="/" className="nav-link" onClick={handleLinkClick}>
                <span>Главная</span>
                <div className="nav-link-glow"></div>
              </Link>
              <Link to="/catalog" className="nav-link" onClick={handleLinkClick}>
                <span>Каталог</span>
                <div className="nav-link-glow"></div>
              </Link>
              <Link to="/new" className="nav-link" onClick={handleLinkClick}>
                <span>Новинки</span>
                <div className="nav-link-glow"></div>
              </Link>
              <Link to="/products" className="nav-link" onClick={handleLinkClick}>
                <span>Товары</span>
                <div className="nav-link-glow"></div>
              </Link>
            </nav>

            {/* Search Bar - Desktop */}
            <div className="header-search-desktop">
              <SearchBar />
            </div>

            {/* Actions */}
            <div className="header-actions">
              <button
                className={`icon-btn search-toggle ${showSearch ? 'active' : ''}`}
                onClick={toggleSearch}
                aria-label="Toggle search"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="m21 21-4.35-4.35"/>
                </svg>
              </button>

              {isAuthenticated ? (
                <Link to="/profile" className="icon-btn auth-avatar-btn hide-mobile" onClick={handleLinkClick} title="Личный кабинет">
                  {avatarUrl
                    ? <img src={avatarUrl} alt="avatar" className="header-avatar-img" />
                    : <span className="header-avatar-letter">{avatarLetter}</span>
                  }
                </Link>
              ) : (
                <button
                  className="icon-btn auth-login-btn hide-mobile"
                  onClick={() => setShowAuthModal(true)}
                  aria-label="Войти"
                  title="Войти"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                </button>
              )}

              <Link to="/cart" className="icon-btn cart-btn hide-mobile" onClick={handleLinkClick}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="9" cy="21" r="1"/>
                  <circle cx="20" cy="21" r="1"/>
                  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
                </svg>
                {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
              </Link>

              <button
                className="mobile-menu-btn hide-mobile"
                onClick={() => setMobileMenu(!mobileMenu)}
                aria-label="Toggle menu"
              >
                <span></span><span></span><span></span>
              </button>
            </div>
          </div>

          {showSearch && (
            <div className="header-search-mobile">
              <SearchBar />
            </div>
          )}
        </div>
      </header>

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </>
  );
};

export default Header;