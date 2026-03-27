import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BACKEND_URL } from '../../api/client';
import ProductCard from '../../components/features/ProductCard/ProductCard';
import './Home.css';

const CATEGORY_GROUPS = [
  { id: 'phones',      keywords: ['мобильн', 'телефон', 'смартфон', 'планшет', 'iphone', 'ipad', 'защитн', 'стёкла', 'плёнк', 'чехол для планшет', 'портативн зарядн'] },
  { id: 'computers',   keywords: ['ноутбук', 'laptop', 'системн блок', 'моноблок', 'мини пк', 'компьютер', 'комплектующ', 'процессор', 'cpu', 'материнск', 'mb', 'видеокарт', 'vga', 'оперативн памят', 'ddr3', 'ddr4', 'ddr5', 'озу', 'жёстк диск', 'hdd', 'твердотельн', 'ssd', 'портативн диск', 'корпус', 'блок питани', 'охлаждени', 'вентилятор', 'термопаст', 'программн обеспечени', 'охлаждающ подставк', 'сумк'] },
  { id: 'peripherals', keywords: ['клавиатур', 'keyboard', 'мышь', 'мыши', 'mouse', 'беспроводн комплект', 'проводн комплект', 'монитор', 'дисплей', 'кронштейн для монитор', 'веб камер', 'расширител usb', 'адаптер', 'контроллер', 'устройств ввод', 'устройств чтени', 'принтер', 'сканер', 'мфу'] },
  { id: 'network',     keywords: ['сетев', 'роутер', 'маршрутизатор', 'коммутатор', 'switch', 'wifi', 'wi-fi', 'беспроводн сет', 'сервер', 'nas', 'rack', 'патч', 'кабель rj', 'sfp'] },
  { id: 'audio',       keywords: ['наушник', 'headphone', 'headset', 'колонк', 'акустик', 'speaker', 'микрофон', 'звуков', 'аудио', 'гарнитур'] },
  { id: 'tv_media',    keywords: ['телевизор', 'тв', 'tv', 'проектор', 'медиаплеер', 'стриминг', 'кронштейн для тв', 'антенн'] },
  { id: 'photo_video', keywords: ['камер', 'фотоаппарат', 'объектив', 'штатив', 'экшн', 'action', 'gopro', 'видеокамер', 'дрон', 'квадрокоптер'] },
  { id: 'gaming',      keywords: ['игров', 'game', 'gaming', 'консол', 'playstation', 'xbox', 'nintendo', 'джойстик', 'геймпад', 'руль игров'] },
  { id: 'wearables',   keywords: ['смарт час', 'smart watch', 'фитнес браслет', 'браслет', 'умн', 'smart home', 'умный дом'] },
  { id: 'cables_power',keywords: ['кабел', 'провод', 'шнур', 'зарядн устройств', 'зарядк', 'сетевой фильтр', 'удлинитель', 'ибп', 'ups', 'переходник', 'разветвитель'] },
  { id: 'office',      keywords: ['принтер', 'сканер', 'мфу', 'копир', 'картридж', 'тонер', 'чернил', 'бумаг', 'ламинатор', 'уничтожитель', 'офисн', 'канцелярск'] },
  { id: 'storage',     keywords: ['флешк', 'flash', 'usb накопитель', 'карт памят', 'sd card', 'microsd', 'оптическ диск', 'dvd', 'blu-ray'] },
];

const HOME_CATEGORIES = [
  { groupId: 'phones',      icon: '📱', displayName: 'Телефоны и планшеты',    color: '#B8860B', gradient: 'linear-gradient(135deg, #B8860B 0%, #DAA520 100%)' },
  { groupId: 'computers',   icon: '💻', displayName: 'Компьютеры и ноутбуки',  color: '#1E6B9E', gradient: 'linear-gradient(135deg, #1E6B9E 0%, #2E9ED6 100%)' },
  { groupId: 'peripherals', icon: '⌨️', displayName: 'Периферия',              color: '#7B3FA0', gradient: 'linear-gradient(135deg, #7B3FA0 0%, #A855F7 100%)' },
  { groupId: 'audio',       icon: '🎧', displayName: 'Аудио и акустика',       color: '#0F766E', gradient: 'linear-gradient(135deg, #0F766E 0%, #14B8A6 100%)' },
  { groupId: 'gaming',      icon: '🎮', displayName: 'Игры и консоли',         color: '#B91C1C', gradient: 'linear-gradient(135deg, #B91C1C 0%, #EF4444 100%)' },
  { groupId: 'tv_media',    icon: '📺', displayName: 'ТВ и медиа',             color: '#92400E', gradient: 'linear-gradient(135deg, #92400E 0%, #D97706 100%)' },
  { groupId: 'network',     icon: '🌐', displayName: 'Сеть и серверы',         color: '#065F46', gradient: 'linear-gradient(135deg, #065F46 0%, #10B981 100%)' },
  { groupId: 'wearables',   icon: '⌚', displayName: 'Умные устройства',       color: '#1E40AF', gradient: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)' },
];

function getGroupId(categoryName) {
  const name = categoryName.toLowerCase();
  for (const group of CATEGORY_GROUPS) {
    if (group.keywords.some(kw => name.includes(kw))) return group.id;
  }
  return 'other';
}

