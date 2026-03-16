import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import './Checkout.css';

export default function Checkout() {
  const navigate = useNavigate();
  const { cart = [], getTotalPrice, clearCart } = useCart();
  
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    comment: ''
  });
  const [paymentMethod, setPaymentMethod] = useState('kaspi');
  const [loading, setLoading] = useState(false);

  // Безопасное получение total
  const getTotal = () => {
    if (typeof getTotalPrice === 'function') {
      return getTotalPrice();
    }
    // Fallback расчет
    return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const orderId = 'ORD-' + Date.now();

    const orderData = {
      orderId: orderId,
      customer: formData,
      items: cart,
      total: getTotal(),
      paymentMethod: paymentMethod,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    console.log('📦 Заказ создан:', orderData);

    // Сохраняем в localStorage
    try {
      const orders = JSON.parse(localStorage.getItem('orders') || '[]');
      orders.push(orderData);
      localStorage.setItem('orders', JSON.stringify(orders));
    } catch (error) {
      console.error('Error saving order:', error);
    }

    setLoading(false);
    navigate(`/order-confirmation/${orderId}`);
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  // Если корзина пуста или undefined
  if (!cart || cart.length === 0) {
    return (
      <div className="checkout-page">
        <div className="container">
          <div className="checkout-empty">
            <h2>Корзина пуста</h2>
            <p>Добавьте товары в корзину для оформления заказа</p>
            <button className="btn btn-primary" onClick={() => navigate('/catalog')}>
              Перейти в каталог
            </button>
          </div>
        </div>
      </div>
    );
  }

  const totalPrice = getTotal();
  const itemCount = cart.reduce((sum, item) => sum + (item.quantity || 0), 0);

  return (
    <div className="checkout-page">
      <div className="container">
        <h1 className="checkout-title">Оформление заказа</h1>

        <div className="checkout-content">
          {/* Форма */}
          <div className="checkout-form-section">
            <form onSubmit={handleSubmit} className="checkout-form">
              {/* Контактные данные */}
              <div className="form-section">
                <h2 className="form-section-title">Контактные данные</h2>
                
                <div className="form-group">
                  <label htmlFor="name">Имя и фамилия *</label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    placeholder="Иван Иванов"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="phone">Телефон *</label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    required
                    placeholder="+7 (700) 123-45-67"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="email">Email</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="example@mail.com"
                  />
                </div>
              </div>

              {/* Доставка */}
              <div className="form-section">
                <h2 className="form-section-title">Адрес доставки</h2>
                
                <div className="form-group">
                  <label htmlFor="address">Адрес *</label>
                  <textarea
                    id="address"
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    required
                    rows="3"
                    placeholder="Город, улица, дом, квартира"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="comment">Комментарий к заказу</label>
                  <textarea
                    id="comment"
                    name="comment"
                    value={formData.comment}
                    onChange={handleChange}
                    rows="2"
                    placeholder="Дополнительная информация"
                  />
                </div>
              </div>

              {/* Способ оплаты */}
              <div className="form-section">
                <h2 className="form-section-title">Способ оплаты</h2>
                
                <div className="payment-methods">
                  <label className="payment-method">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="kaspi"
                      checked={paymentMethod === 'kaspi'}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                    />
                    <div className="payment-method-content">
                      <div className="payment-method-icon kaspi">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
                        </svg>
                      </div>
                      <div className="payment-method-info">
                        <h3>Kaspi Pay</h3>
                        <p>Оплата через Kaspi QR</p>
                      </div>
                    </div>
                  </label>

                  <label className="payment-method">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="cash"
                      checked={paymentMethod === 'cash'}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                    />
                    <div className="payment-method-content">
                      <div className="payment-method-icon cash">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="2" y="5" width="20" height="14" rx="2"/>
                          <path d="M2 10h20"/>
                        </svg>
                      </div>
                      <div className="payment-method-info">
                        <h3>Наличными</h3>
                        <p>Оплата при получении</p>
                      </div>
                    </div>
                  </label>

                  <label className="payment-method">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="card"
                      checked={paymentMethod === 'card'}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                    />
                    <div className="payment-method-content">
                      <div className="payment-method-icon card">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="1" y="4" width="22" height="16" rx="2"/>
                          <path d="M1 10h22"/>
                        </svg>
                      </div>
                      <div className="payment-method-info">
                        <h3>Картой курьеру</h3>
                        <p>Терминал при доставке</p>
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              <button 
                type="submit" 
                className="btn btn-primary btn-lg btn-block"
                disabled={loading}
              >
                {loading ? 'Оформление...' : `Оформить заказ на ${totalPrice.toLocaleString('ru-RU')} ₸`}
              </button>
            </form>
          </div>

          {/* Сводка заказа */}
          <div className="checkout-summary">
            <h2 className="summary-title">Ваш заказ</h2>
            
            <div className="summary-items">
              {cart.map((item) => (
                <div key={item.id} className="summary-item">
                  <img src={item.image || 'https://via.placeholder.com/60'} alt={item.name} />
                  <div className="summary-item-info">
                    <h4>{item.name || 'Товар'}</h4>
                    <p>{item.quantity || 1} × {(item.price || 0).toLocaleString('ru-RU')} ₸</p>
                  </div>
                  <div className="summary-item-total">
                    {((item.price || 0) * (item.quantity || 1)).toLocaleString('ru-RU')} ₸
                  </div>
                </div>
              ))}
            </div>

            <div className="summary-totals">
              <div className="summary-row">
                <span>Товары ({itemCount} шт.)</span>
                <span>{totalPrice.toLocaleString('ru-RU')} ₸</span>
              </div>
              <div className="summary-row">
                <span>Доставка</span>
                <span className="free">Бесплатно</span>
              </div>
              <div className="summary-row total">
                <span>Итого</span>
                <span>{totalPrice.toLocaleString('ru-RU')} ₸</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}