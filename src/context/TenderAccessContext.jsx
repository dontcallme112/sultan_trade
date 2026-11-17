import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { supabase } from '../api/supabaseClient';
import apiClient from '../api/client';

import { TenderAccessContext, useTenderAccess } from '../hooks/useTenderAccess';
const localDemo = import.meta.env.DEV && import.meta.env.VITE_TENDER_DEMO === 'true';

export function TenderAccessProvider({ children }) {
  const { user, loading } = useAuth();
  const identity = localDemo ? 'local-demo' : user;
  const [access, setAccess] = useState(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!identity) return;
    let current = true;
    let sequence = 0;
    const check = async () => {
      const request = ++sequence;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const { data } = await apiClient.get('/api/tenders/access', {
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        });
        if (current && request === sequence) setAccess({
          identity, allowed: data?.allowed === true,
          reason: data?.allowed === true ? null : data?.allowed === false ? 'denied' : 'unavailable',
        });
      } catch (error) {
        const status = error.response?.status;
        const reason = status === 401 ? 'session' : status === 403 ? 'denied' : 'unavailable';
        if (current && request === sequence) setAccess({ identity, allowed: false, reason });
      }
    };
    check();
    window.addEventListener('focus', check);
    const timer = setInterval(check, 60000);
    return () => { current = false; clearInterval(timer); window.removeEventListener('focus', check); };
  }, [identity, revision]);
  const allowed = Boolean(identity && access?.identity === identity && access.allowed);
  const checking = loading || Boolean(identity && access?.identity !== identity);
  const reason = identity && access?.identity === identity ? access.reason : null;
  const retry = () => { setAccess(null); setRevision(n => n + 1); };
  return <TenderAccessContext.Provider value={{ allowed, checking, reason, retry }}>{children}</TenderAccessContext.Provider>;
}

export function TenderStaffOnly({ children }) {
  const { allowed, checking, reason, retry } = useTenderAccess();
  if (checking) return <p role="status" style={{ padding: '120px 24px' }}>Проверка доступа…</p>;
  if (allowed) return children;
  if (!reason) return <Navigate to="/" replace />;
  const messages = {
    session: 'Сессия недействительна. Выйдите из аккаунта и войдите снова.',
    denied: 'Этому аккаунту не предоставлен доступ сотрудника. Обратитесь к руководителю.',
    unavailable: 'Не удалось проверить доступ. Сервис временно недоступен. Попробуйте ещё раз или обратитесь к руководителю.',
  };
  return <section style={{ padding: '120px 24px', maxWidth: 800, margin: '0 auto' }}>
    <h1>Доступ к разделу</h1>
    <p role="alert">{messages[reason]}</p>
    <button type="button" onClick={retry}>Проверить снова</button>
    <p><Link to="/profile">Профиль / вход</Link> · <Link to="/">На главную</Link></p>
  </section>;
}
