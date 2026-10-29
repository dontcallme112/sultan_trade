// requisites.js — оплата по реквизитам: проверка реквизитов компании, сборка счёта на оплату, сумма прописью.
// Реквизиты лежат в payment-config.json рядом с server.js. Пока в них стоит «ЗАПОЛНИТЬ» или есть ошибка (например, опечатка в IBAN),
// способ оплаты выключен, а в журнале сервера написано, что исправить: клиентам неверные реквизиты не показываются.

const PLACEHOLDER = /заполнить/i;
const text = (v, max = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// IBAN: страна, две контрольные цифры, остальное; проверка по алгоритму mod 97 (ловит опечатки и перестановки)
export function ibanValid(raw) {
  const iban = String(raw || '').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  const moved = iban.slice(4) + iban.slice(0, 4);
  let rem = 0;
  for (const ch of moved) { const v = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55); for (const d of v) rem = (rem * 10 + Number(d)) % 97; }
  return rem === 1;
}
export const formatIban = (raw) => String(raw || '').replace(/\s+/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim();

/** @returns { ok, company, problems[], vat, paymentDays } */
export function loadRequisites(config) {
  const c = config?.company || {};
  const problems = [];
  const need = (key, label) => { const v = text(c[key]); if (!v) problems.push(`не заполнено поле «${label}»`); else if (PLACEHOLDER.test(v)) problems.push(`в поле «${label}» остался текст ЗАПОЛНИТЬ`); return v; };
  const company = {
    name: need('name', 'Название организации'), bin: need('bin', 'БИН или ИИН').replace(/\s+/g, ''), iban: need('iban', 'IBAN (ИИК)').replace(/\s+/g, '').toUpperCase(),
    bank: need('bank', 'Банк'), bic: need('bic', 'БИК').replace(/\s+/g, '').toUpperCase(), kbe: text(c.kbe, 4), address: text(c.address, 250), phone: text(c.phone, 40), email: text(c.email, 100),
  };
  if (company.bin && !PLACEHOLDER.test(company.bin) && !/^\d{12}$/.test(company.bin)) problems.push('БИН или ИИН должен состоять из 12 цифр');
  if (company.iban && !PLACEHOLDER.test(company.iban) && !ibanValid(company.iban)) problems.push('IBAN не проходит проверку (проверьте, нет ли опечатки)');
  if (company.bic && !PLACEHOLDER.test(company.bic) && !/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(company.bic)) problems.push('БИК должен состоять из 8 латинских букв и цифр');
  if (company.kbe && !/^\d{2}$/.test(company.kbe)) problems.push('КБе должен состоять из двух цифр');
  const vat = ['none', '12'].includes(String(config?.vat)) ? String(config.vat) : 'none';
  const days = Math.min(Math.max(parseInt(config?.paymentDays, 10) || 3, 1), 30);
  return { ok: problems.length === 0, company, problems, vat, paymentDays: days };
}

// ───── сумма прописью: «Сто сорок пять тысяч тенге 00 тиын» ─────
const ONES = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const ONES_F = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const TEENS = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
const TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
const HUNDREDS = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];
const SCALES = [null, { f: ['тысяча', 'тысячи', 'тысяч'], fem: true }, { f: ['миллион', 'миллиона', 'миллионов'] }, { f: ['миллиард', 'миллиарда', 'миллиардов'] }];
const plural = (n, [one, few, many]) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; };
function triplet(n, fem) {
  const out = [HUNDREDS[Math.floor(n / 100)]], r = n % 100;
  if (r >= 10 && r < 20) out.push(TEENS[r - 10]); else { out.push(TENS[Math.floor(r / 10)]); out.push((fem ? ONES_F : ONES)[r % 10]); }
  return out.filter(Boolean).join(' ');
}
export function amountInWords(amount) {
  const abs = Math.abs(Number(amount) || 0);
  let tenge = Math.floor(abs + 1e-9), tiyn = Math.round((abs - tenge) * 100);
  if (tiyn === 100) { tenge += 1; tiyn = 0; }
  if (tenge >= 1e12) return String(amount);
  const parts = [];
  for (let i = 3; i >= 0; i--) {
    const chunk = Math.floor(tenge / 1000 ** i) % 1000; if (!chunk) continue;
    parts.push(triplet(chunk, SCALES[i]?.fem));
    if (SCALES[i]) parts.push(plural(chunk, SCALES[i].f));
  }
  const words = parts.length ? parts.join(' ') : 'ноль';
  return `${words[0].toUpperCase()}${words.slice(1)} тенге ${String(tiyn).padStart(2, '0')} тиын`;
}

// ───── счёт на оплату по заказу (цены и позиции берём из заказа в базе, не от клиента) ─────
export function buildInvoice(order, req, { now = Date.now(), scrub = (s) => s } = {}) {
  const items = (Array.isArray(order.items) ? order.items : []).map((it, i) => {
    const qty = Number(it.quantity) || 0, price = Number(it.price) || 0;
    return { n: i + 1, name: scrub(text(it.name || 'Товар', 250)), unit: text(it.unit || 'шт.', 12), qty, price, sum: Math.round(price * qty) };
  });
  const total = items.reduce((s, i) => s + i.sum, 0);
  const created = new Date(order.created_at || now);
  const due = new Date(created.getTime() + req.paymentDays * 86400000);
  const number = String(order.id).slice(0, 8).toUpperCase();
  return {
    number, date: created.toISOString(), due: due.toISOString(), seller: req.company,
    buyer: { name: text(order.customer_name, 120), phone: text(order.phone, 40), address: text(order.address_text, 250) },
    items, total, totalWords: amountInWords(total),
    vat: req.vat === '12' ? { rate: 12, amount: Math.round((total * 12) / 112) } : null,
    purpose: `Оплата заказа ${number}`,
  };
}
