import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { supabase } from '../api/supabaseClient';
import apiClient from '../api/client';

import { TenderAccessContext, useTenderAccess } from '../hooks/useTenderAccess';
const localDemo = import.meta.env.DEV && import.meta.env.VITE_TENDER_DEMO === 'true';

export function TenderAccessProvider({ children }) {
  const { user, loading } = useAuth();
  const identity = localDemo ? 'local-demo' : user;
  const [access, setAccess] = useState(null);
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
        if (current && request === sequence) setAccess({ identity, allowed: data.allowed === true });
      } catch {
        if (current && request === sequence) setAccess({ identity, allowed: false });
      }
    };
    check();
    window.addEventListener('focus', check);
    const timer = setInterval(check, 60000);
    return () => { current = false; clearInterval(timer); window.removeEventListener('focus', check); };
  }, [identity]);
  const allowed = Boolean(identity && access?.identity === identity && access.allowed);
  const checking = loading || Boolean(identity && access?.identity !== identity);
  return <TenderAccessContext.Provider value={{ allowed, checking }}>{children}</TenderAccessContext.Provider>;
}

export function TenderStaffOnly({ children }) {
  const { allowed, checking } = useTenderAccess();
  if (checking) return <p role="status" style={{ padding: '120px 24px' }}>Проверка доступа…</p>;
  return allowed ? children : <Navigate to="/" replace />;
}
