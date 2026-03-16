import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BACKEND_URL } from '../../api/client';
import ProductCard from '../../components/features/ProductCard/ProductCard';
import './Home.css';

export default function Home() {
  const [categories, setCategories] = useState([]);
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCategories();
    loadFeaturedProducts();
  }, []);

  const loadCategories = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/categories`);
      const data = await response.json();
      
      const categoryMapping = [
        { 
          keyword: ['телефон', 'смартфон', 'мобильн'], 
          icon: '📱', 
          displayName: 'Смартфоны',
          color: '#B8860B',
          gradient: 'linear-gradient(135deg, #B8860B 0%, #DAA520 100%)'
        },
        { 
          keyword: ['ноутбук', 'laptop', 'компьютер'], 
          icon: '💻', 
          displayName: 'Ноутбуки',
          color: '#8B4513',
          gradient: 'linear-gradient(135deg, #8B4513 0%, #D2691E 100%)'
        },
        { 
          keyword: ['наушник', 'headphone', 'audio', 'колонк'], 
          icon: '🎧', 
          displayName: 'Наушники',
          color: '#4169E1',
          gradient: 'linear-gradient(135deg, #4169E1 0%, #1E90FF 100%)'
        },
        { 
          keyword: ['кабел', 'зарядн', 'адаптер', 'аксессуар', 'чехол'], 
          icon: '🔌', 
          displayName: 'Аксессуары',
          color: '#32CD32',
          gradient: 'linear-gradient(135deg, #32CD32 0%, #00FA9A 100%)'
        }
      ];

      const mappedCategories = categoryMapping.map(mapping => {
        const foundCategory = data.find(cat => 
          mapping.keyword.some(keyword => 
            cat.name.toLowerCase().includes(keyword)
          )
        );

        return {
          id: foundCategory?.id || null,
          name: mapping.displayName,
          icon: mapping.icon,
          color: mapping.color,
          gradient: mapping.gradient,
          apiName: foundCategory?.name || null
        };
      });

      setCategories(mappedCategories);
      
    } catch (error) {
      console.error('Error loading categories:', error);
      setCategories([
        { id: null, name: 'Смартфоны', icon: '📱', color: '#B8860B', gradient: 'linear-gradient(135deg, #B8860B 0%, #DAA520 100%)' },
        { id: null, name: 'Ноутбуки', icon: '💻', color: '#8B4513', gradient: 'linear-gradient(135deg, #8B4513 0%, #D2691E 100%)' },
        { id: null, name: 'Наушники', icon: '🎧', color: '#4169E1', gradient: 'linear-gradient(135deg, #4169E1 0%, #1E90FF 100%)' },
        { id: null, name: 'Аксессуары', icon: '🔌', color: '#32CD32', gradient: 'linear-gradient(135deg, #32CD32 0%, #00FA9A 100%)' }
      ]);
    }
  };

  const loadFeaturedProducts = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${BACKEND_URL}/api/products?limit=8&offset=0&onlyNew=true`);
      const data = await response.json();
      setFeaturedProducts(data.elements || []);
    } catch (error) {
      console.error('Error loading products:', error);
      setFeaturedProducts([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="home-page">
      {/* Hero Section - Премиум */}
      <section className="hero">
        <div className="hero-background">
          <div className="hero-gradient"></div>
          <div className="hero-shapes">
            <div className="shape shape-1"></div>
            <div className="shape shape-2"></div>
            <div className="shape shape-3"></div>
          </div>
        </div>

        <div className="container">
          <div className="hero-content">
            <div className="hero-badge">
              <span className="badge-dot"></span>
              Premium Electronics
            </div>

            <h1 className="hero-title">
              <span className="title-line">Премиум</span>
              <span className="title-line gradient-text">электроника</span>
              <span className="title-line">от официального дилера</span>
            </h1>

            <div className="hero-features">
              <div className="hero-feature">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
                <span>Гарантия качества</span>
              </div>
              <div className="hero-feature">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
                <span>Оригинальная продукция</span>
              </div>
              <div className="hero-feature">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="1" y="3" width="15" height="13"/>
                  <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
                  <circle cx="5.5" cy="18.5" r="2.5"/>
                  <circle cx="18.5" cy="18.5" r="2.5"/>
                </svg>
                <span>Доставка по Алматы</span>
              </div>
            </div>

            <div className="hero-buttons">
              <Link to="/catalog" className="btn btn-primary btn-hero">
                <span>Перейти в каталог</span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </Link>
              <Link to="/new" className="btn btn-secondary btn-hero">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
                <span>Новинки</span>
              </Link>
            </div>

            <div className="hero-stats">
              <div className="stat">
                <div className="stat-value">1000+</div>
                <div className="stat-label">Товаров</div>
              </div>
              <div className="stat">
                <div className="stat-value">50+</div>
                <div className="stat-label">Брендов</div>
              </div>
              <div className="stat">
                <div className="stat-value">24/7</div>
                <div className="stat-label">Поддержка</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Categories Section - Улучшенная */}
      <section className="categories">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">
              <span className="title-decoration">━━</span>
              Категории товаров
              <span className="title-decoration">━━</span>
            </h2>
            <p className="section-subtitle">Выберите интересующую вас категорию</p>
          </div>

          <div className="categories-grid">
            {categories.map((category, index) => (
              <Link 
                to={category.id ? `/catalog?category=${category.id}` : '/catalog'} 
                key={index}
                className="category-card"
                style={{ 
                  '--category-color': category.color,
                  '--category-gradient': category.gradient,
                  '--animation-delay': `${index * 0.1}s`
                }}
              >
                <div className="category-glow"></div>
                <div className="category-icon-wrapper">
                  <div className="category-icon">{category.icon}</div>
                </div>
                <h3 className="category-name">{category.name}</h3>
                {category.apiName && (
                  <p className="category-description">{category.apiName}</p>
                )}
                <div className="category-arrow">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Products - Новинки */}
      <section className="featured-products">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">
              <span className="title-decoration">━━</span>
              Новинки
              <span className="title-decoration">━━</span>
            </h2>
            <Link to="/new" className="section-link">
              Все новинки
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </Link>
          </div>

          {loading ? (
            <div className="products-loading">
              <div className="loader"></div>
              <p>Загрузка товаров...</p>
            </div>
          ) : (
            <div className="products-grid">
              {featuredProducts.slice(0, 8).map((product) => (
                <ProductCard key={product.article} product={product} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Features - Преимущества */}
      <section className="features">
        <div className="container">
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <h3 className="feature-title">Гарантия качества</h3>
              <p className="feature-text">
                Официальная гарантия от производителя на всю продукцию. Проверка при получении.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="1" y="3" width="15" height="13"/>
                  <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
                  <circle cx="5.5" cy="18.5" r="2.5"/>
                  <circle cx="18.5" cy="18.5" r="2.5"/>
                </svg>
              </div>
              <h3 className="feature-title">Быстрая доставка</h3>
              <p className="feature-text">
                Доставка по Алматы в течение 1-2 дней. Бесплатно от 50 000 ₸.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              </div>
              <h3 className="feature-title">Поддержка 24/7</h3>
              <p className="feature-text">
                Профессиональная консультация в любое время. Всегда на связи.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section - Призыв к действию */}
      <section className="cta-section">
        <div className="cta-background">
          <div className="cta-gradient"></div>
        </div>
        <div className="container">
          <div className="cta-content">
            <h2 className="cta-title">Готовы начать покупки?</h2>
            <p className="cta-subtitle">
              Более 1000 товаров от ведущих мировых брендов с доставкой по Казахстану
            </p>
            <Link to="/catalog" className="btn btn-primary btn-lg">
              Перейти в каталог
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
} 