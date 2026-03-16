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
      
      // Маппинг реальных категорий на наши иконки
      const categoryMapping = [
        { 
          keyword: ['телефон', 'смартфон', 'мобильн'], 
          icon: '📱', 
          displayName: 'Смартфоны',
          color: '#B8860B'
        },
        { 
          keyword: ['ноутбук', 'laptop', 'компьютер'], 
          icon: '💻', 
          displayName: 'Ноутбуки',
          color: '#DAA520'
        },
        { 
          keyword: ['наушник', 'headphone', 'audio', 'колонк'], 
          icon: '🎧', 
          displayName: 'Наушники',
          color: '#B8860B'
        },
        { 
          keyword: ['кабел', 'зарядн', 'адаптер', 'аксессуар', 'чехол'], 
          icon: '🔌', 
          displayName: 'Аксессуары',
          color: '#DAA520'
        }
      ];

      // Находим соответствующие категории из API
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
          apiName: foundCategory?.name || null
        };
      }).filter(cat => cat.id !== null);

      setCategories(mappedCategories);
      
    } catch (error) {
      console.error('Error loading categories:', error);
      
      // Fallback - показываем категории без ID (перейдут на общий каталог)
      setCategories([
        { id: null, name: 'Смартфоны', icon: '📱', color: '#B8860B' },
        { id: null, name: 'Ноутбуки', icon: '💻', color: '#DAA520' },
        { id: null, name: 'Наушники', icon: '🎧', color: '#B8860B' },
        { id: null, name: 'Аксессуары', icon: '🔌', color: '#DAA520' }
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
      {/* Hero Section */}
      <section className="hero">
        <div className="container">
          <div className="hero-content">
            <h1 className="hero-title animate-fadeInUp">
              Премиум электроника
              <span className="gradient-text">от официального дилера</span>
            </h1>
            <p className="hero-subtitle animate-fadeInUp delay-1">
              Гарантия качества • Оригинальная продукция • Доставка по Алматы
            </p>
            <div className="hero-buttons animate-fadeInUp delay-2">
              <Link to="/catalog" className="btn btn-primary btn-lg">
                Перейти в каталог
              </Link>
              <Link to="/catalog?onlyNew=true" className="btn btn-secondary btn-lg">
                Новинки
              </Link>
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
            {categories.map((category, index) => (
              <Link 
                to={category.id ? `/catalog?category=${category.id}` : '/catalog'} 
                key={index}
                className={`category-card animate-fadeInScale stagger-${index + 1}`}
                style={{ '--category-color': category.color }}
              >
                <div className="category-icon">
                  {category.icon}
                </div>
                <h3 className="category-name">{category.name}</h3>
                {category.apiName && (
                  <p className="category-api-name">{category.apiName}</p>
                )}
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
            <h2 className="section-title">Новинки</h2>
            <Link to="/catalog?onlyNew=true" className="section-link">
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

      {/* Features */}
      <section className="features">
        <div className="container">
          <div className="features-grid">
            <div className="feature-card animate-fadeInUp">
              <div className="feature-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <h3 className="feature-title">Гарантия качества</h3>
              <p className="feature-text">
                Официальная гарантия от производителя на всю продукцию
              </p>
            </div>

            <div className="feature-card animate-fadeInUp delay-1">
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
                Доставка по Алматы в течение 1-2 дней
              </p>
            </div>

            <div className="feature-card animate-fadeInUp delay-2">
              <div className="feature-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              </div>
              <h3 className="feature-title">Поддержка 24/7</h3>
              <p className="feature-text">
                Профессиональная консультация в любое время
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}