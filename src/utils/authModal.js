// Просит приложение открыть окно входа (AuthModal) из любого места: корзина, оформление заказа.
//
// Слушатель события 'open-auth-modal' должен стоять там, где рендерится AuthModal (обычно Header)
// и вызывать e.preventDefault(), чтобы показать, что событие обработано:
//
//   useEffect(() => {
//     const open = (e) => { e.preventDefault(); setShowAuth(true); };   // setShowAuth: ваше состояние окна входа
//     window.addEventListener('open-auth-modal', open);
//     return () => window.removeEventListener('open-auth-modal', open);
//   }, []);
//
// Пока слушателя нет, показываем понятную подсказку вместо "мёртвой" кнопки.
export const openAuthModal = () => {
  const event = new CustomEvent('open-auth-modal', { cancelable: true });
  window.dispatchEvent(event);
  if (!event.defaultPrevented) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    window.alert('Чтобы продолжить, войдите в аккаунт: нажмите значок профиля в правом верхнем углу.');
  }
};