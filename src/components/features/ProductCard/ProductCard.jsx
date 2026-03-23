import { useState, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../../../context/CartContext';
import './ProductCard.css';

const ProductCard = memo(({ product, index = 0 }) => {
  const navigate = useNavigate();
  const { addToCart, buyNow } = useCart();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);

  const isAboveFold = index < 4;

  const getProductImage = useCallback(() => {
    if (product.images?.length > 0) return product.images[0];
    if (product.image) return product.image;
    return null;
  }, [product.images, product.image]);

  const getProductPrice = useCallback(() => {
    const raw = product.price2 || product.price1 || product.price || 0;
    const num = typeof raw === 'number' ? raw : parseFloat(raw);
    return isNaN(num) ? 0 : num;
  }, [product.price2, product.price1, product.price]);

  const formatPrice = useCallback((price) => {
    if (!price || price === 0) return 'Цена по запросу';
    const withMarkup = Math.round(price * 1.1);
    return new Intl.NumberFormat('ru-RU').format(withMarkup) + ' ₸';
  }, []);

  const isInStock = useCallback(() => {
    const qty = product.quantity;
    if (typeof qty === 'number') return qty > 0;
    if (typeof qty === 'string') {
      if (!qty || qty === '0') return false;
      if (qty.startsWith('>')) return true;
      const n = parseInt(qty);
      return !isNaN(n) && n > 0;
    }
    return false;
  }, [product.quantity]);

  const handleClick = useCallback(() => {
    navigate(`/product/${product.article}`);
  }, [navigate, product.article]);

  // Добавить в корзину
  const handleAddToCart = useCallback((e) => {
    e.stopPropagation();
    if (addedToCart || !isInStock()) return;

    addToCart({
      id: product.article,
      article: product.article,
      name: product.name || 'Товар',
      price: Math.round(getProductPrice() * 1.1),
      image: getProductImage(),
    });

    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 2000);
  }, [addedToCart, isInStock, addToCart, product, getProductPrice, getProductImage]);

  // Купить сейчас — очищает корзину и переходит на checkout
  const handleBuyNow = useCallback((e) => {
    e.stopPropagation();
    if (!isInStock()) return;

    buyNow(
      {
        id: product.article,
        article: product.article,
        name: product.name || 'Товар',
        price: Math.round(getProductPrice() * 1.1),
        image: getProductImage(),
      },
      navigate,
      1
    );
  }, [isInStock, buyNow, navigate, product, getProductPrice, getProductImage]);

  const inStock      = isInStock();
  const currentPrice = getProductPrice();
  const imageSrc     = getProductImage();
  const productName  = product.name || product.full_name || 'Товар';

  return (
    <div className="product-card" onClick={handleClick}>

      {/* ── Бейджи ── */}
      <div className="product-badges">
        {product.isnew === 1 && (
          <span className="product-badge new-badge">NEW</span>
        )}
        <span className={`product-badge ${inStock ? 'stock-badge' : 'out-badge'}`}>
          {inStock ? 'В наличии' : 'Нет'}
        </span>
      </div>

      {/* ── Изображение ── */}
      <div className="product-image-wrapper">
        {!imageLoaded && <div className="image-skeleton" aria-hidden="true" />}

        {imageSrc ? (
          <img
            src={imageSrc}
            alt={productName}
            className={`product-image${imageLoaded ? ' loaded' : ''}`}
            loading={isAboveFold ? 'eager' : 'lazy'}
            fetchpriority={isAboveFold ? 'high' : 'auto'}
            decoding="async"
            width="300"
            height="300"
            onLoad={() => setImageLoaded(true)}
            onError={(e) => { e.target.style.display = 'none'; setImageLoaded(true); }}
          />
        ) : (
          <div className="product-image-placeholder" aria-hidden="true">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1" opacity="0.3">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          </div>
        )}
      </div>

      {/* ── Инфо ── */}
      <div className="product-info">
        {product.brand && <p className="product-brand">{product.brand}</p>}

        <h3 className="product-title" title={productName}>{productName}</h3>

        {/* ── Цена + кнопка корзины ── */}
        <div className="product-footer">
          <p className="product-price">{formatPrice(currentPrice)}</p>

          <button
            className={`add-to-cart-btn${addedToCart ? ' added' : ''}`}
            onClick={handleAddToCart}
            disabled={!inStock}
            aria-label={!inStock ? 'Нет в наличии' : addedToCart ? 'Добавлено' : 'В корзину'}
          >
            {addedToCart ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2">
                <circle cx="9" cy="21" r="1"/>
                <circle cx="20" cy="21" r="1"/>
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
              </svg>
            )}
          </button>
        </div>

        {/* ── Кнопка "Купить сейчас" ── */}
        <button
          className="buy-now-btn"
          onClick={handleBuyNow}
          disabled={!inStock}
          aria-label="Купить сейчас"
        >
          {inStock ? 'Купить сейчас' : 'Нет в наличии'}
        </button>
      </div>
    </div>
  );
}, (prev, next) =>
  prev.product.article  === next.product.article  &&
  prev.product.price2   === next.product.price2   &&
  prev.product.price1   === next.product.price1   &&
  prev.product.quantity === next.product.quantity &&
  prev.index            === next.index
);

ProductCard.displayName = 'ProductCard';
export default ProductCard;