// API Configuration
export const API_BASE_URL = 'https://fakestoreapi.com';
export const API_TIMEOUT = 10000;

// App Configuration
export const APP_NAME = 'LUXE';
export const APP_DESCRIPTION = 'Премиум интернет-магазин';

// Pagination
export const PRODUCTS_PER_PAGE = 12;
export const MAX_PRODUCTS_DISPLAY = 100;

// Cart
export const MAX_CART_ITEMS = 99;
export const CART_STORAGE_KEY = 'luxe-cart';

// Categories
export const CATEGORIES = [
  { id: 'electronics', name: 'Электроника', icon: '⚡' },
  { id: 'jewelery', name: 'Украшения', icon: '💎' },
  { id: "men's clothing", name: 'Мужская одежда', icon: '👔' },
  { id: "women's clothing", name: 'Женская одежда', icon: '👗' },
];

// Sort Options
export const SORT_OPTIONS = [
  { value: 'default', label: 'По умолчанию' },
  { value: 'price-asc', label: 'Цена: по возрастанию' },
  { value: 'price-desc', label: 'Цена: по убыванию' },
  { value: 'rating', label: 'По рейтингу' },
  { value: 'name', label: 'По названию' },
];

// Price Ranges
export const PRICE_RANGES = [
  { min: 0, max: 50, label: 'До $50' },
  { min: 50, max: 100, label: '$50 - $100' },
  { min: 100, max: 200, label: '$100 - $200' },
  { min: 200, max: 500, label: '$200 - $500' },
  { min: 500, max: Infinity, label: 'Более $500' },
];

// Rating Options
export const RATING_OPTIONS = [5, 4, 3, 2, 1];

// Delivery Options
export const DELIVERY_OPTIONS = [
  { id: 'standard', name: 'Стандартная доставка', price: 10, days: '3-5 дней' },
  { id: 'express', name: 'Экспресс доставка', price: 25, days: '1-2 дня' },
  { id: 'pickup', name: 'Самовывоз', price: 0, days: 'Сегодня' },
];

// Payment Methods
export const PAYMENT_METHODS = [
  { id: 'card', name: 'Банковская карта', icon: '💳' },
  { id: 'cash', name: 'Наличные при получении', icon: '💵' },
  { id: 'online', name: 'Онлайн оплата', icon: '🌐' },
];

// Social Links
export const SOCIAL_LINKS = {
  instagram: 'https://instagram.com',
  facebook: 'https://facebook.com',
  twitter: 'https://twitter.com',
  youtube: 'https://youtube.com',
};

// Contact Info
export const CONTACT_INFO = {
  phone: '+7 (700) 123-45-67',
  email: 'info@luxe.com',
  address: 'Алматы, Казахстан',
  workingHours: 'Ежедневно 9:00 — 21:00',
};

// Error Messages
export const ERROR_MESSAGES = {
  network: 'Ошибка сети. Проверьте подключение к интернету.',
  notFound: 'Запрашиваемый ресурс не найден.',
  server: 'Ошибка сервера. Попробуйте позже.',
  validation: 'Проверьте правильность введенных данных.',
  generic: 'Произошла ошибка. Попробуйте еще раз.',
};

// Success Messages
export const SUCCESS_MESSAGES = {
  addedToCart: 'Товар добавлен в корзину',
  removedFromCart: 'Товар удален из корзины',
  cartCleared: 'Корзина очищена',
  orderPlaced: 'Заказ успешно оформлен',
};

// Regex Patterns
export const REGEX_PATTERNS = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  phone: /^(\+7|8)[\s-]?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}$/,
  cardNumber: /^\d{16}$/,
};

// Animation Durations (in ms)
export const ANIMATION_DURATION = {
  fast: 150,
  base: 250,
  slow: 400,
};

// Breakpoints (in px)
export const BREAKPOINTS = {
  mobile: 768,
  tablet: 1024,
  desktop: 1400,
};