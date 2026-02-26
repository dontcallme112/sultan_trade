import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { formatNumber } from '../../utils/priceUtils';
import './Checkout.css';

const Checkout = () => {
  const { cartItems, getCartTotal, clearCart } = useCart();
  const navigate = useNavigate();
  const total = getCartTotal();

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    city: 'Алматы',
    address: '',
    deliveryMethod: 'pickup',
    paymentMethod: 'kaspi',
    comment: ''
  });

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Очищаем ошибку при вводе
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const validate = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Укажите ваше имя';
    }

    if (!formData.phone.trim()) {
      newErrors.phone = 'Укажите номер телефона';
    } else if (!/^(\+7|8)[\d\s()-]{10,}$/.test(formData.phone)) {
      newErrors.phone = 'Неверный формат телефона';
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Неверный формат email';
    }

    if (formData.deliveryMethod === 'courier' && !formData.address.trim()) {
      newErrors.address = 'Укажите адрес доставки';
    }

    return newErrors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const newErrors = validate();
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsSubmitting(true);

    try {
      // Здесь будет интеграция с API al-style
      // await cartAPI.submit({ ...formData, items: cartItems, total });
      
      // Имитация отправки
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Успешное оформление
      const orderId = Math.floor(Math.random() * 1000000);
      clearCart();
      navigate(`/order-success/${orderId}`);
    } catch (error) {
      console.error('Checkout error:', error);
      alert('Ошибка при оформлении заказа. Попробуйте позже.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (cartItems.length === 0) {
    navigate('/cart');
    return null;
  }

  return (
    <div className="checkout-page">
      <div className="container">
        <h1 className="page-title animate-fadeIn">Оформление заказа</h1>

        <div className="checkout-layout">
          {/* Форма */}
          <div className="checkout-form animate-fadeInUp">
            <form onSubmit={handleSubmit}>
              {/* Контактные данные */}
              <section className="form-section">
                <h2 className="section-title">Контактные данные</h2>
                
                <div className="form-group">
                  <label htmlFor="name">
                    Имя и фамилия <span className="required">*</span>
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    className={errors.name ? 'error' : ''}
                    placeholder="Иван Иванов"
                  />
                  {errors.name && <span className="error-message">{errors.name}</span>}
                </div>

                <div className="form-group">
                  <label htmlFor="phone">
                    Телефон <span className="required">*</span>
                  </label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    className={errors.phone ? 'error' : ''}
                    placeholder="+7 (777) 123-45-67"
                  />
                  {errors.phone && <span className="error-message">{errors.phone}</span>}
                </div>

                <div className="form-group">
                  <label htmlFor="email">Email (опционально)</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    className={errors.email ? 'error' : ''}
                    placeholder="example@mail.com"
                  />
                  {errors.email && <span className="error-message">{errors.email}</span>}
                </div>
              </section>

              {/* Доставка */}
              <section className="form-section">
                <h2 className="section-title">Способ получения</h2>
                
                <div className="radio-group">
                  <label className="radio-option">
                    <input
                      type="radio"
                      name="deliveryMethod"
                      value="pickup"
                      checked={formData.deliveryMethod === 'pickup'}
                      onChange={handleChange}
                    />
                    <div className="radio-content">
                      <span className="radio-title">Самовывоз</span>
                      <span className="radio-description">Бесплатно • ул. Панфилова, 10</span>
                    </div>
                  </label>

                  <label className="radio-option">
                    <input
                      type="radio"
                      name="deliveryMethod"
                      value="courier"
                      checked={formData.deliveryMethod === 'courier'}
                      onChange={handleChange}
                    />
                    <div className="radio-content">
                      <span className="radio-title">Курьером по городу</span>
                      <span className="radio-description">3 000 ₸ • 1-2 дня</span>
                    </div>
                  </label>
                </div>

                {formData.deliveryMethod === 'courier' && (
                  <div className="form-group animate-fadeIn">
                    <label htmlFor="city">Город</label>
                    <select
                      id="city"
                      name="city"
                      value={formData.city}
                      onChange={handleChange}
                    >
                      <option value="Алматы">Алматы</option>
                      <option value="Астана">Астана</option>
                      <option value="Шымкент">Шымкент</option>
                    </select>

                    <label htmlFor="address">
                      Адрес доставки <span className="required">*</span>
                    </label>
                    <input
                      type="text"
                      id="address"
                      name="address"
                      value={formData.address}
                      onChange={handleChange}
                      className={errors.address ? 'error' : ''}
                      placeholder="Улица, дом, квартира"
                    />
                    {errors.address && <span className="error-message">{errors.address}</span>}
                  </div>
                )}
              </section>

              {/* Оплата */}
              <section className="form-section">
                <h2 className="section-title">Способ оплаты</h2>
                
                <div className="radio-group">
                  <label className="radio-option">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="kaspi"
                      checked={formData.paymentMethod === 'kaspi'}
                      onChange={handleChange}
                    />
                    <div className="radio-content">
                      <span className="radio-title">Kaspi Pay</span>
                      <span className="radio-description">QR-код оплата</span>
                    </div>
                  </label>

                  <label className="radio-option">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="card"
                      checked={formData.paymentMethod === 'card'}
                      onChange={handleChange}
                    />
                    <div className="radio-content">
                      <span className="radio-title">Банковская карта</span>
                      <span className="radio-description">Visa, MasterCard, Халык</span>
                    </div>
                  </label>

                  <label className="radio-option">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="cash"
                      checked={formData.paymentMethod === 'cash'}
                      onChange={handleChange}
                    />
                    <div className="radio-content">
                      <span className="radio-title">Наличными</span>
                      <span className="radio-description">При получении</span>
                    </div>
                  </label>
                </div>
              </section>

              {/* Комментарий */}
              <section className="form-section">
                <div className="form-group">
                  <label htmlFor="comment">Комментарий к заказу</label>
                  <textarea
                    id="comment"
                    name="comment"
                    value={formData.comment}
                    onChange={handleChange}
                    placeholder="Дополнительная информация (опционально)"
                    rows="3"
                  />
                </div>
              </section>

              <button 
                type="submit" 
                className="submit-btn"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Оформление...' : `Оформить заказ на ${formatNumber(total)} ₸`}
              </button>
            </form>
          </div>

          {/* Сводка заказа */}
          <aside className="order-summary animate-fadeInScale">
            <h3>Ваш заказ</h3>
            
            <div className="summary-items">
              {cartItems.map(item => (
                <div key={item.id} className="summary-item">
                  <img src={item.image} alt={item.title} />
                  <div className="item-info">
                    <span className="item-name">{item.title}</span>
                    <span className="item-quantity">× {item.quantity}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="summary-details">
              <div className="summary-row">
                <span>Товары ({cartItems.length})</span>
                <span>{formatNumber(total)} ₸</span>
              </div>
              {formData.deliveryMethod === 'courier' && (
                <div className="summary-row">
                  <span>Доставка</span>
                  <span>3 000 ₸</span>
                </div>
              )}
            </div>

            <div className="summary-total">
              <span>Итого</span>
              <span>
                {formatNumber(
                  total + (formData.deliveryMethod === 'courier' ? 3000 : 0)
                )} ₸
              </span>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default Checkout;