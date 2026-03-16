import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../../../context/CartContext';
import './ProductCard.css';

export default function ProductCard({ product }) {
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);

  const handleClick = () => {
    navigate(`/product/${product.article}`);
  };

  const handleAddToCart = (e) => {
    e.stopPropagation();
    
    const price = getProductPrice();
    
    const cartItem = {
      id: product.article,
      article: product.article,
      name: product.name || 'Товар',
      price: Math.round(price * 1.1), // +10% наценка
      image: getProductImage(),
    };

    console.log('🛒 Adding to cart:', cartItem);

    addToCart(cartItem);

    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 2000);
  };

  // Получение цены товара
  const getProductPrice = () => {
    // Приоритет: price2 > price1 > price
    const price = product.price2 || product.price1 || product.price || 0;
    
    // Проверяем что это число
    const numPrice = typeof price === 'number' ? price : parseFloat(price);
    
    return isNaN(numPrice) ? 0 : numPrice;
  };

  // Форматирование цены
  const formatPrice = (price) => {
    const numPrice = typeof price === 'number' ? price : parseFloat(price);
    
    if (isNaN(numPrice) || numPrice === 0) {
      return 'Цена по запросу';
    }
    
    const priceWithMarkup = Math.round(numPrice * 1.1);
    return new Intl.NumberFormat('ru-RU').format(priceWithMarkup) + ' ₸';
  };

  // Получение изображения
  const getProductImage = () => {
    if (product.images && Array.isArray(product.images) && product.images.length > 0) {
      return product.images[0];
    }
    if (product.image) {
      return product.image;
    }
    return 'https://via.placeholder.com/400x400?text=No+Image';
  };

  // Проверка наличия
  const isInStock = () => {
    const qty = product.quantity;
    
    if (typeof qty === 'number') return qty > 0;
    if (typeof qty === 'string') {
      if (qty === '0' || qty === '') return false;
      if (qty.startsWith('>')) return true;
      const num = parseInt(qty);
      return !isNaN(num) && num > 0;
    }
    
    return false;
  };

  const currentPrice = getProductPrice();
  const productName = product.name || product.full_name || 'Товар';
  const productBrand = product.brand;

  return (
    <div className="product-card" onClick={handleClick}>
      {/* Бейджи */}
      {product.isnew === 1 && (
        <div className="product-badge new-badge">NEW</div>
      )}
      
      {isInStock() && (
        <div className="product-badge stock-badge">В наличии</div>
      )}

      {/* Изображение */}
      <div className="product-image-wrapper">
        {!imageLoaded && <div className="image-skeleton"></div>}
        <img
          src={getProductImage()}
          alt={productName}
          className={`product-image ${imageLoaded ? 'loaded' : ''}`}
          onLoad={() => setImageLoaded(true)}
          onError={(e) => {
            e.target.src = 'https://via.placeholder.com/400x400?text=No+Image';
            setImageLoaded(true);
          }}
        />
      </div>

      {/* Информация */}
      <div className="product-info">
        {productBrand && (
          <p className="product-brand">{productBrand}</p>
        )}
        
        <h3 className="product-title">{productName}</h3>

        {/* Footer с ценой и кнопкой */}
        <div className="product-footer">
          <div className="product-price-block">
            <p className="product-price">{formatPrice(currentPrice)}</p>
          </div>

          <button
            className={`add-to-cart-btn ${addedToCart ? 'added' : ''}`}
            onClick={handleAddToCart}
            disabled={!isInStock()}
          >
            {addedToCart ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                ✓
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="9" cy="21" r="1"/>
                  <circle cx="20" cy="21" r="1"/>
                  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
                </svg>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}