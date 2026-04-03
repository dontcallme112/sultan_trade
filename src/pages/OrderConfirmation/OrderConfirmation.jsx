import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import './OrderConfirmation.css';

export default function OrderConfirmation() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { clearCart } = useCart();
  const [order, setOrder] = useState(null);

  useEffect(() => {
    const orders = JSON.parse(localStorage.getItem('orders') || '[]');
    const foundOrder = orders.find(o => o.orderId === orderId);
    if (foundOrder) {
      setOrder(foundOrder);
      clearCart();
    }
  }, [orderId]);

  if (!order) {
    return (
      <div className="order-confirmation-page">
        <div className="container">
          <div className="loading">Загрузка...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="order-confirmation-page">
      <div className="container">
        <div className="confirmation-content">

          {/* Успех */}
          <div className="success-header">
            <div className="success-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
            <h1>Заказ оформлен!</h1>
            <p className="order-number">Номер заказа: <strong>{orderId}</strong></p>
          </div>

          {/* Оплата через Kaspi Pay */}
          <div className="payment-section kaspi-payment">
            <div className="kaspi-pay-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="5" width="20" height="14" rx="2"/>
                <path d="M2 10h20"/>
              </svg>
            </div>
            <h2>Оплата через Kaspi Pay</h2>
            <p className="kaspi-pay-desc">
              Мы свяжемся с вами по номеру <strong>{order.customer.phone}</strong> и вышлем счёт через Kaspi Pay.
              Вам останется только подтвердить оплату в приложении Kaspi.
            </p>
            <div className="kaspi-pay-steps">
              <div className="kaspi-pay-step">
                <div className="kps-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.06 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 16.92z"/>
                  </svg>
                </div>
                <span>Мы позвоним вам</span>
              </div>
              <div className="kps-arrow">→</div>
              <div className="kaspi-pay-step">
                <div className="kps-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                </div>
                <span>Вышлем счёт в Kaspi</span>
              </div>
              <div className="kps-arrow">→</div>
              <div className="kaspi-pay-step">
                <div className="kps-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                  </svg>
                </div>
                <span>Вы подтверждаете оплату</span>
              </div>
            </div>
            <div className="payment-note">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="16" x2="12" y2="12"/>
                <line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
              <p>Обычно мы связываемся в течение 30 минут в рабочее время</p>
            </div>
          </div>

          {/* Детали заказа */}
          <div className="order-details">
            <h2>Детали заказа</h2>

            <div className="order-info-grid">
              <div className="info-block">
                <h4>Покупатель</h4>
                <p>{order.customer.name}</p>
                <p>{order.customer.phone}</p>
                {order.customer.email && <p>{order.customer.email}</p>}
              </div>
              <div className="info-block">
                <h4>Адрес доставки</h4>
                <p>{order.customer.address}</p>
              </div>
              {order.customer.comment && (
                <div className="info-block">
                  <h4>Комментарий</h4>
                  <p>{order.customer.comment}</p>
                </div>
              )}
            </div>

            <div className="order-items">
              <h4>Товары ({order.items.length})</h4>
              {order.items.map((item, index) => (
                <div key={item.article || index} className="order-item">
                  <img src={item.image_url || item.image} alt={item.name} />
                  <div className="order-item-info">
                    <h5>{item.name}</h5>
                    <p>{item.quantity} × {(item.price || 0).toLocaleString('ru-RU')} ₸</p>
                  </div>
                  <div className="order-item-total">
                    {((item.price || 0) * item.quantity).toLocaleString('ru-RU')} ₸
                  </div>
                </div>
              ))}
            </div>

            <div className="order-total">
              <span>Итого:</span>
              <span className="total-amount">{order.total.toLocaleString('ru-RU')} ₸</span>
            </div>
          </div>

          {/* Действия */}
          <div className="confirmation-actions">
            <button className="btn btn-primary btn-lg" onClick={() => navigate('/')}>
              Вернуться на главную
            </button>
            <button className="btn btn-secondary btn-lg" onClick={() => navigate('/catalog')}>
              Продолжить покупки
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}