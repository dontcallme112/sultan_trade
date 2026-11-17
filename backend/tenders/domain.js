export const statuses = ['new', 'analysis', 'interesting', 'preparing', 'participating', 'won', 'lost', 'rejected'];
export const categories = {
  security: ['камер', 'видеонаблюд', 'nvr', 'vms', 'өрт', 'пожар', 'извещател', 'соуэ', 'скуд', 'турникет', 'face id'],
  it: ['компьютер', 'сервер', 'сетев', 'sfp', 'qsfp', 'dwdm', 'gpon'],
  display: ['панел', 'led', 'экран', 'аудио'],
  electrical: ['электр', 'ибп', 'генератор'],
  construction: ['строитель', 'ремонт', 'огражден'],
};
export function scoreTender(tender) {
  const text = `${tender.title} ${tender.description || ''}`.toLowerCase();
  const matches = Object.entries(categories).filter(([, words]) => words.some(w => text.includes(w))).map(([key]) => key);
  return { score: matches.length ? 100 : 0, coverage: 0.2, category: matches[0] || 'other',
    explanation: matches.length ? 'Совпадение ключевых слов деятельности компании' : 'Совпадения ключевых слов не найдены',
    unknown: ['Прибыль', 'Наличие оборудования', 'Лицензии', 'Срок поставки', 'Договорные риски'],
    formula: '100 × наличие совпадения ключевых слов. Это рейтинг соответствия, не итоговый AI-рейтинг.' };
}
export function filterTenders(rows, query, now = Date.now()) {
  const number = key => {
    if (query[key] === undefined || query[key] === '') return null;
    const n = Number(query[key]);
    if (!Number.isFinite(n) || n < 0) throw Object.assign(new Error(`Некорректный ${key}`), { status: 400 });
    return n;
  };
  const min = number('min'), max = number('max');
  if (min !== null && max !== null && min > max) throw Object.assign(new Error('Минимум больше максимума'), { status: 400 });
  if (query.before && !Number.isFinite(Date.parse(query.before))) throw Object.assign(new Error('Некорректная дата'), { status: 400 });
  const search = String(query.search || '').slice(0, 200).toLowerCase();
  const result = rows.filter(t =>
    `${t.title} ${t.description || ''} ${t.customer}`.toLowerCase().includes(search) &&
    (!query.region || t.region === query.region) && (!query.category || t.rating.category === query.category) &&
    (!query.method || t.method === query.method) && (!query.customer || t.customer.toLowerCase().includes(String(query.customer).toLowerCase())) &&
    (!query.status || t.workflow === query.status) && (query.favorite !== 'true' || t.favorite) &&
    (query.active !== 'true' || (t.publication_status === 'published' && Date.parse(t.deadline) > now)) &&
    (min === null || t.amount >= min) && (max === null || t.amount <= max) &&
    (!query.before || Date.parse(t.deadline) <= Date.parse(query.before)));
  const sort = { amount: (a,b) => b.amount-a.amount, rating: (a,b) => b.rating.score-a.rating.score,
    deadline: (a,b) => Date.parse(a.deadline)-Date.parse(b.deadline), newest: (a,b) => Date.parse(b.first_seen)-Date.parse(a.first_seen) };
  return result.sort(sort[query.sort] || sort.deadline);
}
export function demoTenders() {
  // Fixed fixtures: repeated synchronization must not invent changes or extend deadlines.
  return [
    ['1', 'Комплект видеонаблюдения: 16 IP-камер и NVR', 'Астана', 4800000, 'Тестовая школа №1', 'security'],
    ['2', 'Сервер и сетевое оборудование', 'Алматы', 9200000, 'Тестовый центр IT', 'it'],
    ['3', 'Монтаж пожарной сигнализации', 'Кызылорда', 3100000, 'Тестовая поликлиника', 'security'],
    ['4', 'Ремонт ограждения', 'Шымкент', 6500000, 'Тестовый заказчик', 'construction'],
  ].map(([id, title, region, amount, customer]) => ({ id: `demo:${id}`, external_id: id, source: 'demo', title,
    region, amount, customer, method: 'Демонстрационный конкурс', publication_status: 'published',
    deadline: `2027-01-${String(10 + Number(id)).padStart(2, '0')}T12:00:00+05:00`,
    description: 'ТЕСТОВЫЕ ДАННЫЕ. Не является реальной закупкой. Техническая спецификация и коммерческие предложения отсутствуют.',
    source_url: null, demo: true }));
}
export const sources = [
  { id: 'demo', status: 'available', label: 'Демонстрационные данные', reason: 'Тестовые записи, не реальные закупки' },
  { id: 'goszakup', status: 'disabled', label: 'goszakup.gov.kz', reason: 'Требуется официальный токен и проверка доступа; импорт отключён', documentation: 'https://ows.goszakup.gov.kz/help/' },
  { id: 'samruk', status: 'disabled', label: 'zakup.sk.kz', reason: 'Разрешённая публичная интеграция и условия доступа не подтверждены' },
];
