import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../../api/supabaseClient';
import { BACKEND_URL } from '../../api/client';
import { formatNumber } from '../../utils/priceUtils.js';
import { formatPhone } from '../../utils/customerValidation';
import './PaymentStep.css';

// Экран оплаты после оформления заказа: счёт приходит клиенту в приложение Kaspi.
// Страница спрашивает ТОЛЬКО наш сервер (ключ ApiPay в браузер не попадает):
//   POST /api/orders/:id/pay      выставить счёт
//   GET  /api/orders/:id/payment  узнать состояние (пока ждём: раз в 4 с, после 3 минут: раз в 20 с, до 15 минут)
const POLL_FAST_MS = 4000;
const POLL_SLOW_MS = 20000;
const FAST_WINDOW_MS = 3 * 60 * 1000;
const STOP_AFTER_MS = 15 * 60 * 1000;

async function callApi(path, options = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

export default function PaymentStep({ orderId, total, phone, onPaid, onLater }) {
  const [phase, setPhase] = useState('creating');     // creating | pending | link | requisites | claimed | paid | failed | unavailable
  const [message, setMessage] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [isSandbox, setIsSandbox] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);         // перестали спрашивать (15 минут), сервер сверяет сам
  const [altPhone, setAltPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [linkInfo, setLinkInfo] = useState(null);     // оплата по ссылке Kaspi Pay: { link, amount, orderRef }
  const [copied, setCopied] = useState(false);
  const [reqInfo, setReqInfo] = useState(null);       // оплата по реквизитам: { amount, purpose, orderRef, requisites }
  const [copiedKey, setCopiedKey] = useState('');
  const startedAt = useRef(0);
  const started = useRef(false);

  const applyState = useCallback((s) => {
    if (s.payment_status === 'paid') setPhase('paid');
    else if (s.payment_status === 'failed') { setPhase('failed'); setErrorCode(s.error_code || ''); }
    else setPhase('pending');
  }, []);

  const startPayment = useCallback(async (kaspiPhone) => {
    setBusy(true); setMessage(''); setGaveUp(false);
    try {
      const { ok, status, body } = await callApi(`/api/orders/${orderId}/pay`, {
        method: 'POST', body: JSON.stringify(kaspiPhone ? { kaspi_phone: kaspiPhone } : {}),
      });
      if (!ok) {
        setMessage(body.error || 'Не удалось выставить счёт');
        setPhase(status === 503 ? 'unavailable' : 'failed');
        setErrorCode(status === 422 ? 'bad_phone' : '');
        return;
      }
      if (body.mode === 'requisites' && body.requisites) {   // оплата по реквизитам: показываем счёт компании, сумму и назначение платежа
        setReqInfo({ amount: body.amount, purpose: body.purpose, orderRef: body.order_ref, requisites: body.requisites });
        setPhase('requisites');
        return;
      }
      if (body.mode === 'link' && body.link) {          // оплата по ссылке Kaspi Pay: показываем сумму и шаги
        setLinkInfo({ link: body.link, amount: body.amount, orderRef: body.order_ref });
        setPhase('link');
        return;
      }
      setIsSandbox(body.is_sandbox === true);
      startedAt.current = Date.now();
      applyState(body);
    } catch {
      setMessage('Нет связи с сервером. Заказ сохранён, менеджер свяжется с вами.');
      setPhase('unavailable');
    } finally { setBusy(false); }
  }, [orderId, applyState]);

  // выставляем счёт один раз при открытии экрана
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    startPayment();
  }, [startPayment]);

  // опрос нашего сервера, пока счёт ждёт оплаты
  useEffect(() => {
    if (phase !== 'pending') return undefined;
    let cancelled = false, timer;
    const tick = async () => {
      if (cancelled) return;
      const elapsed = Date.now() - (startedAt.current || Date.now());
      if (elapsed > STOP_AFTER_MS) { setGaveUp(true); return; }
      try {
        const { ok, body } = await callApi(`/api/orders/${orderId}/payment`);
        if (!cancelled && ok) { applyState(body); if (body.payment_status !== 'pending') return; }
      } catch { /* сеть моргнула: попробуем в следующий раз */ }
      if (!cancelled) timer = setTimeout(tick, elapsed < FAST_WINDOW_MS ? POLL_FAST_MS : POLL_SLOW_MS);
    };
    timer = setTimeout(tick, POLL_FAST_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [phase, orderId, applyState]);

  // после оплаты показываем подтверждение секунду-две и переходим дальше
  useEffect(() => {
    if (phase !== 'paid') return undefined;
    const t = setTimeout(() => onPaid?.(), 1800);
    return () => clearTimeout(t);
  }, [phase, onPaid]);

  // сумму копируем без пробелов: её можно сразу вставить в поле суммы в Kaspi
  const copyAmount = useCallback(async () => {
    if (!linkInfo) return;
    const text = String(Math.round(linkInfo.amount));
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else { const el = document.createElement('textarea'); el.value = text; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el); }
      setCopied(true);
    } catch { /* копирование не сработало: сумма и так видна на экране */ }
  }, [linkInfo]);

  const copyText = useCallback(async (value, key) => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
      else { const el = document.createElement('textarea'); el.value = value; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el); }
      setCopiedKey(key); setTimeout(() => setCopiedKey(k => (k === key ? '' : k)), 2000);
    } catch { /* копирование не сработало: значение видно на экране */ }
  }, []);

  const claimPaid = useCallback(async () => {
    setBusy(true); setMessage('');
    try {
      const { ok, body } = await callApi(`/api/orders/${orderId}/paid-claim`, { method: 'POST', body: '{}' });
      if (ok) setPhase('claimed');
      else setMessage(body.error || 'Не удалось отправить сообщение менеджеру. Попробуйте ещё раз.');
    } catch { setMessage('Нет связи с сервером. Попробуйте ещё раз.'); }
    finally { setBusy(false); }
  }, [orderId]);

  const notKaspi = errorCode === 'client_not_found' || errorCode === 'bad_phone';

  return (
    <div className="checkout-page"><div className="container">
      <div className="pay-step" aria-live="polite">
        {isSandbox && phase !== 'paid' && (
          <div className="pay-sandbox">Тестовый режим: счёт в Kaspi не уходит, оплата имитируется.</div>
        )}

        {phase === 'creating' && (<>
          <div className="pay-icon"><span className="pay-spinner" /></div>
          <h2>Выставляем счёт в Kaspi…</h2>
          <p>Это займёт несколько секунд.</p>
        </>)}

        {phase === 'pending' && (<>
          <div className="pay-icon"><span className="pay-spinner" /></div>
          <h2>Откройте приложение Kaspi</h2>
          <p>Мы отправили счёт на <b>{formatPhone(phone) || 'ваш номер'}</b>. Подтвердите оплату в приложении.</p>
          <p className="pay-amount">{formatNumber(total)} ₸</p>
          <p className="pay-hint">
            {gaveUp
              ? 'Мы продолжим проверять оплату сами. Эту страницу можно закрыть, а заказ вы найдёте в профиле.'
              : 'Страница обновится сама, как только оплата пройдёт.'}
          </p>
          <button type="button" className="btn btn-secondary" onClick={onLater}>Оплачу позже, пусть свяжется менеджер</button>
        </>)}

        {phase === 'link' && linkInfo && (<>
          <div className="pay-icon pay-icon-kaspi">₸</div>
          <h2>Оплатите заказ в Kaspi</h2>
          <p className="pay-amount">{formatNumber(linkInfo.amount)} ₸</p>
          <button type="button" className="pay-copy" onClick={copyAmount}>{copied ? 'Сумма скопирована' : 'Скопировать сумму'}</button>
          <ol className="pay-steps">
            <li>Нажмите «Оплатить в Kaspi»: откроется приложение Kaspi.kz.</li>
            <li>Введите сумму <b>{formatNumber(linkInfo.amount)} ₸</b> (мы её скопируем).</li>
            <li>В сообщении напишите: <b>Заказ {linkInfo.orderRef}</b>.</li>
            <li>Вернитесь сюда и нажмите «Я оплатил(а)».</li>
          </ol>
          {message && <p className="pay-error" role="alert">{message}</p>}
          <div className="pay-actions">
            <a className="btn btn-primary" href={linkInfo.link} target="_blank" rel="noopener noreferrer" onClick={copyAmount}>Оплатить в Kaspi</a>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={claimPaid}>{busy ? 'Отправляем…' : 'Я оплатил(а)'}</button>
          </div>
          <button type="button" className="pay-later" onClick={onLater}>Оплачу позже, пусть свяжется менеджер</button>
        </>)}

        {phase === 'requisites' && reqInfo && (<>
          <div className="pay-icon pay-icon-kaspi">₸</div>
          <h2>Оплата по реквизитам</h2>
          <p className="pay-amount">{formatNumber(reqInfo.amount)} ₸</p>
          <p className="pay-hint">Переведите сумму на счёт компании из любого банка (в Kaspi: Переводы → на счёт в банке по IBAN). В назначении платежа укажите: <b>{reqInfo.purpose}</b></p>
          <dl className="pay-req">
            {[['Получатель', reqInfo.requisites.name], ['БИН / ИИН', reqInfo.requisites.bin], ['IBAN (ИИК)', reqInfo.requisites.iban], ['Банк', reqInfo.requisites.bank], ['БИК', reqInfo.requisites.bic],
              ...(reqInfo.requisites.kbe ? [['КБе', reqInfo.requisites.kbe]] : []), ['Сумма', String(Math.round(reqInfo.amount))], ['Назначение платежа', reqInfo.purpose]].map(([label, value]) => (
              <div className="pay-req-row" key={label}>
                <dt>{label}</dt><dd>{label === 'Сумма' ? `${formatNumber(value)} ₸` : value}</dd>
                <button type="button" className="pay-req-copy" onClick={() => copyText(label === 'IBAN (ИИК)' ? String(value).replace(/\s/g, '') : value, label)} aria-label={`Скопировать: ${label}`}>{copiedKey === label ? '✓' : 'Копировать'}</button>
              </div>
            ))}
          </dl>
          {message && <p className="pay-error" role="alert">{message}</p>}
          <div className="pay-actions">
            <a className="btn btn-primary" href={`/invoice/${orderId}`} target="_blank" rel="noopener noreferrer">Открыть счёт на оплату</a>
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={claimPaid}>{busy ? 'Отправляем…' : 'Я оплатил(а)'}</button>
          </div>
          <button type="button" className="pay-later" onClick={onLater}>Оплачу позже, пусть свяжется менеджер</button>
        </>)}

        {phase === 'claimed' && (<>
          <div className="pay-icon pay-icon-ok">✓</div>
          <h2>Спасибо! Проверяем оплату</h2>
          <p>Менеджер сверит поступление в Kaspi и подтвердит заказ по телефону <b>{formatPhone(phone) || 'который вы указали'}</b>.</p>
          <p className="pay-amount">{formatNumber(linkInfo?.amount ?? reqInfo?.amount ?? total)} ₸</p>
          <button type="button" className="btn btn-primary" onClick={onPaid}>Готово</button>
        </>)}

        {phase === 'paid' && (<>
          <div className="pay-icon pay-icon-ok">✓</div>
          <h2>Оплата получена</h2>
          <p>Спасибо! Заказ оплачен на сумму <b>{formatNumber(total)} ₸</b>. Менеджер свяжется с вами для доставки.</p>
        </>)}

        {(phase === 'failed' || phase === 'unavailable') && (<>
          <div className="pay-icon pay-icon-warn">!</div>
          <h2>{phase === 'unavailable' ? 'Онлайн-оплата недоступна' : 'Счёт не оплачен'}</h2>
          <p>
            {message || (notKaspi
              ? 'Этот номер не найден в Kaspi. Укажите номер, на который зарегистрирован Kaspi.'
              : 'Счёт истёк или был отменён. Можно выставить новый.')}
          </p>
          <p className="pay-hint">Заказ сохранён: менеджер свяжется с вами по указанному телефону.</p>

          {phase === 'failed' && (<>
            {notKaspi && (
              <input className="pay-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+7 (7XX) XXX-XX-XX"
                value={altPhone} onChange={(e) => setAltPhone(formatPhone(e.target.value))} aria-label="Номер Kaspi" />
            )}
            <button type="button" className="btn btn-primary" disabled={busy || (notKaspi && altPhone.replace(/\D/g, '').length !== 11)}
              onClick={() => { setPhase('creating'); startPayment(notKaspi ? altPhone : undefined); }}>
              {busy ? 'Выставляем…' : 'Выставить счёт заново'}
            </button>
          </>)}
          <button type="button" className="btn btn-secondary" onClick={onLater}>Продолжить без оплаты</button>
        </>)}
      </div>
    </div></div>
  );
}
