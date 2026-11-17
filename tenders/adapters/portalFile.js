import { normalizeLot, AdapterError } from './common.js';

// Чтение файла лотов, сохранённого из публичного API портала zakup.gov.kz (формат {count,next,previous,facets,results}).
// Файл сохраняет человек из браузера. Робот портал НЕ опрашивает (robots.txt запрещает автоматический доступ).
const pick = (arr) => (Array.isArray(arr) && arr.length ? arr[0] : null);

export function parsePortalLots(json) {
  const list = Array.isArray(json) ? json : Array.isArray(json?.results) ? json.results : null;
  if (!list) throw new AdapterError('Не найден массив "results" в файле. Ожидается JSON из публичного API лотов портала.', 'BAD_FORMAT');
  const out = [], skipped = [];
  const ids = new Set(); let duplicates = 0;
  for (const [i, l] of list.entries()) {
    const id = l?.external_id ?? l?.lot_number;
    if (id == null || !['string','number'].includes(typeof id) || !String(id).trim() || (typeof id === 'number' && !Number.isFinite(id)) || ![l.name_ru,l.description_ru].some(v=>typeof v==='string' && v.trim())) { skipped.push(i); continue; }
    if (ids.has(String(id))) { duplicates++; continue; }
    const badNumber = v => v !== undefined && v !== null && v !== '' && (!Number.isFinite(Number(v)) || Number(v)<0);
    if (badNumber(l.total_price) || badNumber(l.quantity) || (l.offer_end_date && !Number.isFinite(Date.parse(l.offer_end_date))) || (l.announcement_publish_date && !Number.isFinite(Date.parse(l.announcement_publish_date)))) { skipped.push(i); continue; }
    ids.add(String(id));
    const cust = pick(l.customers), addr = pick(l.delivery_addresses);
    let sourceUrl = null;
    try { const u = new URL(l.url); if(u.protocol === 'https:' && !u.username && !u.password && ['goszakup.gov.kz','procurement.gov.kz','zakup.gov.kz','zakup.sk.kz'].some(h=>u.hostname===h || u.hostname.endsWith('.'+h))) sourceUrl=u.href; } catch { /* File need not contain a source URL. */ }
    out.push(normalizeLot('portal-file', {
      external_id: id,
      url: sourceUrl,
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
        enstru: (Array.isArray(l.enstrus) ? l.enstrus : []).slice(0,50).filter(e=>e && typeof e==='object').map(e => ({ code: String(e.code || '').slice(0,100), name: String(e.name_ru || '').slice(0,500), short: String(e.short_description_ru || '').slice(0,1000) })),
        dumping_price: l.dumping_price ?? null,
        name_kk: l.name_kk || null,
      },
    }));
  }
  if(list.length && !out.length) throw new AdapterError('В файле нет корректных лотов. Проверьте формат, суммы и даты.', 'BAD_FORMAT');
  return { lots: out, skipped: skipped.length, duplicates, total:list.length };
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
