// Чистые функции раздела тендеров (без React), чтобы их можно было проверять тестами.
export const fmtMoney = (v) => (v == null || !Number.isFinite(Number(v)) ? '—' : `${Math.round(Number(v)).toLocaleString('ru-RU')} ₸`);

export function fmtDate(iso, lang = 'ru') {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(lang === 'kk' ? 'kk-KZ' : 'ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// «Осталось 3 дн.» / «Просрочено»
export function deadlineLeft(iso, now = Date.now()) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now;
  if (Number.isNaN(ms)) return null;
  if (ms <= 0) return { expired: true, days: 0, hours: 0 };
  return { expired: false, days: Math.floor(ms / 86400000), hours: Math.floor((ms % 86400000) / 3600000) };
}

// Цветовая полоса оценки. null — оценки нет.
export function scoreBand(score) {
  if (score == null) return 'none';
  if (score >= 70) return 'high';
  if (score >= 40) return 'mid';
  return 'low';
}

// Из состояния фильтров делаем query: пустое не отправляем.
export function buildQuery(f, page = 1) {
  const q = { page, limit: 25 };
  const put = (k, v) => { if (v !== undefined && v !== null && String(v).trim() !== '' && v !== false) q[k] = v === true ? 'true' : String(v).trim(); };
  put('q', f.q); put('direction', f.direction); put('workStatus', f.workStatus);
  put('minPrice', f.minPrice); put('maxPrice', f.maxPrice); put('minScore', f.minScore);
  put('region', f.region); put('sort', f.sort); put('onlyOpen', f.onlyOpen); put('onlyFav', f.onlyFav);
  return q;
}

export const FACTOR_LABELS = {
  ru: { direction: 'Направление', price: 'Сумма', deadline: 'Срок подачи', region: 'Регион', method: 'Способ закупки', status: 'Статус' },
  kk: { direction: 'Бағыт', price: 'Сома', deadline: 'Өтінім мерзімі', region: 'Аймақ', method: 'Сатып алу тәсілі', status: 'Мәртебе' },
};

export const SOURCE_STATE_LABELS = {
  ru: { ready: 'Работает', needs_connection: 'Не подключён', not_implemented: 'Не реализован' },
  kk: { ready: 'Жұмыс істейді', needs_connection: 'Қосылмаған', not_implemented: 'Іске асырылмаған' },
};
