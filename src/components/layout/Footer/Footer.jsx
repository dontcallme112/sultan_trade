import React from 'react';
import { Link } from 'react-router-dom';
import './Footer.css';

const Footer = () => {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-top">

          {/* Brand */}
          <div className="footer-brand">
            <Link to="/" className="footer-logo">
              <svg width="32" height="32" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="40" height="40" rx="10" fill="#1a1a1a"/>
                <path d="M26 13H17a3 3 0 0 0-3 3v3a3 3 0 0 0 3 3h6a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3H14"
                      stroke="#DAA520" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
              <span className="footer-logo-text"><span>S</span>tockera</span>
            </Link>
            <p className="footer-description">
              Официальный дилер электроники в Алматы. Более 12 000 товаров с гарантией и доставкой.
            </p>
            <div className="footer-social">
              <a href="#" className="social-link" aria-label="Instagram">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" fill="#111"/>
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" stroke="#111" strokeWidth="2"/>
                </svg>
              </a>
              <a href="#" className="social-link" aria-label="Facebook">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
                </svg>
              </a>
              <a href="#" className="social-link" aria-label="Telegram">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M21.198 2.433a2.242 2.242 0 0 0-1.022.215l-16.5 7.5a2.25 2.25 0 0 0 .126 4.17l3.701 1.27 1.498 4.953a.75.75 0 0 0 1.3.258l2.017-2.5 3.93 2.934a2.25 2.25 0 0 0 3.496-1.467l2.5-15.75a2.25 2.25 0 0 0-2.046-2.583z"/>
                </svg>
              </a>
            </div>
          </div>

          {/* Links */}
          <div className="footer-links">
            <div className="footer-column">
              <h4 className="footer-heading">Покупателям</h4>
              <ul className="footer-list">
                <li><Link to="/catalog">Каталог</Link></li>
                <li><Link to="/new">Новинки</Link></li>
                <li><Link to="/products">Все товары</Link></li>
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
                <li><a href="tel:+77082124717">+7 (708) 212-47-17</a></li>
                <li><a href="tel:+77754886211">+7 (775) 488-62-11</a></li>
                <li><a href="tel:+77017703905">+7 (701) 770-39-05</a></li>
                <li><a href="tel:+77084592131">+7 (708) 459-21-31</a></li>
                <li><a href="mailto:info@stockeratrade.com">info@stockeratrade.com</a></li>
                <li>Алматы, Казахстан</li>
                <li>Ежедневно 9:00 — 21:00</li>
              </ul>
            </div>

            <div className="footer-column">
              <h4 className="footer-heading">Подписка</h4>
              <p className="newsletter-description">
                Получайте эксклюзивные предложения и новости
              </p>
              <div className="newsletter-form">
                <input
                  type="email"
                  placeholder="Ваш email"
                  className="newsletter-input"
                  aria-label="Email для подписки"
                />
                <button className="newsletter-button" aria-label="Подписаться">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="5" y1="12" x2="19" y2="12"/>
                    <polyline points="12 5 19 12 12 19"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <p className="copyright">© 2026 Stockera. Все права защищены.</p>
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