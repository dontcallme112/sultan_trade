/**
 * Утилита для форматирования цен с наценкой 10%
 */

const MARKUP_PERCENT = 10; // 10% наценка

/**
 * Добавляет 10% наценку к цене
 */
export const applyMarkup = (price) => {
  return Math.round(price * (1 + MARKUP_PERCENT / 100));
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
  if (price === 1) return 'Цена по запросу';
  return `${formatNumber(price)} ₸`;
};

/**
 * Форматирует цену С наценкой 10%
 */
export const formatPriceWithMarkup = (price) => {
  if (price === 1) return 'Цена по запросу';
  const priceWithMarkup = applyMarkup(price);
  return `${formatNumber(priceWithMarkup)} ₸`;
};

/**
 * Получить цену с наценкой (число)
 */
export const getPriceWithMarkup = (price) => {
  return applyMarkup(price);
};
