import React from 'react';
import './Price.css';

const Price = ({ 
  value, 
  size = 'medium',
  showCurrency = true,
  discount = null,
  oldPrice = null 
}) => {
  const formatPrice = (price) => {
    if (price === 1) return 'Цена по запросу';
    return parseInt(price).toLocaleString('ru-RU');
  };

  const sizeClass = `price-${size}`;

  if (discount && oldPrice) {
    return (
      <div className={`price-container ${sizeClass}`}>
        <div className="price-group">
          <span className="price-old">
            {formatPrice(oldPrice)}
            {showCurrency && <span className="currency">₸</span>}
          </span>
          <span className="price-discount">-{discount}%</span>
        </div>
        <div className="price-current">
          {formatPrice(value)}
          {showCurrency && <span className="currency">₸</span>}
        </div>
      </div>
    );
  }

  return (
    <div className={`price-current ${sizeClass}`}>
      {formatPrice(value)}
      {showCurrency && <span className="currency">₸</span>}
    </div>
  );
};

export default Price;