// pricing.js — цена для покупателя.
//
// markupOnServer = false (по умолчанию): как раньше, API отдаёт ДИЛЕРСКУЮ цену, наценку добавляет браузер.
// markupOnServer = true  (MARKUP_ON_SERVER=true на Railway): API отдаёт ГОТОВУЮ цену (дилерская + наценка),
//                         закупочной цены и цены в $ в ответах нет вообще; фронт ничего не добавляет.
export function createPricing({ markupPercent = 5, markupOnServer = false, getUsdRate = () => null, privacy }) {
  const applyMarkup = (price) => Math.round(price * (1 + markupPercent / 100));

  // Дилерская цена: для товаров в $ это price_usd × курс; price1 = 1 у Al-Style означает «цена по запросу»
  const dealerPrice = (p) => {
    const usd = Number(p?.price_usd);
    if (usd > 0) { const rate = getUsdRate(); return rate ? Math.round(usd * rate) : 1; }   // нет курса -> «по запросу»
    const v = Number(p?.price1);
    return v > 1 ? v : 1;
  };

  // Защита от двойной наценки: объект, который уже прошёл через normalizePrice, второй раз не обрабатывается
  const done = new WeakSet();
  const normalizePrice = (p) => {
    if (done.has(p)) return p;
    const d = dealerPrice(p);
    const price = markupOnServer && d > 1 ? applyMarkup(d) : d;
    const draft = { ...p, price, price1: price, price2: price };
    if (markupOnServer) delete draft.price_usd;
    const out = privacy.publicProduct(draft);
    done.add(out);
    return out;
  };

  return { markupOnServer, applyMarkup, dealerPrice, normalizePrice };
}
