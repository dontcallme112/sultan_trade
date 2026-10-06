// chat.js — онлайн-чат на сайте. Клиент пишет в окне на сайте, менеджер отвечает в Telegram (Reply на сообщение клиента).
//
//   сайт  →  POST /api/chat/messages  →  база + сообщение менеджеру в Telegram
//   менеджер отвечает Reply в Telegram  →  webhook /api/chat/telegram  →  база  →  окно чата на сайте (опрос раз в несколько секунд)
//
// Безопасность: личность посетителя = случайный токен (в базе только его sha256); чужие переписки прочитать нельзя;
// у чата свой ограничитель запросов; текст экранируется перед отправкой в Telegram; токен бота никогда не попадает в ошибки и логи.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export class ChatError extends Error {
  constructor(status, message) { super(message); this.name = 'ChatError'; this.status = status; }
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const sha256 = (s) => createHash('sha256').update(String(s)).digest('hex');
const shortId = (id) => String(id).replace(/-/g, '').slice(0, 6).toUpperCase();

export const MAX_TEXT = 1000;          // символов в сообщении клиента
export const MAX_MANAGER_TEXT = 2000;
export const MAX_ATTEMPTS = 5;         // попыток переслать менеджеру

// Очистка текста: без управляющих символов, не больше двух пустых строк подряд
export function cleanText(raw, max) {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
}

// «09:00-19:00» (по времени Алматы) -> онлайн ли сейчас
export function isOnline(hours, nowMs = Date.now()) {
  const m = String(hours || '').match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
  if (!m) return true;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Almaty', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(nowMs));
  const cur = Number(parts.find(p => p.type === 'hour').value) % 24 * 60 + Number(parts.find(p => p.type === 'minute').value);
  const from = Number(m[1]) * 60 + Number(m[2]), to = Number(m[3]) * 60 + Number(m[4]);
  return from <= to ? cur >= from && cur < to : cur >= from || cur < to;
}

// Простой скользящий ограничитель в памяти (отдельный от общего rateLimit сервера, чтобы опрос чата не съедал чужие лимиты)
export function createLimiter(now = () => Date.now()) {
  const hits = new Map();
  return function allow(key, windowMs, max) {
    const t = now(), arr = (hits.get(key) || []).filter(x => x > t - windowMs);
    if (arr.length >= max) { hits.set(key, arr); return false; }
    arr.push(t); hits.set(key, arr);
    if (hits.size > 20000) for (const k of [...hits.keys()].slice(0, 5000)) hits.delete(k);
    return true;
  };
}

/**
 * deps:
 *  store     — база (см. createSupabaseChatStore)
 *  telegram  — { send(chatId, html) -> message_id } (бросает ошибку без секретов)
 *  chatId    — чат менеджеров в Telegram (id группы или личный)
 *  hours     — «09:00-19:00»
 *  webhookSecret — секрет вебхука Telegram
 */
