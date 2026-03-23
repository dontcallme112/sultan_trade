import React, { createContext, useContext, useState, useEffect } from 'react';

const CartContext = createContext();

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within CartProvider');
  return context;
};

export const CartProvider = ({ children }) => {
  const [cartItems, setCartItems] = useState(() => {
    const savedCart = localStorage.getItem('luxe-cart');
    return savedCart ? JSON.parse(savedCart) : [];
  });

  useEffect(() => {
    localStorage.setItem('luxe-cart', JSON.stringify(cartItems));
  }, [cartItems]);

  const addToCart = (product) => {
    setCartItems((prev) => {
      const existingItem = prev.find((item) => item.id === product.id);
      if (existingItem) {
        return prev.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
    showNotification('Товар добавлен в корзину');
  };

  // ── НОВОЕ: добавить товар с нужным quantity ──────────────────
  const addToCartWithQuantity = (product, quantity = 1) => {
    setCartItems((prev) => {
      const existingItem = prev.find((item) => item.id === product.id);
      if (existingItem) {
        return prev.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [...prev, { ...product, quantity }];
    });
  };

  // ── НОВОЕ: buyNow — очищает корзину, добавляет 1 товар ───────
  // navigate передаётся снаружи (из компонента)
  const buyNow = (product, navigate, quantity = 1) => {
    // Очищаем корзину — пользователь покупает только этот товар
    setCartItems([{ ...product, quantity }]);
    // Сразу переходим на оформление
    navigate('/checkout');
  };

  const removeFromCart = (productId) => {
    setCartItems((prev) => prev.filter((item) => item.id !== productId));
    showNotification('Товар удален из корзины');
  };

  const updateQuantity = (productId, quantity) => {
    if (quantity <= 0) { removeFromCart(productId); return; }
    setCartItems((prev) =>
      prev.map((item) => item.id === productId ? { ...item, quantity } : item)
    );
  };

  const clearCart = () => {
    setCartItems([]);
    showNotification('Корзина очищена');
  };

  const getCartTotal = () => {
    return cartItems.reduce((total, item) => {
      const basePrice = item.discount
        ? item.price * (1 - item.discount / 100)
        : item.price;
      return total + basePrice * item.quantity;
    }, 0);
  };

  const getCartCount = () => {
    return cartItems.reduce((count, item) => count + item.quantity, 0);
  };

  const showNotification = (message) => {
    const event = new CustomEvent('cart-notification', { detail: message });
    window.dispatchEvent(event);
  };

  const value = {
    cartItems,
    addToCart,
    addToCartWithQuantity,
    buyNow,           // ← новое
    removeFromCart,
    updateQuantity,
    clearCart,
    getCartTotal,
    getCartCount,
  };

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
};