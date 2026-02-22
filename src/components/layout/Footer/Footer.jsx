import React from 'react';
import { Link } from 'react-router-dom';
import './Footer.css';

const Footer = () => {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-top">
          <div className="footer-brand">
            <Link to="/" className="footer-logo">
              <span className="logo-icon">◆</span>
              <span className="logo-text">LUXE</span>
            </Link>
            <p className="footer-description">
              Премиум интернет-магазин для тех, кто ценит качество, стиль и эксклюзивность.
            </p>
            <div className="footer-social">
              <a href="#" className="social-link" aria-label="Instagram">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" fill="var(--bg-primary)"/>
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" stroke="var(--bg-primary)" strokeWidth="2"/>
                </svg>
              </a>
              <a href="#" className="social-link" aria-label="Facebook">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
                </svg>
              </a>
              <a href="#" className="social-link" aria-label="Twitter">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"/>
                </svg>
              </a>
              <a href="#" className="social-link" aria-label="YouTube">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"/>
                  <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" fill="var(--bg-primary)"/>
                </svg>
              </a>
            </div>
          </div>

          <div className="footer-links">
            <div className="footer-column">
              <h4 className="footer-heading">Покупателям</h4>
              <ul className="footer-list">
                <li><Link to="/catalog">Каталог</Link></li>
                <li><Link to="/catalog?sale=true">Акции</Link></li>
                <li><Link to="/catalog?category=new">Новинки</Link></li>
                <li><Link to="/about">О нас</Link></li>
              </ul>
            </div>

            <div className="footer-column">
              <h4 className="footer-heading">Помощь</h4>
              <ul className="footer-list">
                <li><Link to="/delivery">Доставка</Link></li>
                <li><Link to="/payment">Оплата</Link></li>
                <li><Link to="/returns">Возврат</Link></li>
                <li><Link to="/faq">FAQ</Link></li>
              </ul>
            </div>

            <div className="footer-column">
              <h4 className="footer-heading">Контакты</h4>
              <ul className="footer-list">
                <li>
                  <a href="tel:+77001234567">+7 (700) 123-45-67</a>
                </li>
                <li>
                  <a href="mailto:info@luxe.com">info@luxe.com</a>
                </li>
                <li>Алматы, Казахстан</li>
                <li>Ежедневно 9:00 — 21:00</li>
              </ul>
            </div>

            <div className="footer-column">
              <h4 className="footer-heading">Подписка</h4>
              <p className="newsletter-description">
                Получайте эксклюзивные предложения и новости
              </p>
              <form className="newsletter-form">
                <input 
                  type="email" 
                  placeholder="Ваш email"
                  className="newsletter-input"
                />
                <button type="submit" className="newsletter-button">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="5" y1="12" x2="19" y2="12"/>
                    <polyline points="12 5 19 12 12 19"/>
                  </svg>
                </button>
              </form>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <p className="copyright">
            © 2026 LUXE. Все права защищены.
          </p>
          <div className="footer-legal">
            <Link to="/privacy">Политика конфиденциальности</Link>
            <Link to="/terms">Условия использования</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;