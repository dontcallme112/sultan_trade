import React, { useState, useEffect } from 'react';
import './Toast.css';

const Toast = () => {
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    const handleNotification = (event) => {
      const id = Date.now();
      const detail = event.detail;
      
      // Если detail это строка, создаем success уведомление
      // Если это объект с type, используем его
      const newNotification = {
        id,
        message: typeof detail === 'string' ? detail : detail.message,
        type: typeof detail === 'object' && detail.type ? detail.type : 'success',
      };

      setNotifications(prev => [...prev, newNotification]);

      // Автоматически удаляем уведомление через 3 секунды
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== id));
      }, 3000);
    };

    window.addEventListener('cart-notification', handleNotification);

    return () => {
      window.removeEventListener('cart-notification', handleNotification);
    };
  }, []);

  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const getIcon = (type) => {
    switch (type) {
      case 'success':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        );
      case 'error':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        );
      case 'warning':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        );
      case 'info':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <div className="toast-container">
      {notifications.map(notification => (
        <div 
          key={notification.id} 
          className={`toast toast-${notification.type} animate-slideInRight`}
          onClick={() => removeNotification(notification.id)}
        >
          <div className="toast-icon">
            {getIcon(notification.type)}
          </div>
          <p className="toast-message">{notification.message}</p>
          <button 
            className="toast-close"
            onClick={(e) => {
              e.stopPropagation();
              removeNotification(notification.id);
            }}
            aria-label="Закрыть"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
};

export default Toast;