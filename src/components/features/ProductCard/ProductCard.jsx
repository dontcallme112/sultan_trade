import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../../../context/CartContext';
import './ProductCard.css';

export default function ProductCard({ product, onClick }) {
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);

  const handleClick = (e) => {
    // Если клик не на кнопку "В корзину"
    if (!e.target.closest('.add-to-cart-btn')) {
      if (onClick) {
        onClick(product);
      } else {
        navigate(`/product/${product.article || product.id}`);
      }
    }
  };

  const handleAddToCart = (e) => {
    e.stopPropagation();
    
    // Добавляем в корзину через CartContext
    addToCart({
      id: product.id || product.article,
      article: product.article,
      name: product.name || product.title,
      price: product.priceWithMarkup || product.price,
      image: product.image || product.images?.[0],
    });

    // Анимация добавления
    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 2000);
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat('ru-RU').format(price);
  };

  return (
    <article className="product-card" onClick={handleClick}>
      {/* Бейдж "Новинка" */}
      {product.isNew && (
        <div className="product-badge new-badge">Новинка</div>
      )}

      {/* Бейдж "В наличии" */}
      {product.stock > 0 && (
        <div className="product-badge stock-badge">В наличии</div>
      )}

      {/* Изображение */}
      <div className="product-image-wrapper">
        {!imageLoaded && (
          <div className="image-skeleton">
            <div className="skeleton-shimmer"></div>
          </div>
        )}
        <img 
          src={product.image || product.images?.[0] || '/placeholder.png'}
          alt={product.name || product.title}
          className={`product-image ${imageLoaded ? 'loaded' : ''}`}
          onLoad={() => setImageLoaded(true)}
          loading="lazy"
        />
      </div>

      {/* Информация */}
      <div className="product-info">
        {/* Бренд */}
        {product.brand && (
          <p className="product-brand">{product.brand}</p>
        )}

        {/* Название */}
        <h3 className="product-title">
          {product.name || product.title}
        </h3>

        {/* Описание */}
        {product.description && (
          <p className="product-description">
            {product.description}
          </p>
        )}

        {/* Рейтинг */}
        {product.rating?.average > 0 && (
          <div className="product-rating">
            <div className="stars">
              {[...Array(5)].map((_, i) => (
                <span 
                  key={i} 
                  className={i < Math.round(product.rating.average) ? 'star filled' : 'star'}
                >
                  ★
                </span>
              ))}
            </div>
            <span className="rating-count">({product.rating.count})</span>
          </div>
        )}

        {/* Цена и кнопка */}
        <div className="product-footer">
          <div className="product-price-block">
            <p className="product-price">
              {formatPrice(product.priceWithMarkup || product.price)} ₸
            </p>
            {product.price1 && product.price !== product.priceWithMarkup && (
              <p className="product-price-old">
                {formatPrice(product.price)} ₸
              </p>
            )}
          </div>

          <button 
            className={`add-to-cart-btn ${addedToCart ? 'added' : ''}`}
            onClick={handleAddToCart}
            disabled={product.stock === 0}
          >
            {addedToCart ? (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Добавлено
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="9" cy="21" r="1"/>
                  <circle cx="20" cy="21" r="1"/>
                  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
                </svg>
                В корзину
              </>
            )}
          </button>
        </div>
      </div>
    </article>
  );
}