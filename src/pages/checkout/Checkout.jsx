import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../api/supabaseClient';
import { BACKEND_URL } from '../../api/client';
import { formatNumber } from '../../utils/priceUtils.js';
import { formatPhone, validateCustomer, mapServerFields } from '../../utils/customerValidation';
import { openAuthModal } from '../../utils/authModal';
import './Checkout.css';

export default function Checkout() {
  const navigate = useNavigate();
  const { cartItems: cart, getCartTotal, clearCart, updateQuantity, removeFromCart } = useCart();
  const { user, loading: authLoading } = useAuth();

  const [formData, setFormData] = useState({ name: '', phone: '', email: '', address: '', comment: '' });
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [loading, setLoading] = useState(false);
  const formRef = useRef(null);

  const totalPrice = getCartTotal ? getCartTotal() : 0;
  const itemCount  = cart ? cart.reduce((sum, item) => sum + (item.quantity || 0), 0) : 0;

  // Подставляем то, что уже известно об аккаунте
  useEffect(() => {
    if (!user) return;
    setFormData(f => ({
      ...f,
      name:  f.name  || user.user_metadata?.full_name || '',
      phone: f.phone || (user.user_metadata?.phone ? formatPhone(user.user_metadata.phone) : ''),
      email: f.email || user.email || '',
    }));
  }, [user]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(f => ({ ...f, [name]: name === 'phone' ? formatPhone(value) : value }));
    if (errors[name]) setErrors(er => ({ ...er, [name]: undefined }));   // ошибка исчезает, когда человек начал её исправлять
  };

  const focusFirstError = (errs) => {
    const first = ['name', 'phone', 'address'].find(k => errs[k]);
    if (first) formRef.current?.querySelector(`[name="${first}"]`)?.focus();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    const errs = validateCustomer(formData);
    setErrors(errs);
    setSubmitError('');
    if (Object.keys(errs).length) { focusFirstError(errs); return; }

    setLoading(true);
    const orderId = 'ORD-' + Date.now();
    const items = (cart || []).map(item => ({
      article:   item.id || item.article,
      name:      item.title || item.name,
      price:     item.price || 0,          // сервер пересчитает цену сам, это значение игнорируется
      quantity:  item.quantity || 1,
      image_url: item.image || null,
    }));
    const comment = [
      formData.comment.trim() && `Комментарий: ${formData.comment.trim()}`,
      formData.email && `Email: ${formData.email}`,
      'Оплата: Kaspi',
      `Ref: ${orderId}`,
    ].filter(Boolean).join(' | ');

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        setSubmitError('Сессия истекла. Войдите в аккаунт ещё раз, корзина сохранена.');
        openAuthModal();
        return;
      }

      const res = await fetch(`${BACKEND_URL}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          items,
          customer_name: formData.name,
          phone: formData.phone,
          address_text: formData.address,
          comment,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 401) {
        setSubmitError('Войдите в аккаунт, чтобы оформить заказ.');
        openAuthModal();
        return;
      }
      if (!res.ok) {
        const fieldErrors = mapServerFields(data.fields);
        if (Object.keys(fieldErrors).length) { setErrors(fieldErrors); focusFirstError(fieldErrors); }
        setSubmitError(data.error || 'Не удалось оформить заказ. Попробуйте ещё раз.');
        return;
      }

      // Успех: только теперь сохраняем данные для страницы подтверждения и очищаем корзину
      const confirmedTotal = data.order?.total_price ?? totalPrice;
      try {
        const orders = JSON.parse(localStorage.getItem('orders') || '[]');
        orders.push({
          orderId,
          serverOrderId: data.order?.id || null,
          customer: formData,
          items,
          total: confirmedTotal,
          status: 'pending',
          createdAt: new Date().toISOString(),
        });
        localStorage.setItem('orders', JSON.stringify(orders));
      } catch (err) { console.error('localStorage error:', err); }

      clearCart();
      navigate(`/order-confirmation/${orderId}`);
    } catch (err) {
      console.error('❌ Order error:', err);
      setSubmitError('Нет связи с сервером. Заказ не отправлен, проверьте интернет и попробуйте ещё раз.');
    } finally {
      setLoading(false);
    }
  };

  // ── Корзина пуста ──
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

  // ── Без аккаунта заказ оформить нельзя ──
  if (!user && !authLoading) {
    return (
      <div className="checkout-page"><div className="container">
        <div className="auth-gate">
          <div className="auth-gate-icon">🔒</div>
          <h2>Войдите, чтобы оформить заказ</h2>
          <p>Заказы принимаются только от зарегистрированных покупателей: так мы сможем связаться с вами по заказу. Ваша корзина сохранена.</p>
          <button type="button" className="btn btn-primary btn-lg" onClick={openAuthModal}>Войти или зарегистрироваться</button>
          <Link to="/cart" className="auth-gate-back">← Вернуться в корзину</Link>
        </div>
      </div></div>
    );
  }

  const fieldClass = (name) => `form-group${errors[name] ? ' has-error' : ''}`;

  return (
    <div className="checkout-page">
      <div className="container">
        <h1 className="checkout-title">Оформление заказа</h1>

        <div className="checkout-content">

          {/* ── Форма ── */}
          <div className="checkout-form-section">
            <form ref={formRef} onSubmit={handleSubmit} className="checkout-form" noValidate>

              <div className="form-section">
                <h2 className="form-section-title">Контактные данные</h2>
                <p className="form-hint">Эти данные нужны, чтобы мы могли связаться с вами и подтвердить заказ.</p>
                <div className={fieldClass('name')}>
                  <label htmlFor="co-name">Фамилия и имя *</label>
                  <input id="co-name" type="text" name="name" value={formData.name} onChange={handleChange}
                    placeholder="Иванов Иван" autoComplete="name" aria-invalid={!!errors.name} />
                  {errors.name && <p className="field-error" role="alert">{errors.name}</p>}
                </div>
                <div className={fieldClass('phone')}>
                  <label htmlFor="co-phone">Телефон *</label>
                  <input id="co-phone" type="tel" name="phone" value={formData.phone} onChange={handleChange}
                    placeholder="+7 (701) 123-45-67" autoComplete="tel" inputMode="tel" aria-invalid={!!errors.phone} />
                  {errors.phone && <p className="field-error" role="alert">{errors.phone}</p>}
                </div>
                <div className="form-group">
                  <label htmlFor="co-email">Email</label>
                  <input id="co-email" type="email" name="email" value={formData.email} onChange={handleChange}
                    placeholder="example@mail.com" autoComplete="email" />
                </div>
              </div>

              <div className="form-section">
                <h2 className="form-section-title">Адрес доставки</h2>
                <div className={fieldClass('address')}>
                  <label htmlFor="co-address">Адрес *</label>
                  <textarea id="co-address" name="address" value={formData.address} onChange={handleChange} rows="3"
                    placeholder="Город, улица, дом, квартира" autoComplete="street-address" aria-invalid={!!errors.address} />
                  {errors.address && <p className="field-error" role="alert">{errors.address}</p>}
                </div>
                <div className="form-group">
                  <label htmlFor="co-comment">Комментарий</label>
                  <textarea id="co-comment" name="comment" value={formData.comment} onChange={handleChange} rows="2" placeholder="Дополнительная информация" />
                </div>
              </div>

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
                    <p className="kaspi-info-desc">После оформления заказа мы свяжемся с вами по указанному телефону для оплаты через Kaspi QR</p>
                  </div>
                </div>
              </div>

              {submitError && <div className="checkout-alert" role="alert">{submitError}</div>}

              <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={loading}>
                {loading ? 'Оформление...' : `Оформить заказ на ${formatNumber(totalPrice)} ₸`}
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