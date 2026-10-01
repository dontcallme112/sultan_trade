// Просит приложение открыть окно входа (AuthModal) из любого места: корзина, оформление заказа.
// Слушатель события 'open-auth-modal' должен стоять там, где рендерится AuthModal (обычно Header).
export const openAuthModal = () => {
  window.dispatchEvent(new CustomEvent('open-auth-modal'));
};