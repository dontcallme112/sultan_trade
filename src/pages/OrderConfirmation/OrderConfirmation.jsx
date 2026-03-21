import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import './OrderConfirmation.css';

export default function OrderConfirmation() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { clearCart } = useCart();
  const [order, setOrder] = useState(null);
  const [copied, setCopied] = useState(false);

  // ВАШ НОМЕР KASPI (замените на реальный!)
  const KASPI_PHONE = '+7 700 123 45 67';
  const KASPI_NAME = 'LUXE Electronics';

  useEffect(() => {
    // Загружаем заказ из localStorage
    const orders = JSON.parse(localStorage.getItem('orders') || '[]');
    const foundOrder = orders.find(o => o.orderId === orderId);
    
    if (foundOrder) {
      setOrder(foundOrder);
      // Очищаем корзину
      clearCart();
    }
  }, [orderId, clearCart]);

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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

          {/* Kaspi Payment */}
          {order.paymentMethod === 'kaspi' && (
            <div className="payment-section kaspi-payment">
              <h2>Оплата через Kaspi</h2>
              
              <div className="kaspi-instructions">
                <div className="kaspi-step">
                  <div className="step-number">1</div>
                  <div className="step-content">
                    <h3>Откройте приложение Kaspi</h3>
                    <p>Перейдите в раздел "Платежи"</p>
                  </div>
                </div>

                <div className="kaspi-step">
                  <div className="step-number">2</div>
                  <div className="step-content">
                    <h3>Переведите на номер</h3>
                    <div className="kaspi-phone-block">
                      <input 
                        type="text" 
                        value={KASPI_PHONE} 
                        readOnly 
                        className="kaspi-phone"
                      />
                      <button 
                        className="copy-btn"
                        onClick={() => copyToClipboard(KASPI_PHONE)}
                      >
                        {copied ? '✓' : 'Копировать'}
                      </button>
                    </div>
                    <p className="kaspi-name">{KASPI_NAME}</p>
                  </div>
                </div>

                <div className="kaspi-step">
                  <div className="step-number">3</div>
                  <div className="step-content">
                    <h3>Сумма перевода</h3>
                    <div className="kaspi-amount">
                      {order.total.toLocaleString('ru-RU')} ₸
                    </div>
                  </div>
                </div>

                <div className="kaspi-step">
                  <div className="step-number">4</div>
                  <div className="step-content">
                    <h3>В комментарии укажите</h3>
                    <div className="kaspi-comment-block">
                      <input 
                        type="text" 
                        value={`Заказ ${orderId}`} 
                        readOnly 
                        className="kaspi-comment"
                      />
                      <button 
                        className="copy-btn"
                        onClick={() => copyToClipboard(`Заказ ${orderId}`)}
                      >
                        Копировать
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="kaspi-qr-section">
                <h3>Или отсканируйте QR-код</h3>
                <div className="kaspi-qr-image">
                  <img src="/kaspi-qr.png" alt="Kaspi QR" />
                </div>
              </div>

              <div className="payment-note">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="16" x2="12" y2="12"/>
                  <line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
                <p>После оплаты мы свяжемся с вами для подтверждения заказа</p>
              </div>
            </div>
          )}

          {/* Другие способы оплаты */}
          {order.paymentMethod !== 'kaspi' && (
            <div className="payment-section">
              <h2>Способ оплаты</h2>
              <p className="payment-method-text">
                {order.paymentMethod === 'cash' && 'Оплата наличными при получении'}
                {order.paymentMethod === 'card' && 'Оплата картой курьеру'}
              </p>
            </div>
          )}

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
              {order.items.map((item) => (
                <div key={item.id} className="order-item">
                  <img src={item.image} alt={item.name} />
                  <div className="order-item-info">
                    <h5>{item.name}</h5>
                    <p>{item.quantity} × {item.price.toLocaleString('ru-RU')} ₸</p>
                  </div>
                  <div className="order-item-total">
                    {(item.price * item.quantity).toLocaleString('ru-RU')} ₸
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
            <button 
              className="btn btn-primary btn-lg"
              onClick={() => navigate('/')}
            >
              Вернуться на главную
            </button>
            <button 
              className="btn btn-secondary btn-lg"
              onClick={() => navigate('/catalog')}
            >
              Продолжить покупки
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}