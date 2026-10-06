// apipay.js — приём оплаты Kaspi через ApiPay.kz (только сервер).
// Контракт сверен с https://apipay.kz/for-ai (шаги 3–6) и https://apipay.kz/guides/apipay-dlya-internet-magazina
// Ключ APIPAY_API_KEY берётся из переменной окружения и нигде не логируется и не уходит в ответы клиенту.

export const DEFAULT_BASE_URL = 'https://api.apipay.kz/api/v1';

/** Ошибка, текст которой можно показать покупателю */
export class UserError extends Error {
  constructor(status, message, extra = {}) { super(message); this.name = 'UserError'; this.status = status; this.extra = extra; }
}
/** Ошибка вызова ApiPay: без заголовков и конфигурации запроса (там лежит ключ) */
export class ApiPayError extends Error {
  constructor(message, { status = 0, code = null, body = null } = {}) {
    super(message); this.name = 'ApiPayError'; this.status = status; this.code = code; this.body = body;
  }
}

// +7 701 123 45 67 / 87011234567 / 7011234567 -> 87011234567 (формат ApiPay: 8 и 10 цифр)
export function toApiPayPhone(raw) {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (d.length === 11 && (d[0] === '7' || d[0] === '8')) return '8' + d.slice(1);
  if (d.length === 10) return '8' + d;
  return null;
}

// статус счёта ApiPay -> статус оплаты заказа (processing/pending/cancelling ждём; cancelled/expired/error закрыты, но могут стать paid)
export function mapStatus(s) {
  if (s === 'paid' || s === 'partially_refunded') return 'paid';
  if (s === 'cancelled' || s === 'expired' || s === 'error') return 'failed';
  return 'pending';   // processing, pending, cancelling и неизвестные: продолжаем проверять, счёт не пересоздаём
}

const shortId = (id) => String(id).replace(/-/g, '').slice(0, 8).toUpperCase();
const phoneFromComment = (c) => (String(c || '').match(/Тел:\s*([+\d][\d\s()+-]*)/) || [])[1] || null;
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * @param {object} deps
 *  apiKey   — значение APIPAY_API_KEY (может быть пустым: тогда оплата выключена)
 *  http     — { request(cfg) } как у axios; ответ { status, data }
 *  store    — { getOrder(id,userId?), saveOrder(id,patch), markPaid(id,patch)->bool, listOpen(limit) }
 *  notify   — async (htmlText) => void   (Telegram)
 */
