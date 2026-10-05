import { useState, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../../../context/CartContext';
import { formatPriceWithMarkup, getPriceWithMarkup } from '../../../utils/priceUtils';
import './ProductCard.css';

const HIT_PRICE = 150000; // дилерская цена, от которой товар получает бейдж «ХИТ»

// Остаток: число, строка "5" или ">10" (много)
const parseQty = (qty) => {
  if (typeof qty === 'number') return qty;
  if (typeof qty === 'string') {
    if (!qty || qty === '0') return 0;
    if (qty.startsWith('>')) return Infinity;
    const n = parseInt(qty, 10);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
};

// Текст про остаток: "24 шт." или "более 10 шт." (Al-Style отдаёт ">10", когда товара много)
const stockText = (qty) => {
  if (typeof qty === 'string' && qty.trim().startsWith('>')) {
    const rest = qty.trim().slice(1).trim();
    return /^\d+$/.test(rest) ? `более ${rest} шт.` : 'много';
  }
  const n = typeof qty === 'number' ? qty : parseInt(qty, 10);
  return Number.isFinite(n) && n > 0 ? `${n} шт.` : null;
};

const CartIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="21" r="1" />
    <circle cx="20" cy="21" r="1" />
    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
  </svg>
);

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const ProductCard = memo(({ product, index = 0 }) => {
  const navigate = useNavigate();
  const { addToCart, buyNow } = useCart();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);

  const isAboveFold = index < 4;
  const imageSrc = product.images?.[0] || product.image || null;
  const productName = product.name || product.full_name || 'Товар';

  // Дилерская цена (price1). Бэкенд отдаёт её во всех полях; наценку добавляет priceUtils.
  const rawPrice = Number(product.price1 ?? product.price ?? product.price2);
  const dealerPrice = Number.isFinite(rawPrice) ? rawPrice : 0;
  const onRequest = dealerPrice <= 1; // Al-Style: price1 = 1 → «цена по запросу»

  const qty = parseQty(product.quantity);
  const inStock = qty > 0;
  const lowStock = inStock && qty <= 5 ? qty : null;
  const canBuy = inStock && !onRequest;
  // у «своих» товаров (трубы, радиаторы...) точного остатка нет: показываем просто «В наличии»
  const stockLabel = inStock && product.source !== 'manual' ? stockText(product.quantity) : null;
  const priceUnit = product.unit && product.unit !== 'шт.' ? product.unit : null;   // «/ м», «/ т»

  const cartItem = () => ({
    id: product.article,
    article: product.article,
    name: productName,
    price: getPriceWithMarkup(dealerPrice),
    image: imageSrc,
    unit: product.unit || 'шт.',
  });

  const handleClick = useCallback(() => {
    navigate(`/product/${product.article}`);
  }, [navigate, product.article]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && e.target === e.currentTarget) handleClick();
  };

  const handleAddToCart = (e) => {
    e.stopPropagation();
    if (addedToCart || !canBuy) return;
    addToCart(cartItem());
    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 2000);
  };

  const handleBuyNow = (e) => {
    e.stopPropagation();
    if (!canBuy) return;
    buyNow(cartItem(), navigate, 1);
  };

  const cartLabel = onRequest ? 'Цена по запросу' : !inStock ? 'Нет в наличии' : addedToCart ? 'Добавлено' : 'В корзину';

  return (
    <div
      className="product-card"
      style={{ '--i': index % 12 }}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="link"
      tabIndex={0}
    >
      {/* ── Бейджи ── */}
      <div className="product-badges">
        {product.isnew === 1 && <span className="product-badge new-badge">NEW</span>}
        {!onRequest && dealerPrice >= HIT_PRICE && product.isnew !== 1 && (
          <span className="product-badge hit-badge">ХИТ</span>
        )}
        {inStock ? (
          lowStock ? (
            <span className="product-badge low-badge">Осталось {lowStock} шт.</span>
          ) : (
            <span className="product-badge stock-badge">В наличии{stockLabel ? `: ${stockLabel}` : ''}</span>
          )
        ) : (
          <span className="product-badge out-badge">Нет в наличии</span>
        )}
      </div>

      {/* ── Изображение + hover-панель действий ── */}
      <div className="product-image-wrapper">
        {!imageLoaded && imageSrc && <div className="image-skeleton" aria-hidden="true" />}

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
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.4">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          </div>
        )}

        {/* Только для мыши (на телефонах скрыта, там кнопки под ценой) */}
        <div className="card-overlay">
          <button
            type="button"
            className={`overlay-btn overlay-cart${addedToCart ? ' added' : ''}`}
            onClick={handleAddToCart}
            disabled={!canBuy}
          >
            {addedToCart ? <><CheckIcon /> Добавлено</> : <><CartIcon /> В корзину</>}
          </button>
          <button type="button" className="overlay-btn overlay-buy" onClick={handleBuyNow} disabled={!canBuy}>
            Купить сейчас
          </button>
        </div>
      </div>

      {/* ── Инфо ── */}
      <div className="product-info">
        {product.brand && <p className="product-brand">{product.brand}</p>}
        <h3 className="product-title" title={productName}>{productName}</h3>

        <div className="product-footer">
          <p className={`product-price${onRequest ? ' on-request' : ''}`}>
            {formatPriceWithMarkup(dealerPrice)}
            {priceUnit && !onRequest && <span className="product-price-unit"> / {priceUnit}</span>}
          </p>
          <button
            type="button"
            className={`add-to-cart-btn${addedToCart ? ' added' : ''}`}
            onClick={handleAddToCart}
            disabled={!canBuy}
            aria-label={cartLabel}
          >
            {addedToCart ? <CheckIcon /> : <CartIcon />}
          </button>
        </div>

        {/* Показывается только на сенсорных экранах */}
        <button type="button" className="buy-now-btn" onClick={handleBuyNow} disabled={!canBuy}>
          {onRequest ? 'Цена по запросу' : inStock ? 'Купить сейчас' : 'Нет в наличии'}
        </button>
      </div>
    </div>
  );
}, (prev, next) =>
  prev.product.article  === next.product.article  &&
  prev.product.price    === next.product.price    &&
  prev.product.price1   === next.product.price1   &&
  prev.product.quantity === next.product.quantity &&
  prev.index            === next.index
);

ProductCard.displayName = 'ProductCard';
export default ProductCard;