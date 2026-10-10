import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../../api/supabaseClient';
import { BACKEND_URL } from '../../../api/client';
import './ChatWidget.css';

// Онлайн-чат: кнопка в углу сайта, по нажатию открывается окно. Менеджер отвечает в Telegram, ответ появляется здесь.
// Окно опрашивает НАШ сервер: раз в 3 секунды, пока открыто, и раз в 30 секунд, пока закрыто (чтобы показать «новое сообщение»).
// Если чат на сервере не включён (/api/chat/status -> enabled:false), на сайте не показывается ничего.
const STORE_KEY = 'stockera_chat_v1';
const POLL_OPEN_MS = 3000;
const POLL_CLOSED_MS = 30000;
const MAX_LEN = 1000;
const SUGGESTIONS = ['Узнать наличие и цену', 'Условия доставки', 'Оптовые цены и скидки'];

const readStore = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; } };
const writeStore = (patch) => { try { localStorage.setItem(STORE_KEY, JSON.stringify({ ...readStore(), ...patch })); } catch { /* приватный режим */ } };

async function chatFetch(path, { method = 'GET', body, token, auth = false } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers['X-Chat-Token'] = token;
  if (auth) {   // вошедший пользователь: менеджер увидит имя и почту
    try { const { data } = await supabase.auth.getSession(); const t = data?.session?.access_token; if (t) headers.Authorization = `Bearer ${t}`; } catch { /* гость */ }
  }
  const res = await fetch(`${BACKEND_URL}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

const time = (iso) => { try { return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

const ChatIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.6-.8L3 21l1.9-5.1A8.4 8.4 0 0 1 3 11.5 8.5 8.5 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5z" />
  </svg>
);
const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
);
const SendIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4z" /><path d="M22 2 11 13" /></svg>
);

export default function ChatWidget() {
  const [enabled, setEnabled] = useState(null);          // null = ещё не знаем, false = чат выключен
  const [online, setOnline] = useState(true);
  const [hours, setHours] = useState('');
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [name, setName] = useState(() => readStore().name || '');
  const [token, setToken] = useState(() => readStore().token || '');
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const lastId = useRef(0);
  const openRef = useRef(false);
  const logRef = useRef(null);
  const inputRef = useRef(null);
  const sendingRef = useRef(false);

  openRef.current = open;

  // включён ли чат на сервере
  useEffect(() => {
    let cancelled = false;
    chatFetch('/api/chat/status').then(r => {
      if (cancelled) return;
      if (r.ok && r.json.enabled) { setEnabled(true); setOnline(!!r.json.online); setHours(r.json.hours || ''); } else setEnabled(false);
    }).catch(() => { if (!cancelled) setEnabled(false); });
    return () => { cancelled = true; };
  }, []);

  // добавить сообщения с сервера (без повторов); непрочитанные считаем, пока окно закрыто
  const merge = useCallback((incoming) => {
    if (!incoming?.length) return;
    setMessages(prev => {
      const known = new Set(prev.map(m => m.id));
      const fresh = incoming.filter(m => !known.has(m.id));
      if (!fresh.length) return prev;
      if (!openRef.current) {
        const seen = readStore().seen || 0;
        const n = fresh.filter(m => m.sender === 'manager' && m.id > seen).length;
        if (n) setUnread(u => u + n);
      }
      return [...prev, ...fresh];
    });
    lastId.current = Math.max(lastId.current, ...incoming.map(m => m.id));
  }, []);

  // опрос сервера: 3 с при открытом окне, 30 с при закрытом; вкладка в фоне — реже
  useEffect(() => {
    if (!enabled || !token) return undefined;
    let stopped = false, timer;
    const tick = async () => {
      if (stopped) return;
      let delay = openRef.current ? POLL_OPEN_MS : POLL_CLOSED_MS;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') delay = 15000;
      else {
        try {
          const r = await chatFetch(`/api/chat/messages?after=${lastId.current}`, { token });
          if (stopped) return;
          if (r.ok) { merge(r.json.messages); setOnline(!!r.json.online); if (r.json.messages?.length === 100) delay = 200; }
          else if (r.status === 429) delay = 15000;
        } catch { /* сеть моргнула, повторим */ }
      }
      if (!stopped) timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, 100);
    return () => { stopped = true; clearTimeout(timer); };
  }, [enabled, token, merge, open]);

  // открыли окно: сбросили непрочитанное, фокус в поле, Esc закрывает; на телефоне блокируем прокрутку страницы
  useEffect(() => {
    if (!open) return undefined;
    setUnread(0);
    writeStore({ seen: lastId.current });
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    const mobile = typeof window !== 'undefined' && window.innerWidth <= 640;
    const prev = document.body.style.overflow;
    if (mobile) document.body.style.overflow = 'hidden';
    return () => { clearTimeout(t); document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open]);

  // новые сообщения: прокрутка вниз и отметка «прочитано»
  useEffect(() => {
    if (open) { writeStore({ seen: lastId.current }); const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }
  }, [messages, open]);

  const send = useCallback(async (rawText, retryTempId) => {
    const text = rawText.trim();
    if (!text || sendingRef.current) return;
    sendingRef.current = true; setSending(true);
    const tempId = retryTempId || `tmp-${Date.now()}`;
    setError('');
    setMessages(prev => [...prev.filter(m => m.id !== tempId), { id: tempId, sender: 'client', body: text, pending: true, created_at: new Date().toISOString() }]);
    setDraft('');
    try {
      const r = await chatFetch('/api/chat/messages', { method: 'POST', token, auth: true, body: { text, name: token ? undefined : (name.trim() || undefined) } });
      if (r.ok) {
        if (r.json.token) { setToken(r.json.token); writeStore({ token: r.json.token, name: name.trim() }); }
        setMessages(prev => prev.filter(m => m.id !== tempId));
        merge([r.json.message, ...(r.json.extra || [])]);
        writeStore({ seen: lastId.current });   // окно открыто: всё, что пришло, уже прочитано
      } else {
        setMessages(prev => prev.map(m => (m.id === tempId ? { ...m, pending: false, failed: true } : m)));
        setError(r.json?.error || 'Не удалось отправить сообщение');
      }
    } catch {
      setMessages(prev => prev.map(m => (m.id === tempId ? { ...m, pending: false, failed: true } : m)));
      setError('Нет связи с сервером. Проверьте интернет и повторите.');
    } finally { sendingRef.current = false; setSending(false); }
  }, [token, name, merge]);

  if (enabled !== true) return null;

  const empty = messages.length === 0;
  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent?.isComposing) { e.preventDefault(); send(draft); }
  };

  return (
    <div className="chat-root">
      {!open && (
        <button type="button" className="chat-fab" onClick={() => setOpen(true)} aria-label={unread ? `Открыть чат, новых сообщений: ${unread}` : 'Открыть онлайн-чат'}>
          <ChatIcon />
          {unread > 0 && <span className="chat-badge" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
        </button>
      )}

      {open && (
        <section className="chat-panel" role="dialog" aria-label="Онлайн-чат Stockera">
          <header className="chat-header">
            <div className="chat-header-text">
              <strong>Онлайн-чат Stockera</strong>
              <span className="chat-status">
                <i className={`chat-dot${online ? ' on' : ''}`} />
                {online ? 'На связи' : `Ответим в рабочее время${hours ? ` (${hours.replace('-', '–')})` : ''}`}
              </span>
            </div>
            <button type="button" className="chat-close" onClick={() => setOpen(false)} aria-label="Закрыть чат"><CloseIcon /></button>
          </header>

          <div className="chat-log" ref={logRef} role="log" aria-live="polite">
            {empty && (
              <div className="chat-empty">
                <div className="chat-empty-title">{online ? 'Мы на связи' : 'Сейчас нерабочее время'}</div>
                <div className="chat-empty-sub">
                  {online ? 'Задайте вопрос, и менеджер ответит вам прямо здесь.' : `Оставьте сообщение, мы ответим${hours ? ` (мы на связи ${hours.replace('-', '–')})` : ' в рабочее время'}.`}
                </div>
                {!token && (
                  <input className="chat-name" type="text" maxLength={40} placeholder="Ваше имя (необязательно)" value={name}
                    onChange={(e) => setName(e.target.value)} autoComplete="name" aria-label="Ваше имя" />
                )}
                <div className="chat-chips">
                  {SUGGESTIONS.map(s => (
                    <button key={s} type="button" className="chat-chip" onClick={() => { setDraft(s + ': '); inputRef.current?.focus(); }}>{s}</button>
                  ))}
                </div>
              </div>
            )}

            {messages.map(m => (
              <div key={m.id} className={`chat-row ${m.sender === 'bot' ? 'manager' : m.sender}`}>
                {m.sender === 'system'
                  ? <div className="chat-system">{m.body}</div>
                  : (
                    <div className="chat-bubble-wrap">
                      <div className={`chat-bubble${m.failed ? ' failed' : ''}${m.pending ? ' pending' : ''}`}>{m.body}</div>
                      <div className="chat-meta">
                        {m.sender === 'manager' && <span>Менеджер · </span>}
                        {m.sender === 'bot' && <span>Автоответ · </span>}
                        {m.failed
                          ? <button type="button" className="chat-retry" onClick={() => send(m.body, m.id)}>Не отправлено · Повторить</button>
                          : <span>{m.pending ? 'Отправляется…' : time(m.created_at)}</span>}
                      </div>
                    </div>
                  )}
              </div>
            ))}
          </div>

          {error && <div className="chat-error" role="alert">{error}</div>}

          <footer className="chat-footer">
            <textarea ref={inputRef} className="chat-input" rows={2} maxLength={MAX_LEN} value={draft} placeholder="Введите сообщение…"
              onChange={(e) => setDraft(e.target.value)} onKeyDown={onKeyDown} aria-label="Сообщение" />
            <div className="chat-footer-row">
              <span className="chat-count">{draft.length > 800 ? `${draft.length}/${MAX_LEN}` : ''}</span>
              <button type="button" className="chat-send" onClick={() => send(draft)} disabled={!draft.trim() || sending} aria-label="Отправить"><SendIcon /></button>
            </div>
          </footer>
        </section>
      )}
    </div>
  );
}