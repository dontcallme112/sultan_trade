import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useProduct } from '../../hooks/useProduct';
import { useCart } from '../../context/CartContext';
import './Product.css';
import Price from '../../components/common/Price/price.jsx';
import './Product.css';

const Product = () => {
  const { id } = useParams();
  const { product, loading, error } = useProduct(id);
  const { addToCart } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [selectedImage, setSelectedImage] = useState(0);
  const [activeTab, setActiveTab] = useState('description');

  if (loading) {
    return (
      <div className="product-page">
        <div className="container">
          <div className="product-detail-skeleton">
            <div className="skeleton" style={{ height: '600px' }}></div>
            <div style={{ flex: 1 }}>
              <div className="skeleton" style={{ height: '40px', width: '60%', marginBottom: '16px' }}></div>
              <div className="skeleton" style={{ height: '32px', width: '30%', marginBottom: '24px' }}></div>
              <div className="skeleton" style={{ height: '120px', marginBottom: '24px' }}></div>
              <div className="skeleton" style={{ height: '56px', width: '200px' }}></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="product-page">
        <div className="container">
          <div className="error-state">
            <h2>Товар не найден</h2>
            <p>К сожалению, запрашиваемый товар не существует</p>
            <Link to="/catalog" className="btn-primary">
              Вернуться в каталог
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const handleAddToCart = () => {
    for (let i = 0; i < quantity; i++) {
      addToCart(product);
    }
  };

  const incrementQuantity = () => setQuantity(prev => prev + 1);
  const decrementQuantity = () => setQuantity(prev => Math.max(1, prev - 1));

  // Имитация нескольких изображений (в реальном API их может быть несколько)
  const images = [product.image, product.image, product.image];

  return (
    <div className="product-page">
      <div className="container">
        {/* Breadcrumbs */}
        <nav className="breadcrumbs animate-fadeIn">
          <Link to="/">Главная</Link>
          <span className="separator">→</span>
          <Link to="/catalog">Каталог</Link>
          <span className="separator">→</span>
          <span className="current">{product.title}</span>
        </nav>

        {/* Product Detail */}
        <div className="product-detail">
          {/* Image Gallery */}
          <div className="product-gallery animate-fadeInScale">
            <div className="main-image-wrapper">
              <img 
                src={images[selectedImage]} 
                alt={product.title}
                className="main-image"
              />
              <button className="wishlist-btn" aria-label="Добавить в избранное">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
              </button>
            </div>

            <div className="thumbnails">
              {images.map((img, index) => (
                <button
                  key={index}
                  className={`thumbnail ${selectedImage === index ? 'active' : ''}`}
                  onClick={() => setSelectedImage(index)}
                >
                  <img src={img} alt={`${product.title} ${index + 1}`} />
                </button>
              ))}
            </div>
          </div>

          {/* Product Info */}
          <div className="product-info-section animate-fadeInUp">
            <div className="product-category-badge">{product.category}</div>
            
            <h1 className="product-title-large">{product.title}</h1>

            {product.rating && (
              <div className="product-rating-large">
                <div className="stars">
                  {[...Array(5)].map((_, i) => (
                    <span 
                      key={i} 
                      className={`star ${i < Math.floor(product.rating.rate) ? 'filled' : ''}`}
                    >
                      ★
                    </span>
                  ))}
                </div>
                <span className="rating-text">
                  {product.rating.rate} ({product.rating.count} отзывов)
                </span>
              </div>
            )}

            <div className="price-section">
              <Price 
                value={product.price}
                size="large"
                showCurrency={true}
              />
              <div className="stock-status in-stock">
                <span className="status-dot"></span>
                В наличии
              </div>
            </div>

            <p className="product-description-short">
              {product.description}
            </p>

            {/* Quantity & Add to Cart */}
            <div className="purchase-section">
              <div className="quantity-selector">
                <button 
                  className="qty-btn"
                  onClick={decrementQuantity}
                  aria-label="Уменьшить количество"
                >
                  −
                </button>
                <input 
                  type="number" 
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="qty-input"
                  min="1"
                />
                <button 
                  className="qty-btn"
                  onClick={incrementQuantity}
                  aria-label="Увеличить количество"
                >
                  +
                </button>
              </div>

              <button className="add-to-cart-large" onClick={handleAddToCart}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
                  <line x1="3" y1="6" x2="21" y2="6"/>
                  <path d="M16 10a4 4 0 0 1-8 0"/>
                </svg>
                Добавить в корзину
              </button>
            </div>

            {/* Product Features */}
            <div className="product-features">
              <div className="feature-item">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                </svg>
                <div>
                  <strong>Быстрая доставка</strong>
                  <p>1-2 дня по городу</p>
                </div>
              </div>
              <div className="feature-item">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
                <div>
                  <strong>Гарантия качества</strong>
                  <p>100% оригинал</p>
                </div>
              </div>
              <div className="feature-item">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="1 4 1 10 7 10"/>
                  <polyline points="23 20 23 14 17 14"/>
                  <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
                </svg>
                <div>
                  <strong>Легкий возврат</strong>
                  <p>14 дней на возврат</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs Section */}
        <div className="product-tabs">
          <div className="tabs-header">
            <button 
              className={`tab ${activeTab === 'description' ? 'active' : ''}`}
              onClick={() => setActiveTab('description')}
            >
              Описание
            </button>
            <button 
              className={`tab ${activeTab === 'specs' ? 'active' : ''}`}
              onClick={() => setActiveTab('specs')}
            >
              Характеристики
            </button>
            <button 
              className={`tab ${activeTab === 'reviews' ? 'active' : ''}`}
              onClick={() => setActiveTab('reviews')}
            >
              Отзывы ({product.rating?.count || 0})
            </button>
          </div>

          <div className="tabs-content">
            {activeTab === 'description' && (
              <div className="tab-panel animate-fadeIn">
                <h3>О товаре</h3>
                <p>{product.description}</p>
                <p>
                  Этот товар отличается высоким качеством исполнения и премиальными материалами. 
                  Идеально подходит для тех, кто ценит стиль и функциональность.
                </p>
              </div>
            )}

            {activeTab === 'specs' && (
              <div className="tab-panel animate-fadeIn">
                <h3>Характеристики</h3>
                <table className="specs-table">
                  <tbody>
                    <tr>
                      <td>Категория</td>
                      <td>{product.category}</td>
                    </tr>
                    <tr>
                      <td>ID товара</td>
                      <td>#{product.id}</td>
                    </tr>
                    <tr>
                      <td>Рейтинг</td>
                      <td>{product.rating?.rate || 'N/A'} / 5</td>
                    </tr>
                    <tr>
                      <td>Наличие</td>
                      <td>В наличии</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'reviews' && (
              <div className="tab-panel animate-fadeIn">
                <h3>Отзывы покупателей</h3>
                <div className="reviews-summary">
                  <div className="rating-overview">
                    <div className="rating-number">{product.rating?.rate || 0}</div>
                    <div className="stars">
                      {[...Array(5)].map((_, i) => (
                        <span 
                          key={i} 
                          className={`star ${i < Math.floor(product.rating?.rate || 0) ? 'filled' : ''}`}
                        >
                          ★
                        </span>
                      ))}
                    </div>
                    <p>{product.rating?.count || 0} отзывов</p>
                  </div>
                </div>
                <p className="no-reviews">Отзывы скоро появятся</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Product;