export function createApiPayService({ apiKey, http, store, notify = async () => {}, log = console, minCheckGapMs = 3000, now = () => Date.now() }) {
  const configured = Boolean(apiKey);
  const iso = () => new Date(now()).toISOString();

  async function request(method, path, data) {
    if (!configured) throw new ApiPayError('APIPAY_API_KEY не задан', { code: 'not_configured' });
    let res;
    try {
      res = await http.request({ method, url: path, data, headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' }, validateStatus: () => true });
    } catch (e) {
      // сетевые ошибки axios содержат config.headers с ключом: наружу отдаём только код
      throw new ApiPayError('ApiPay недоступен', { code: e?.code || 'network' });
    }
    const body = res.data && typeof res.data === 'object' ? res.data : {};
    if (res.status >= 200 && res.status < 300) return { status: res.status, data: body };
    throw new ApiPayError(`ApiPay HTTP ${res.status}`, { status: res.status, code: body.error_code || body.error || null, body });
  }

  // что показываем клиенту при сбое ApiPay (подробности только в лог, без ключа)
  function userFacing(e) {
    if (e instanceof UserError) return e;
    const st = e.status, code = e.code;
    log.warn(`⚠️ ApiPay: HTTP ${st || '-'} ${code || ''}`.trim());
    if (st === 422 && /phone/i.test(JSON.stringify(e.body || {}))) return new UserError(422, 'Проверьте номер: нужен номер Kaspi в формате +7 7XX XXX XX XX');
    if (st === 422 && code === 'amount_must_be_whole_tenge') return new UserError(422, 'Сумма заказа не подходит для онлайн-оплаты. Менеджер свяжется с вами.');
    if (st === 429) return new UserError(429, 'Слишком много запросов. Подождите минуту и повторите.');
    // 401 (ключ), 403 (тариф/организация), 400/409/503 (кассир Kaspi), сеть: покупатель не может это исправить
    return new UserError(503, 'Онлайн-оплата сейчас недоступна. Заказ сохранён, менеджер свяжется с вами.');
  }

  const publicState = (o) => ({
    order_id: o.id,
    payment_status: o.payment_status || 'unpaid',
    invoice_id: o.payment_invoice_id || null,
    amount: Math.round(Number(o.total_price) || 0),
    paid_at: o.paid_at || null,
    error_code: o.payment_error || null,
  });

  async function notifyPaid(order, inv) {
    const amount = Math.round(Number(order.total_price) || 0).toLocaleString('ru-RU');
    const name = order.customer_name || (String(order.comment || '').match(/Имя:\s*([^|]+)/) || [])[1] || '';
    const phone = order.phone || phoneFromComment(order.comment) || '';
    const mode = inv?.is_sandbox ? ' (ТЕСТ, песочница)' : '';
    try {
      await notify(`✅ <b>Заказ #${shortId(order.id)} оплачен</b>${mode}\n\n💰 <b>${amount} ₸</b> (Kaspi)\n👤 ${esc(name)}\n📱 ${esc(phone)}`);
    } catch (e) { log.warn('⚠️ Telegram (оплата):', e?.message || 'ошибка'); }
  }

  // Проверка статуса счёта у ApiPay и запись результата в заказ. paid не понижается никогда.
  async function refresh(order, { force = false } = {}) {
    if (!order.payment_invoice_id || order.payment_status === 'paid') return order;
    const last = order.payment_checked_at ? Date.parse(order.payment_checked_at) : 0;
    if (!force && now() - last < minCheckGapMs) return order;

    const { data: inv } = await request('GET', `/invoices/${encodeURIComponent(order.payment_invoice_id)}`);
    const mapped = mapStatus(inv.status);
    const patch = { payment_checked_at: iso() };

    if (mapped === 'paid') {
      Object.assign(patch, { payment_status: 'paid', paid_at: inv.paid_at || iso(), payment_error: null });
      const first = await store.markPaid(order.id, patch);      // атомарно: true только для того, кто перевёл заказ в paid
      if (first) await notifyPaid(order, inv);
      return { ...order, ...patch };
    }
    if (mapped === 'failed') {
      Object.assign(patch, { payment_status: 'failed', payment_error: inv.error_code || inv.status, payment_closed_at: order.payment_closed_at || iso() });
    } else {
      Object.assign(patch, { payment_status: 'pending', payment_error: null, payment_closed_at: null });
    }
    await store.saveOrder(order.id, patch);
    return { ...order, ...patch };
  }

  // Выставить счёт Kaspi по заказу. Сумму берём ТОЛЬКО из заказа в базе.
  async function startPayment({ orderId, userId, kaspiPhone }) {
    if (!configured) throw new UserError(503, 'Онлайн-оплата сейчас недоступна. Заказ сохранён, менеджер свяжется с вами.');
    const order = await store.getOrder(orderId, userId);
    if (!order) throw new UserError(404, 'Заказ не найден');
    if (order.payment_status === 'paid') return publicState(order);

    try {
      if (order.payment_status === 'pending' && order.payment_invoice_id) {
        const cur = await refresh(order, { force: true });
        if (cur.payment_status === 'pending' || cur.payment_status === 'paid') return publicState(cur);
        order.payment_status = cur.payment_status; order.payment_error = cur.payment_error;
      }

      const amount = Math.round(Number(order.total_price));
      if (!Number.isFinite(amount) || amount < 1 || amount > 99_999_999) throw new UserError(422, 'Сумма заказа не подходит для онлайн-оплаты. Менеджер свяжется с вами.');
      const phone = toApiPayPhone(kaspiPhone || order.phone || phoneFromComment(order.comment));
      if (!phone) throw new UserError(422, 'Укажите номер Kaspi в формате +7 7XX XXX XX XX');

      const attempt = (Number(order.payment_attempts) || 0) + 1;
      const body = {
        phone_number: phone,
        amount,
        description: `Заказ Stockera #${shortId(order.id)}`.slice(0, 60),   // Kaspi показывает первые 60 символов
        external_order_id: order.id,
        external_order_id_idempotency: `order-${order.id}-${attempt}`,       // повторный клик той же попытки не создаст второй счёт
      };

      let invoiceId, isSandbox = false;
      try {
        const { data } = await request('POST', '/invoices', body);
        invoiceId = data.id; isSandbox = data.is_sandbox === true;
      } catch (e) {
        if (e instanceof ApiPayError && e.status === 409 && (e.code === 'duplicate_idempotency_key' || e.body?.invoice_id)) invoiceId = e.body.invoice_id;
        else throw e;
      }
      if (invoiceId == null || invoiceId === '') throw new ApiPayError('В ответе ApiPay нет id счёта', { code: 'bad_response' });

      const patch = { payment_invoice_id: String(invoiceId), payment_status: 'pending', payment_attempts: attempt, payment_error: null, payment_closed_at: null, payment_checked_at: iso() };
      await store.saveOrder(order.id, patch);
      return { ...publicState({ ...order, ...patch }), is_sandbox: isSandbox };
    } catch (e) { throw userFacing(e); }
  }

  // Текущее состояние оплаты (его опрашивает страница оплаты). ApiPay вызываем не чаще раза в minCheckGapMs на заказ.
  async function getState({ orderId, userId }) {
    const order = await store.getOrder(orderId, userId);
    if (!order) throw new UserError(404, 'Заказ не найден');
    if (configured && order.payment_invoice_id && order.payment_status !== 'paid') {
      try { return publicState(await refresh(order)); }
      catch (e) { log.warn(`⚠️ Проверка оплаты: ${e.status || e.code || 'ошибка'}`); return { ...publicState(order), check_error: true }; }
    }
    return publicState(order);
  }

  // Фоновая сверка: открытые заказы и закрытые счета ещё 24 часа (они могут стать paid)
  let busy = false;
  async function reconcile() {
    if (!configured || busy) return { skipped: true };
    busy = true;
    try {
      const open = await store.listOpen(50);
      let checked = 0;
      for (const o of open) {
        try { await refresh(o, { force: true }); checked++; }
        catch (e) { log.warn(`⚠️ Сверка оплаты: ${e.status || e.code || 'ошибка'}`); }
        await sleep(150);
      }
      return { checked };
    } finally { busy = false; }
  }

  return { configured, startPayment, getState, refresh, reconcile };
}
