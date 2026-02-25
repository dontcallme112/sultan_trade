import React from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
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
  const shipping = cartItems.length > 0 ? 10 : 0;
  const tax = subtotal * 0.1; // 10% налог
  const total = subtotal + shipping + tax;

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
                  
                  {item.rating && (
                    <div className="item-rating">
                      <div className="stars">
                        {[...Array(5)].map((_, i) => (
                          <span 
                            key={i} 
                            className={`star ${i < Math.floor(item.rating.rate) ? 'filled' : ''}`}
                          >
                            ★
                          </span>
                        ))}
                      </div>
                      <span className="rating-count">({item.rating.count})</span>
                    </div>
                  )}
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

                <div className="item-price">
                  <Price 
                    value={item.price * item.quantity}
                    size="medium"
                    showCurrency={true}
                  />
                  <div className="price-unit">{item.price} ₸ за шт.</div>
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
                <span>₸ {subtotal.toFixed(2)}</span>
              </div>
              <div className="summary-row">
                <span>Доставка</span>
                <span>  {shipping.toFixed(2)}</span>
              </div>
              <div className="summary-row">
                <span>Налог (10%)</span>
                <span>₸ {tax.toFixed(2)}</span>
              </div>
            </div>

            <div className="summary-total">
              <span>Итого</span>
              <span className="total-price">₸ {total.toFixed(2)}</span>
            </div>

            <button className="checkout-btn">
              Оформить заказ
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="5" y1="12" x2="19" y2="12"/>
                <polyline points="12 5 19 12 12 19"/>
              </svg>
            </button>

            <Link to="/catalog" className="continue-shopping">
              ← Продолжить покупки
            </Link>

            {/* Promo Code */}
            <div className="promo-section">
              <input 
                type="text" 
                placeholder="Промокод"
                className="promo-input"
              />
              <button className="promo-btn">Применить</button>
            </div>

            {/* Trust Badges */}
            <div className="trust-badges">
              <div className="badge-item">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
                <span>Безопасная оплата</span>
              </div>
              <div className="badge-item">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                </svg>
                <span>Быстрая доставка</span>
              </div>
              <div className="badge-item">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="1 4 1 10 7 10"/>
                  <polyline points="23 20 23 14 17 14"/>
                  <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
                </svg>
                <span>Легкий возврат</span>
              </div>
            </div>
          </aside>
        </div>

        {/* Recommended Products */}
        <section className="recommended-section">
          <h3 className="section-title">Вам может понравиться</h3>
          <div className="recommended-message">
            <p>Рекомендуемые товары появятся здесь</p>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Cart;