import React from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../../context/CartContext.jsx';
import { formatNumber, applyMarkup } from '../../utils/priceUtils.js';
import Price from '../../components/common/Price/price.jsx';
import './Cart.css';

const Cart = () => {
  const {
    cartItems,
    removeFromCart,
    updateQuantity,
    getCartTotal,
    clearCart
  } = useCart();

  const subtotal = getCartTotal();
  const total = subtotal;

  if (cartItems.length === 0) {
    return (
      <div className="cart-page">
        <div className="container">
          <div className="empty-cart">
            <div className="empty-icon">🛒</div>
            <h2>Корзина пуста</h2>
            <p>Добавьте товары в корзину, чтобы продолжить покупки</p>
            <Link to="/catalog" className="btn-primary">
              Перейти в каталог
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cart-page">
      <div className="container">
        <div className="cart-header animate-fadeIn">
          <h1>Корзина</h1>
          <button className="clear-cart-btn" onClick={clearCart}>
            Очистить корзину
          </button>
        </div>

        <div className="cart-layout">
          {/* Cart Items */}
          <div className="cart-items">
            {cartItems.map((item, index) => (
              <div
                key={`${item.id}-${index}`}
                className="cart-item animate-fadeInUp"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <Link to={`/product/${item.id}`} className="item-image">
                  <img src={item.image} alt={item.title} />
                </Link>

                <div className="item-details">
                  <Link to={`/product/${item.id}`} className="item-title">
                    {item.title}
                  </Link>
                  <div className="item-category">{item.category}</div>
                </div>

                <div className="item-price">
                  <Price
                    value={applyMarkup(item.price) * item.quantity}
                    size="medium"
                    showCurrency={true}
                  />
                  <div className="price-unit">{formatNumber(applyMarkup(item.price))} ₸ за шт.</div>
                </div>

                <div className="item-quantity">
                  <button
                    className="qty-btn"
                    onClick={() => updateQuantity(item.id, item.quantity - 1)}
                    aria-label="Уменьшить количество"
                  >
                    −
                  </button>
                  <span className="qty-display">{item.quantity}</span>
                  <button
                    className="qty-btn"
                    onClick={() => updateQuantity(item.id, item.quantity + 1)}
                    aria-label="Увеличить количество"
                  >
                    +
                  </button>
                </div>

                <button
                  className="remove-btn"
                  onClick={() => removeFromCart(item.id)}
                  aria-label="Удалить товар"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    <line x1="10" y1="11" x2="10" y2="17"/>
                    <line x1="14" y1="11" x2="14" y2="17"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>

          {/* Order Summary */}
          <aside className="order-summary animate-fadeInScale">
            <h3 className="summary-title">Итого</h3>

            <div className="summary-details">
              <div className="summary-row">
                <span>Товары ({cartItems.length})</span>
                <span>{formatNumber(subtotal)} ₸</span>
              </div>
              <div className="summary-row">
                <span>Доставка</span>
                <span className="free-delivery">Бесплатно</span>
              </div>
            </div>

            <div className="summary-total">
              <span>Итого</span>
              <span className="total-price">{formatNumber(total)} ₸</span>
            </div>

            <Link to="/checkout" className="checkout-btn">
              Оформить заказ
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="5" y1="12" x2="19" y2="12"/>
                <polyline points="12 5 19 12 12 19"/>
              </svg>
            </Link>

            <Link to="/catalog" className="continue-shopping">
              ← Продолжить покупки
            </Link>

            {/* Trust Badges */}
            <div className="trust-badges">
              <div className="badge-item">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
                <span>Безопасная оплата</span>
              </div>
              <div className="badge-item">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                </svg>
                <span>Быстрая доставка</span>
              </div>
              <div className="badge-item">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="1 4 1 10 7 10"/>
                  <polyline points="23 20 23 14 17 14"/>
                  <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
                </svg>
                <span>Легкий возврат</span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default Cart;