export function createChatService({ store, telegram, chatId, hours = '09:00-19:00', webhookSecret = '', autoReply, offlineReply, log = console, now = () => Date.now() }) {
  const allow = createLimiter(now);
  const configured = Boolean(telegram && chatId && store && webhookSecret);   // без секрета вебхука ответы менеджера не дойдут, поэтому чат не показываем
  const hintAt = new Map();   // когда последний раз подсказывали менеджеру про Reply

  const online = () => isOnline(hours, now());
  const reply = {
    on: autoReply || 'Спасибо за сообщение! Менеджер ответит в ближайшее время.',
    off: offlineReply || `Сейчас нерабочее время (мы на связи ${hours.replace('-', '–')}). Мы получили ваше сообщение и ответим, как только будем на месте.`,
  };

  const publicMsg = (m) => ({ id: m.id, sender: m.sender, body: m.body, created_at: m.created_at });

  async function forward(conv, msg, first) {
    const label = conv.display_name ? esc(conv.display_name) : 'Гость';
    const head = `💬 <b>Чат #${shortId(conv.id)}</b> · ${label}`;
    const tail = first ? '\n\n<i>Ответьте на это сообщение (Reply), и клиент увидит ответ на сайте.</i>' : '';
    const sent = await telegram.send(chatId, `${head}\n${esc(msg.body)}${tail}`);
    await store.updateMessage(msg.id, { tg_chat_id: Number(chatId), tg_message_id: Number(sent), tg_attempts: (msg.tg_attempts || 0) + 1 });
  }

  // Принять сообщение клиента. Возвращает { token (только для нового диалога), message, extra: [служебные сообщения] }
  async function postMessage({ token, text, name, user, ip }) {
    if (!configured) throw new ChatError(503, 'Чат временно недоступен. Позвоните нам или оформите заказ, мы свяжемся с вами.');
    const body = cleanText(text, MAX_TEXT);
    if (!body) throw new ChatError(400, 'Введите сообщение');
    const ipKey = `ip:${ip || 'unknown'}`;
    if (!allow(`${ipKey}:min`, 60_000, 8) || !allow(`${ipKey}:hour`, 3_600_000, 60)) throw new ChatError(429, 'Слишком много сообщений. Подождите минуту и повторите.');

    let conv = token ? await store.findConversationByTokenHash(sha256(token)) : null;
    let newToken = null, first = false;
    if (!conv) {
      if (!allow(`${ipKey}:new`, 3_600_000, 5)) throw new ChatError(429, 'Слишком много обращений с вашего адреса. Попробуйте позже.');
      newToken = randomBytes(24).toString('base64url');
      const label = user
        ? [cleanText(user.name || '', 60), user.email ? `(${cleanText(user.email, 80)})` : ''].filter(Boolean).join(' ')
        : cleanText(name || '', 40);
      conv = await store.createConversation({ token_hash: sha256(newToken), user_id: user?.id || null, display_name: label || null });
      first = true;
    } else if (!allow(`conv:${conv.id}:day`, 86_400_000, 200)) {
      throw new ChatError(429, 'Дневной лимит сообщений исчерпан. Напишите нам завтра или оформите заказ.');
    }

    const msg = await store.addMessage({ conversation_id: conv.id, sender: 'client', body });
    await store.touchConversation(conv.id, { last_message_at: new Date(now()).toISOString() });
    let delivered = true;
    try { await forward(conv, msg, first); }
    catch (e) {
      delivered = false;
      log.warn(`⚠️ Чат: не удалось переслать сообщение менеджеру (${e.status || e.code || 'ошибка'}), повторим автоматически`);
      await store.updateMessage(msg.id, { tg_attempts: 1 }).catch(() => {});
    }

    // автоответ: в начале диалога и если с последнего служебного ответа прошло больше 12 часов
    const extra = [];
    const lastSys = conv.last_auto_at ? Date.parse(conv.last_auto_at) : 0;
    if (first || now() - lastSys > 12 * 3600 * 1000) {
      const sys = await store.addMessage({ conversation_id: conv.id, sender: 'system', body: online() ? reply.on : reply.off });
      await store.touchConversation(conv.id, { last_auto_at: new Date(now()).toISOString() });
      extra.push(publicMsg(sys));
    }
    return { token: newToken, message: publicMsg(msg), extra, delivered };
  }

  // Сообщения диалога после id (опрос окна чата)
  async function poll({ token, afterId, ip }) {
    if (!configured) return { messages: [], online: false, enabled: false };
    if (!token) return { messages: [], online: online(), enabled: true };
    if (!allow(`ip:${ip || 'unknown'}:poll`, 60_000, 120)) throw new ChatError(429, 'Слишком частые запросы');
    const conv = await store.findConversationByTokenHash(sha256(token));
    if (!conv) return { messages: [], online: online(), enabled: true, unknown_token: true };
    if (!allow(`conv:${conv.id}:poll`, 60_000, 40)) throw new ChatError(429, 'Слишком частые запросы');
    const after = Number.isFinite(Number(afterId)) && Number(afterId) > 0 ? Math.floor(Number(afterId)) : 0;
    const rows = await store.listMessages(conv.id, after, 100);
    return { messages: rows.map(publicMsg), online: online(), enabled: true };
  }

  const status = () => ({ enabled: configured, online: configured && online(), hours });

  // Проверка секрета вебхука Telegram (постоянное по времени сравнение)
  function checkWebhookSecret(header) {
    if (!webhookSecret || typeof header !== 'string') return false;
    const a = Buffer.from(header), b = Buffer.from(webhookSecret);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  async function hint(text) {
    const t = now();
    if (t - (hintAt.get('h') || 0) < 10 * 60 * 1000) return;
    hintAt.set('h', t);
    await telegram.send(chatId, text).catch(() => {});
  }

  // Ответ менеджера из Telegram. Возвращает { ok, reason }
  async function handleTelegramUpdate(update) {
    const m = update?.message;
    if (!configured || !m || String(m.chat?.id) !== String(chatId)) return { ok: false, reason: 'ignored' };   // правки и чужие чаты игнорируем
    if (m.from?.is_bot) return { ok: false, reason: 'bot' };
    const text = cleanText(m.text || m.caption || '', MAX_MANAGER_TEXT);
    const replyTo = m.reply_to_message?.message_id;

    if (!replyTo) {
      if (text && !text.startsWith('/')) await hint('ℹ️ Чтобы ответить клиенту, нажмите «Ответить» (Reply) на его сообщение из чата. Обычные сообщения клиенту не отправляются.');
      return { ok: false, reason: 'not_a_reply' };
    }
    const target = await store.findMessageByTelegram(Number(chatId), Number(replyTo));
    if (!target) { await hint('ℹ️ Не нашёл, к какому клиенту относится это сообщение. Нажмите «Ответить» на сообщение клиента из чата (с пометкой «💬 Чат #…»).'); return { ok: false, reason: 'unknown_target' }; }
    if (!text) { await hint('ℹ️ В чат на сайте пока уходит только текст (без фото и файлов).'); return { ok: false, reason: 'no_text' }; }

    const saved = await store.addMessage({ conversation_id: target.conversation_id, sender: 'manager', body: text, tg_chat_id: Number(chatId), tg_message_id: Number(m.message_id) });
    await store.touchConversation(target.conversation_id, { last_message_at: new Date(now()).toISOString() });
    return { ok: true, id: saved.id };
  }

  // Повторная пересылка сообщений, которые не дошли до Telegram (вызывать раз в минуту)
  let flushing = false;
  async function flushPending() {
    if (!configured || flushing) return { skipped: true };
    flushing = true;
    try {
      const since = new Date(now() - 6 * 3600 * 1000).toISOString();
      const rows = await store.listPendingForward(since, MAX_ATTEMPTS, 20);
      let sent = 0;
      for (const msg of rows) {
        try { const conv = await store.getConversation(msg.conversation_id); if (conv) { await forward(conv, msg, false); sent++; } }
        catch (e) { await store.updateMessage(msg.id, { tg_attempts: (msg.tg_attempts || 0) + 1 }).catch(() => {}); log.warn(`⚠️ Чат: повтор пересылки не удался (${e.status || e.code || 'ошибка'})`); }
      }
      return { sent, tried: rows.length };
    } finally { flushing = false; }
  }

  return { configured, status, postMessage, poll, handleTelegramUpdate, checkWebhookSecret, flushPending };
}

// ── Telegram: отправка без утечки токена (ошибки axios содержат адрес с токеном, поэтому наружу отдаём только код) ──
export function createTelegramSender({ token, http, base = 'https://api.telegram.org' }) {
  return {
    async send(chatId, html) {
      if (!token) throw Object.assign(new Error('no token'), { code: 'no_token' });
      let res;
      try {
        res = await http.post(`${base}/bot${token}/sendMessage`, { chat_id: chatId, text: html, parse_mode: 'HTML', disable_web_page_preview: true }, { timeout: 10000, validateStatus: () => true });
      } catch (e) { throw Object.assign(new Error('telegram недоступен'), { code: e?.code || 'network' }); }
      if (res.status !== 200 || !res.data?.ok) throw Object.assign(new Error(`telegram HTTP ${res.status}`), { status: res.status, code: res.data?.error_code || null });
      return res.data.result.message_id;
    },
  };
}

// ── Хранилище в Supabase (service role; в браузер таблицы не открыты) ──
export function createSupabaseChatStore(sb) {
  const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  return {
    async findConversationByTokenHash(h) { return must(await sb.from('chat_conversations').select('*').eq('token_hash', h).maybeSingle()); },
    async getConversation(id) { return must(await sb.from('chat_conversations').select('*').eq('id', id).maybeSingle()); },
    async createConversation(row) { return must(await sb.from('chat_conversations').insert(row).select().single()); },
    async touchConversation(id, patch) { must(await sb.from('chat_conversations').update(patch).eq('id', id)); },
    async addMessage(row) { return must(await sb.from('chat_messages').insert(row).select().single()); },
    async updateMessage(id, patch) { must(await sb.from('chat_messages').update(patch).eq('id', id)); },
    async listMessages(conversationId, afterId, limit) {
      return must(await sb.from('chat_messages').select('id,sender,body,created_at').eq('conversation_id', conversationId).gt('id', afterId).order('id', { ascending: true }).limit(limit)) || [];
    },
    async findMessageByTelegram(chatId, messageId) {
      return must(await sb.from('chat_messages').select('id,conversation_id,sender').eq('tg_chat_id', chatId).eq('tg_message_id', messageId).maybeSingle());
    },
    async listPendingForward(sinceIso, maxAttempts, limit) {
      return must(await sb.from('chat_messages').select('*').eq('sender', 'client').is('tg_message_id', null).lt('tg_attempts', maxAttempts).gt('created_at', sinceIso).order('id', { ascending: true }).limit(limit)) || [];
    },
  };
}