export default function Home() {
  const [categories, setCategories]         = useState([]);
  const [popularProducts, setPopularProducts] = useState([]);
  const [newProducts, setNewProducts]       = useState([]);
  const [loadingPopular, setLoadingPopular] = useState(true);
  const [loadingNew, setLoadingNew]         = useState(true);

  useEffect(() => {
    loadCategories();
    // Грузим обе секции параллельно
    loadPopularProducts();
    loadNewProducts();
  }, []);

  const loadCategories = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/categories`);
      let data = await response.json();
      if (!Array.isArray(data)) {
        if (data?.data && Array.isArray(data.data)) data = data.data;
        else data = [];
      }
      const grouped = {};
      data.filter(cat => cat.elements > 0).forEach(cat => {
        const groupId = getGroupId(cat.name);
        if (!grouped[groupId]) grouped[groupId] = { count: 0, categoryIds: [] };
        grouped[groupId].count += cat.elements;
        grouped[groupId].categoryIds.push(cat.id.toString());
      });
      const mapped = HOME_CATEGORIES.map(cat => ({
        ...cat,
        categoryIds: grouped[cat.groupId]?.categoryIds || [],
        count: grouped[cat.groupId]?.count || 0,
      })).filter(cat => cat.count > 0);
      setCategories(mapped);
    } catch (error) {
      setCategories(HOME_CATEGORIES.map(c => ({ ...c, categoryIds: [], count: 0 })));
    }
  };

  // Популярные — дорогие первыми (телефоны, ноутбуки)
  const loadPopularProducts = async () => {
    try {
      setLoadingPopular(true);
      const response = await fetch(`${BACKEND_URL}/api/products?limit=8&offset=0&sortBy=price_desc`);
      const data = await response.json();
      setPopularProducts(data.elements || []);
    } catch {
      setPopularProducts([]);
    } finally {
      setLoadingPopular(false);
    }
  };

  // Новинки — isnew=1
  const loadNewProducts = async () => {
    try {
      setLoadingNew(true);
      const response = await fetch(`${BACKEND_URL}/api/products?limit=8&offset=0&onlyNew=true`);
      const data = await response.json();
      setNewProducts(data.elements || []);
    } catch {
      setNewProducts([]);
    } finally {
      setLoadingNew(false);
    }
  };

  const buildCatalogUrl = (cat) => {
    if (!cat.categoryIds || cat.categoryIds.length === 0) return '/catalog';
    const params = new URLSearchParams();
    params.set('group', cat.groupId);
    cat.categoryIds.forEach(id => params.append('category', id));
    return `/products?${params.toString()}`;
  };

  const ProductsSection = ({ title, subtitle, products, loading, linkTo, linkLabel }) => (
    <section className="featured-products">
      <div className="container">
        <div className="section-header">
          <h2 className="section-title">
            <span className="title-decoration">━━</span>
            {title}
            <span className="title-decoration">━━</span>
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {subtitle && <span style={{ fontSize: 13, color: '#555' }}>{subtitle}</span>}
            <Link to={linkTo} className="section-link">
              {linkLabel}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="products-loading">
            <div className="loader"></div>
            <p>Загрузка товаров...</p>
          </div>
        ) : (
          <div className="products-grid">
            {products.slice(0, 8).map((product) => (
              <ProductCard key={product.article} product={product} />
            ))}
          </div>
        )}
      </div>
    </section>
  );

  return (
    <div className="home-page">

      {/* ── Hero ── */}
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
              Официальный дилер
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
            </div>

            <div className="hero-stats">
              <div className="stat">
                <div className="stat-value">12 000+</div>
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

      {/* ── Категории ── */}
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
                to={buildCatalogUrl(category)}
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
                <h3 className="category-name">{category.displayName}</h3>
                {category.count > 0 && (
                  <p className="category-description">{category.count.toLocaleString('ru-RU')} товаров</p>
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

      {/* ── Популярные товары ── */}
      <ProductsSection
        title="Популярные товары"
        products={popularProducts}
        loading={loadingPopular}
        linkTo="/products?sortBy=price_desc"
        linkLabel="Все товары"
      />

      {/* ── Новинки ── */}
      <ProductsSection
        title="Новинки"
        products={newProducts}
        loading={loadingNew}
        linkTo="/new"
        linkLabel="Все новинки"
      />

      {/* ── Преимущества ── */}
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
              <p className="feature-text">Официальная гарантия от производителя на всю продукцию. Проверка при получении.</p>
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
              <p className="feature-text">Доставка по Алматы в течение 1-2 дней. Бесплатно от 50 000 ₸.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              </div>
              <h3 className="feature-title">Поддержка 24/7</h3>
              <p className="feature-text">Профессиональная консультация в любое время. Всегда на связи.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="cta-section">
        <div className="cta-background">
          <div className="cta-gradient"></div>
        </div>
        <div className="container">
          <div className="cta-content">
            <h2 className="cta-title">Готовы начать покупки?</h2>
            <p className="cta-subtitle">Более 12 000 товаров от официальных поставщиков с доставкой по Алматы</p>
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