/**
 * Утилиты для цен.
 * Наценку считает СЕРВЕР: бэкенд отдаёт уже готовую цену для покупателя (в price, price1 и price2),
 * закупочной цены в ответах API нет. Поэтому здесь наценка 0%: функции остались прежними, чтобы
 * все компоненты (карточка, корзина, избранное) продолжали работать без правок, но ничего не добавляют.
 *
 * НЕ ВКЛЮЧАЙТЕ наценку здесь снова: цена станет выше, чем в заказе. Размер наценки меняется
 * на сервере (Railway → Variables → MARKUP_PERCENT). Этот файл нужно выкладывать ТОЛЬКО вместе
 * с включённой на Railway переменной MARKUP_ON_SERVER=true.
 */

const MARKUP_PERCENT = 0; // наценка уже учтена сервером

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