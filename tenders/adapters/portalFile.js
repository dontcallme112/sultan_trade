import { normalizeLot, AdapterError } from './common.js';

// Чтение файла лотов, сохранённого из публичного API портала zakup.gov.kz (формат {count,next,previous,facets,results}).
// Файл сохраняет человек из браузера. Робот портал НЕ опрашивает (robots.txt запрещает автоматический доступ).
const pick = (arr) => (Array.isArray(arr) && arr.length ? arr[0] : null);

export function parsePortalLots(json) {
  const list = Array.isArray(json) ? json : Array.isArray(json?.results) ? json.results : null;
  if (!list) throw new AdapterError('Не найден массив "results" в файле. Ожидается JSON из публичного API лотов портала.', 'BAD_FORMAT');
  const out = [], skipped = [];
  for (const [i, l] of list.entries()) {
    const id = l?.external_id ?? l?.lot_number;
    if (id == null || !(l.name_ru || l.description_ru)) { skipped.push(i); continue; }
    const cust = pick(l.customers), addr = pick(l.delivery_addresses);
    out.push(normalizeLot('portal-file', {
      external_id: id,
      number: l.lot_number ?? null,
      title: l.name_ru || l.description_ru,
      description: l.description_ru && l.description_ru !== l.name_ru ? l.description_ru : null,
      customer_name: cust?.name_ru || l.organization_name || null,
      customer_bin: cust?.bin || null,
      region_code: addr?.code || null,
      region_name: addr?.name_ru || null,
      method: l.purchase_method_name || null,
      status_raw: l.status_name || l.status?.name || null,
      total_price: l.total_price,
      quantity: l.quantity,
      published_at: l.announcement_publish_date || null,
      deadline_at: l.offer_end_date || null,
      extra: {
        announcement_number: l.announcement_number || null,
        enstru: (l.enstrus || []).map(e => ({ code: e.code, name: e.name_ru, short: e.short_description_ru })),
        dumping_price: l.dumping_price ?? null,
        name_kk: l.name_kk || null,
      },
    }));
  }
  return { lots: out, skipped: skipped.length };
}

export function createPortalFileAdapter() {
  return {
    id: 'portal-file', kind: 'file',
    label: { ru: 'Портал госзакупок: файл лотов', kk: 'Мемлекеттік сатып алу: лоттар файлы' },
    status: () => ({ state: 'ready', message: 'Загрузка JSON-файла, сохранённого из публичного API лотов портала. Автоматического опроса нет.' }),
    async fetch(input) { return parsePortalLots(input).lots; },
    parse: parsePortalLots,
  };
}
