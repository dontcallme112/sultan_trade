// Подключает бота к чату: говорит Telegram присылать сообщения менеджеров на наш сервер.
//
//   node set-chat-webhook.mjs https://sultantrade-production.up.railway.app          (проверка и подключение)
//   node set-chat-webhook.mjs https://sultantrade-production.up.railway.app --force  (заменить чужой вебхук)
//
// Берёт из окружения: CHAT_BOT_TOKEN (или TELEGRAM_BOT_TOKEN) и CHAT_WEBHOOK_SECRET. Токен и секрет нигде не печатаются.
// ВНИМАНИЕ: у бота может быть только один вебхук. Если бот уже используется другим сервисом, скрипт остановится и спросит --force.
const base = (process.argv[2] || '').replace(/\/+$/, '');
const force = process.argv.includes('--force');
const token = process.env.CHAT_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.CHAT_WEBHOOK_SECRET || '';
const api = (process.env.TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/+$/, '');
const fail = (m) => { console.error('✖ ' + m); process.exit(1); };

if (!/^https:\/\/[\w.-]+(:\d+)?$/.test(base)) fail('Первым параметром укажите адрес сервера, например https://sultantrade-production.up.railway.app (только https, без пути).');
if (!token) fail('Не задан CHAT_BOT_TOKEN (или TELEGRAM_BOT_TOKEN).');
if (!/^[A-Za-z0-9_-]{16,256}$/.test(secret)) fail('CHAT_WEBHOOK_SECRET должен быть 16–256 символов: латинские буквы, цифры, _ и -.');

async function tg(method, body) {
  let res;
  try { res = await fetch(`${api}/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }); }
  catch { fail('Нет связи с Telegram.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) fail(`Telegram вернул ошибку: HTTP ${res.status}${data.description ? ' ' + data.description : ''}`);
  return data.result;
}

const target = `${base}/api/chat/telegram`;
const info = await tg('getWebhookInfo');
console.log('Сейчас у бота вебхук:', info.url ? info.url.replace(/(\/\/[^/]+).*/, '$1/…') : '(нет)');
if (info.url && info.url !== target && !force) fail('У бота уже настроен другой вебхук. Если он больше не нужен, запустите с --force. Иначе используйте для чата отдельного бота.');
await tg('setWebhook', { url: target, secret_token: secret, allowed_updates: ['message'] });
const after = await tg('getWebhookInfo');
console.log(after.url === target ? '✔ Готово: Telegram будет присылать ответы менеджеров на ' + target : '✖ Адрес не применился, проверьте настройки.');
if (after.last_error_message) console.log('Последняя ошибка Telegram:', after.last_error_message);
