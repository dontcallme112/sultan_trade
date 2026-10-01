/**
 * Утилиты для цен.
 * Бэкенд отдаёт ДИЛЕРСКУЮ цену (price1 из Al-Style); здесь к ней добавляется наценка.
 * ВАЖНО: значение должно совпадать с MARKUP_PERCENT на бэкенде (server.js, по умолчанию 5),
 * иначе цена на витрине и сумма заказа разойдутся.
 */

const MARKUP_PERCENT = 5; // наценка в процентах

// Цена по запросу: Al-Style отдаёт price1 = 1; пустые и нулевые значения тоже считаем "по запросу"
const isOnRequest = (price) => !Number.isFinite(Number(price)) || Number(price) <= 1;

/**
 * Добавляет наценку к цене
 */
export const applyMarkup = (price) => {
  return Math.round(Number(price) * (1 + MARKUP_PERCENT / 100));
};

/**
 * Форматирует число с пробелами между тысячами
 * Например: 1234567 → "1 234 567"
 */
export const formatNumber = (number) => {
  const rounded = Math.round(number);
  return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

/**
 * Форматирует цену БЕЗ наценки (просто добавляет пробелы и ₸)
 */
export const formatPriceSimple = (price) => {
  if (isOnRequest(price)) return 'Цена по запросу';
  return `${formatNumber(Number(price))} ₸`;
};

/**
 * Форматирует цену С наценкой
 */
export const formatPriceWithMarkup = (price) => {
  if (isOnRequest(price)) return 'Цена по запросу';
  return `${formatNumber(applyMarkup(price))} ₸`;
};

/**
 * Получить цену с наценкой (число)
 */
export const getPriceWithMarkup = (price) => {
  return applyMarkup(price);
};