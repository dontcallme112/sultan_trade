/**
 * Форматирует цену в доллары
 * @param {number} price - Цена
 * @returns {string} Отформатированная цена
 */
export const formatPrice = (price) => {
  return `$${parseFloat(price).toFixed(2)}`;
};

/**
 * Форматирует дату
 * @param {Date|string} date - Дата
 * @returns {string} Отформатированная дата
 */
export const formatDate = (date) => {
  const d = new Date(date);
  return d.toLocaleDateString('ru-RU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

/**
 * Сокращает текст до указанной длины
 * @param {string} text - Текст
 * @param {number} maxLength - Максимальная длина
 * @returns {string} Сокращенный текст
 */
export const truncateText = (text, maxLength = 100) => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

/**
 * Генерирует slug из строки
 * @param {string} text - Текст
 * @returns {string} Slug
 */
export const generateSlug = (text) => {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
};

/**
 * Проверяет, является ли изображение валидным URL
 * @param {string} url - URL изображения
 * @returns {boolean} Результат проверки
 */
export const isValidImageUrl = (url) => {
  return /\.(jpg|jpeg|png|webp|avif|gif|svg)$/.test(url);
};

/**
 * Получает инициалы из имени
 * @param {string} name - Имя
 * @returns {string} Инициалы
 */
export const getInitials = (name) => {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);
};

/**
 * Вычисляет процент скидки
 * @param {number} originalPrice - Оригинальная цена
 * @param {number} discountedPrice - Цена со скидкой
 * @returns {number} Процент скидки
 */
export const calculateDiscountPercentage = (originalPrice, discountedPrice) => {
  return Math.round(((originalPrice - discountedPrice) / originalPrice) * 100);
};

/**
 * Задержка выполнения (debounce)
 * @param {Function} func - Функция для выполнения
 * @param {number} wait - Время задержки в мс
 * @returns {Function} Debounced функция
 */
export const debounce = (func, wait = 300) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

/**
 * Проверяет, пустой ли объект
 * @param {Object} obj - Объект
 * @returns {boolean} Результат проверки
 */
export const isEmpty = (obj) => {
  return Object.keys(obj).length === 0;
};