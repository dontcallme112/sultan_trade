// Проверка данных покупателя. Те же правила, что на сервере (server.js, validateCustomer):
// сервер всё равно проверит повторно, здесь это нужно для понятных подсказок.

const NAME_RE = /^\p{L}[\p{L}'’.\-]+(?:\s+\p{L}[\p{L}'’.\-]+)+$/u; // минимум два слова: фамилия и имя

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

/**
 * Маска телефона: +7 (701) 123-45-67.
 * Закрывающая скобка и дефисы добавляются только когда следом есть цифры,
 * поэтому их можно стирать клавишей Backspace.
 */
export function formatPhone(value) {
  const raw = String(value ?? '').trim();
  let d = raw.replace(/\D/g, '');
  if (!d) return '';
  // Вставили номер без кода страны ("701 123 45 67" или "(701) 123-45-67"): 10 цифр и нет "+".
  // При ручном наборе значение всегда начинается с "+7", поэтому сюда оно не попадает.
  if (d.length === 10 && d[0] === '7' && !raw.startsWith('+')) d = '7' + d;
  if (d[0] === '8') d = '7' + d.slice(1);
  if (d[0] !== '7') d = '7' + d;
  d = d.slice(0, 11);
  let out = '+7';
  if (d.length > 1) out += ' (' + d.slice(1, 4);
  if (d.length > 4) out += ') ' + d.slice(4, 7);
  if (d.length > 7) out += '-' + d.slice(7, 9);
  if (d.length > 9) out += '-' + d.slice(9, 11);
  return out;
}

/** Возвращает объект с текстами ошибок. Пустой объект значит, что всё в порядке. */
export function validateCustomer({ name, phone, address }) {
  const errors = {};
  const n = clean(name);
  const a = clean(address);
  const digits = String(phone ?? '').replace(/\D/g, '');

  if (n.length < 5 || !NAME_RE.test(n)) errors.name = 'Укажите полное имя: фамилию и имя';
  if (digits.length !== 11 || digits[0] !== '7') errors.phone = 'Введите номер полностью, например +7 (701) 123-45-67';
  if (a.length < 10 || a.split(' ').length < 2) errors.address = 'Укажите полный адрес: город, улица, дом';
  return errors;
}

/** Ошибки сервера (customer_name / phone / address_text) -> поля формы */
export function mapServerFields(fields = {}) {
  const out = {};
  if (fields.customer_name) out.name = fields.customer_name;
  if (fields.phone) out.phone = fields.phone;
  if (fields.address_text) out.address = fields.address_text;
  return out;
}