import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../../../context/CartContext';
import Price from '../../common/Price/Price.jsx';
import './ProductCard.css';

const ProductCard = ({ product }) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const { addToCart } = useCart();

  const handleAddToCart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    addToCart(product);
  };

  const handleQuickView = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Логика для Quick View модалки
  };

  return (
    <Link 
      to={`/product/${product.id}`}
      className="product-card"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="product-image-wrapper">
        {!imageLoaded && (
          <div className="image-skeleton skeleton"></div>
        )}
        <img
          src={product.image}
          alt={product.title}
          className={`product-image ${imageLoaded ? 'loaded' : ''}`}
          onLoad={() => setImageLoaded(true)}
          loading="lazy"
        />
        
        {product.discount && (
          <div className="product-badge discount">
            -{product.discount}%
          </div>
        )}
        
        {product.isNew && (
          <div className="product-badge new">
            New
          </div>
        )}

        <div className={`product-actions ${isHovered ? 'visible' : ''}`}>
          <button 
            className="action-button"
            onClick={handleQuickView}
            aria-label="Быстрый просмотр"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
          
          <button 
            className="action-button"
            aria-label="Добавить в избранное"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="product-info">
        <div className="product-category">{product.category}</div>
        <h3 className="product-title">{product.title}</h3>
        
        {product.rating && (
          <div className="product-rating">
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
            <span className="rating-count">({product.rating.count})</span>
          </div>
        )}

        <div className="product-footer">
          <Price 
            value={product.price}
            size="small"
            showCurrency={true}
          />

          <button 
            className="add-to-cart-btn"
            onClick={handleAddToCart}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <path d="M16 10a4 4 0 0 1-8 0"/>
            </svg>
          </button>
        </div>
      </div>
    </Link>
  );
};

export default ProductCard;