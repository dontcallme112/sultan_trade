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
  const { cartItems: cart, getCartTotal, clearCart } = useCart();
  const { user } = useAuth();

  const [formData, setFormData] = useState({ name: '', phone: '', email: '', address: '', comment: '' });
  const [paymentMethod, setPaymentMethod] = useState('kaspi');
  const [loading, setLoading]     = useState(false);
  const [loadingStep, setLoadingStep] = useState('');

  const totalPrice = getCartTotal ? getCartTotal() : 0;
  const itemCount  = cart ? cart.reduce((sum, item) => sum + (item.quantity || 0), 0) : 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const orderId = 'ORD-' + Date.now();

    // Цена БЕЗ наценки — как есть
    const items = (cart || []).map(item => ({
      article:   item.id || item.article,
      name:      item.title || item.name,
      price:     item.price || 0,
      quantity:  item.quantity || 1,
      image_url: item.image || null,
    }));

    const orderData = { orderId, customer: formData, items, total: totalPrice, paymentMethod, status: 'pending', createdAt: new Date().toISOString() };

    // 1. localStorage
    try {
      const orders = JSON.parse(localStorage.getItem('orders') || '[]');
      orders.push(orderData);
      localStorage.setItem('orders', JSON.stringify(orders));
    } catch (err) { console.error('localStorage error:', err); }

    // 2. Supabase
    setLoadingStep('Сохраняем заказ...');
    try {
      const { error } = await supabase.from('orders').insert({
        user_id:      user?.id || null,
        status:       'pending',
        items,
        total_price:  totalPrice,
        address_text: formData.address,
        comment:      `Имя: ${formData.name} | Тел: ${formData.phone} | Email: ${formData.email || '-'} | Оплата: ${paymentMethod} | Комментарий: ${formData.comment || '-'} | ID: ${orderId}`,
      });
      if (error) console.error('❌ Supabase error:', error.message);
    } catch (err) { console.error('❌ Supabase save error:', err); }

    // 3. al-style
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
          <div className="checkout-form-section">
            <form onSubmit={handleSubmit} className="checkout-form">
              <div className="form-section">
                <h2 className="form-section-title">Контактные данные</h2>
                <div className="form-group"><label>Имя и фамилия *</label><input type="text" name="name" value={formData.name} onChange={handleChange} required placeholder="Иван Иванов" /></div>
                <div className="form-group"><label>Телефон *</label><input type="tel" name="phone" value={formData.phone} onChange={handleChange} required placeholder="+7 (700) 123-45-67" /></div>
                <div className="form-group"><label>Email</label><input type="email" name="email" value={formData.email} onChange={handleChange} placeholder="example@mail.com" /></div>
              </div>
              <div className="form-section">
                <h2 className="form-section-title">Адрес доставки</h2>
                <div className="form-group"><label>Адрес *</label><textarea name="address" value={formData.address} onChange={handleChange} required rows="3" placeholder="Город, улица, дом, квартира" /></div>
                <div className="form-group"><label>Комментарий</label><textarea name="comment" value={formData.comment} onChange={handleChange} rows="2" placeholder="Дополнительная информация" /></div>
              </div>
              <div className="form-section">
                <h2 className="form-section-title">Способ оплаты</h2>
                <div className="payment-methods">
                  {[
                    { value: 'kaspi', label: 'Kaspi Pay', desc: 'Оплата через Kaspi QR', icon: <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/></svg> },
                    { value: 'cash',  label: 'Наличными', desc: 'Оплата при получении', icon: <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg> },
                    { value: 'card',  label: 'Картой курьеру', desc: 'Терминал при доставке', icon: <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg> },
                  ].map(m => (
                    <label key={m.value} className="payment-method">
                      <input type="radio" name="paymentMethod" value={m.value} checked={paymentMethod === m.value} onChange={e => setPaymentMethod(e.target.value)} />
                      <div className="payment-method-content">
                        <div className={`payment-method-icon ${m.value}`}>{m.icon}</div>
                        <div className="payment-method-info"><h3>{m.label}</h3><p>{m.desc}</p></div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={loading}>
                {loading ? <>{loadingStep || 'Оформление...'}</> : `Оформить заказ на ${formatNumber(totalPrice)} ₸`}
              </button>
            </form>
          </div>

          <div className="checkout-summary">
            <h2 className="summary-title">Ваш заказ</h2>
            <div className="summary-items">
              {cart.map((item, index) => (
                <div key={item.id || index} className="summary-item">
                  <img src={item.image || 'https://via.placeholder.com/60'} alt={item.title || item.name} />
                  <div className="summary-item-info">
                    <h4>{item.title || item.name || 'Товар'}</h4>
                    {/* Цена БЕЗ наценки */}
                    <p>{item.quantity || 1} × {formatNumber(item.price || 0)} ₸</p>
                  </div>
                  <div className="summary-item-total">
                    {formatNumber((item.price || 0) * (item.quantity || 1))} ₸
                  </div>
                </div>
              ))}
            </div>
            <div className="summary-totals">
              <div className="summary-row"><span>Товары ({itemCount} шт.)</span><span>{formatNumber(totalPrice)} ₸</span></div>
              <div className="summary-row"><span>Доставка</span><span className="free">Бесплатно</span></div>
              <div className="summary-row total"><span>Итого</span><span>{formatNumber(totalPrice)} ₸</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}