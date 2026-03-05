import React from 'react';
import { Link } from 'react-router-dom';
import { useProducts } from '../../hooks/useProducts';
import ProductCard from '../../components/features/ProductCard/ProductCard';
import './Home.css';

const Home = () => {
  const { products, loading } = useProducts({ limit: 8 });

  return (
    <div className="home">
      {/* Hero Section */}
      <section className="hero">
        <div className="hero-background">
          <div className="hero-glow"></div>
        </div>
        
        <div className="container hero-content">
          <div className="hero-text animate-fadeInUp">
            <span className="hero-badge">🔥 Новинки 2026</span>
            <h1 className="hero-title">
              Премиум электроника
              <br />
              <span className="text-gradient">для вас</span>
            </h1>
            <p className="hero-description">
              Смартфоны, ноутбуки, наушники от мировых брендов.
              Официальная гарантия, быстрая доставка по Казахстану
            </p>
            <div className="hero-actions">
              <Link to="/catalog" className="btn-primary">
                Смотреть каталог
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="5" y1="12" x2="19" y2="12"/>
                  <polyline points="12 5 19 12 12 19"/>
                </svg>
              </Link>
              <Link to="/catalog" className="btn-secondary">
                Хиты продаж
              </Link>
            </div>
          </div>

          <div className="hero-stats animate-fadeInUp stagger-2">
            <div className="stat-item">
              <div className="stat-number">10K+</div>
              <div className="stat-label">Товаров в наличии</div>
            </div>
            <div className="stat-divider"></div>
            <div className="stat-item">
              <div className="stat-number">100+</div>
              <div className="stat-label">Брендов</div>
            </div>
            <div className="stat-divider"></div>
            <div className="stat-item">
              <div className="stat-number">4.9</div>
              <div className="stat-label">Рейтинг магазина</div>
            </div>
          </div>
        </div>
      </section>

      {/* Categories Section */}
      <section className="categories">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">Категории товаров</h2>
            <Link to="/catalog" className="section-link">
              Весь каталог
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </Link>
          </div>

          <div className="categories-grid">
            {[
              { name: 'Смартфоны', icon: '📱', slug: 'smartphones' },
              { name: 'Ноутбуки', icon: '💻', slug: 'laptops' },
              { name: 'Наушники', icon: '🎧', slug: 'headphones' },
              { name: 'Аксессуары', icon: '🔌', slug: 'accessories' }
            ].map((category, index) => (
              <Link 
                to={`/catalog`} 
                key={category.slug}
                className={`category-card animate-fadeInScale stagger-${index + 1}`}
              >
                <div className="category-icon">
                  {category.icon}
                </div>
                <h3 className="category-name">{category.name}</h3>
                <span className="category-arrow">→</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Products */}
      <section className="featured-products">
        <div className="container">
          <div className="section-header">
            <div>
              <h2 className="section-title">Хиты продаж</h2>
              <p className="section-subtitle">Самые популярные товары месяца</p>
            </div>
            <Link to="/catalog" className="section-link">
              Смотреть все
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </Link>
          </div>

          {loading ? (
            <div className="products-grid">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="product-skeleton">
                  <div className="skeleton" style={{ paddingTop: '125%' }}></div>
                  <div style={{ padding: 'var(--space-lg)' }}>
                    <div className="skeleton" style={{ height: '12px', width: '40%', marginBottom: '8px' }}></div>
                    <div className="skeleton" style={{ height: '20px', width: '80%', marginBottom: '8px' }}></div>
                    <div className="skeleton" style={{ height: '24px', width: '30%' }}></div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="products-grid">
              {products.map((product, index) => (
                <div key={product.id} className={`animate-fadeInUp stagger-${(index % 4) + 1}`}>
                  <ProductCard product={product} />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Features Section */}
      <section className="features">
        <div className="container">
          <div className="features-grid">
            <div className="feature-item animate-fadeInUp stagger-1">
              <div className="feature-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                  <polyline points="9 22 9 12 15 12 15 22"/>
                </svg>
              </div>
              <h3 className="feature-title">Быстрая доставка</h3>
              <p className="feature-description">1-2 дня по Алматы и Астане</p>
            </div>

            <div className="feature-item animate-fadeInUp stagger-2">
              <div className="feature-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
              </div>
              <h3 className="feature-title">Официальная гарантия</h3>
              <p className="feature-description">12 месяцев на всю технику</p>
            </div>

            <div className="feature-item animate-fadeInUp stagger-3">
              <div className="feature-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <h3 className="feature-title">100% оригинал</h3>
              <p className="feature-description">Только оригинальная техника от производителей</p>
            </div>

            <div className="feature-item animate-fadeInUp stagger-4">
              <div className="feature-icon">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <h3 className="feature-title">Поддержка 24/7</h3>
              <p className="feature-description">Консультация по выбору техники</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;