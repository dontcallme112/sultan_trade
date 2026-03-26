import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../api/supabaseClient';
import { BACKEND_URL } from '../../api/client';
import { formatNumber } from '../../utils/priceUtils.js';
import './Checkout.css';

export default function Checkout() {
  const navigate = useNavigate();
  const { cartItems: cart, getCartTotal, clearCart, updateQuantity, removeFromCart } = useCart();
  const { user } = useAuth();

  const [formData, setFormData] = useState({ name: '', phone: '', email: '', address: '', comment: '' });
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');

  const totalPrice = getCartTotal ? getCartTotal() : 0;
  const itemCount  = cart ? cart.reduce((sum, item) => sum + (item.quantity || 0), 0) : 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const orderId      = 'ORD-' + Date.now();
    const paymentMethod = 'kaspi'; // только Kaspi

    const items = (cart || []).map(item => ({
      article:   item.id || item.article,
      name:      item.title || item.name,
      price:     item.price || 0,
      quantity:  item.quantity || 1,
      image_url: item.image || null,
    }));

    const orderData = { orderId, customer: formData, items, total: totalPrice, paymentMethod, status: 'pending', createdAt: new Date().toISOString() };

    try {
      const orders = JSON.parse(localStorage.getItem('orders') || '[]');
      orders.push(orderData);
      localStorage.setItem('orders', JSON.stringify(orders));
    } catch (err) { console.error('localStorage error:', err); }

    setLoadingStep('Сохраняем заказ...');
    try {
      const { error } = await supabase.from('orders').insert({
        user_id:      user?.id || null,
        status:       'pending',
        items,
        total_price:  totalPrice,
        address_text: formData.address,
        comment:      `Имя: ${formData.name} | Тел: ${formData.phone} | Email: ${formData.email || '-'} | Оплата: Kaspi | Комментарий: ${formData.comment || '-'} | ID: ${orderId}`,
      });
      if (error) console.error('❌ Supabase error:', error.message);
    } catch (err) { console.error('❌ Supabase save error:', err); }

    setLoadingStep('Оформляем заказ у поставщика...');
    try {
      const alstyleItems = (cart || []).map(item => ({ article: item.id || item.article, quantity: item.quantity || 1 }));
      const response = await fetch(`${BACKEND_URL}/api/alstyle-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: alstyleItems, comment: `${formData.name}, ${formData.phone}, ${formData.address}`, orderId }),
      });
      const result = await response.json();
      if (result.success) {
        try {
          const orders = JSON.parse(localStorage.getItem('orders') || '[]');
          const idx = orders.findIndex(o => o.orderId === orderId);
          if (idx !== -1) { orders[idx].alstyleOrderId = result.alstyleOrderId; localStorage.setItem('orders', JSON.stringify(orders)); }
        } catch (e) {}
      }
    } catch (err) { console.error('❌ al-style order error:', err); }

    clearCart();
    setLoading(false);
    setLoadingStep('');
    navigate(`/order-confirmation/${orderId}`);
  };

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  if (!cart || cart.length === 0) {
    return (
      <div className="checkout-page"><div className="container">
        <div className="checkout-empty">
          <div className="checkout-empty-icon">🛒</div>
          <h2>Корзина пуста</h2>
          <p>Добавьте товары в корзину для оформления заказа</p>
          <button className="btn btn-primary" onClick={() => navigate('/catalog')}>Перейти в каталог</button>
        </div>
      </div></div>
    );
  }

  return (
    <div className="checkout-page">
      <div className="container">
        <h1 className="checkout-title">Оформление заказа</h1>

        <div className="checkout-content">

          {/* ── Форма ── */}
          <div className="checkout-form-section">
            <form onSubmit={handleSubmit} className="checkout-form">

              <div className="form-section">
                <h2 className="form-section-title">Контактные данные</h2>
                <div className="form-group">
                  <label>Имя и фамилия *</label>
                  <input type="text" name="name" value={formData.name} onChange={handleChange} required placeholder="Иван Иванов" />
                </div>
                <div className="form-group">
                  <label>Телефон *</label>
                  <input type="tel" name="phone" value={formData.phone} onChange={handleChange} required placeholder="+7 (700) 123-45-67" />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" name="email" value={formData.email} onChange={handleChange} placeholder="example@mail.com" />
                </div>
              </div>

              <div className="form-section">
                <h2 className="form-section-title">Адрес доставки</h2>
                <div className="form-group">
                  <label>Адрес *</label>
                  <textarea name="address" value={formData.address} onChange={handleChange} required rows="3" placeholder="Город, улица, дом, квартира" />
                </div>
                <div className="form-group">
                  <label>Комментарий</label>
                  <textarea name="comment" value={formData.comment} onChange={handleChange} rows="2" placeholder="Дополнительная информация" />
                </div>
              </div>

              {/* Оплата — инфо блок без выбора */}
              <div className="form-section">
                <h2 className="form-section-title">Оплата</h2>
                <div className="kaspi-info">
                  <div className="kaspi-info-icon">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
                    </svg>
                  </div>
                  <div>
                    <p className="kaspi-info-title">Kaspi Pay</p>
                    <p className="kaspi-info-desc">После оформления заказа мы свяжемся с вами для оплаты через Kaspi QR</p>
                  </div>
                </div>
              </div>

              <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={loading}>
                {loading
                  ? <>{loadingStep || 'Оформление...'}</>
                  : `Оформить заказ на ${formatNumber(totalPrice)} ₸`
                }
              </button>
            </form>
          </div>

          {/* ── Итого ── */}
          <div className="checkout-summary">
            <h2 className="summary-title">
              Ваш заказ
              <span className="summary-count">{itemCount} шт.</span>
            </h2>

            <div className="summary-items">
              {cart.map((item, index) => (
                <div key={item.id || index} className="summary-item">
                  <div className="summary-item-img">
                    <img src={item.image || null} alt={item.title || item.name}
                      onError={(e) => { e.target.style.display = 'none'; }} />
                  </div>

                  <div className="summary-item-info">
                    <h4>{item.title || item.name || 'Товар'}</h4>
                    <p className="summary-item-price-unit">{formatNumber(item.price || 0)} ₸ / шт.</p>

                    <div className="summary-item-qty">
                      <button className="qty-btn" onClick={() => updateQuantity(item.id, (item.quantity || 1) - 1)} aria-label="Уменьшить" type="button">−</button>
                      <span className="qty-value">{item.quantity || 1}</span>
                      <button className="qty-btn" onClick={() => updateQuantity(item.id, (item.quantity || 1) + 1)} aria-label="Увеличить" type="button">+</button>
                      <button className="qty-remove" onClick={() => removeFromCart(item.id)} aria-label="Удалить" type="button">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                          <path d="M10 11v6M14 11v6"/>
                          <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                        </svg>
                      </button>
                    </div>
                  </div>

                  <div className="summary-item-total">
                    {formatNumber((item.price || 0) * (item.quantity || 1))} ₸
                  </div>
                </div>
              ))}
            </div>

            <div className="summary-totals">
              <div className="summary-row">
                <span>Товары ({itemCount} шт.)</span>
                <span>{formatNumber(totalPrice)} ₸</span>
              </div>
              <div className="summary-row">
                <span>Доставка</span>
                <span className="free">Бесплатно</span>
              </div>
              <div className="summary-row total">
                <span>Итого</span>
                <span>{formatNumber(totalPrice)} ₸</span>
              </div>
            </div>

            <button className="continue-shopping-btn" onClick={() => navigate('/catalog')} type="button">
              ← Продолжить покупки
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}