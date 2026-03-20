// src/pages/AuthCallback/AuthCallback.jsx
import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../api/supabaseClient';

export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handleCallback = async () => {
      // Telegram callback — параметры приходят в URL
      const params = new URLSearchParams(location.search);
      const isTelegram = params.get('id') && params.get('hash');

      if (isTelegram) {
        // Telegram данные
        const telegramData = {
          id:         params.get('id'),
          first_name: params.get('first_name'),
          last_name:  params.get('last_name'),
          username:   params.get('username'),
          photo_url:  params.get('photo_url'),
          hash:       params.get('hash'),
        };

        // Создаём пользователя через email на основе Telegram ID
        // (используем Telegram ID как уникальный идентификатор)
        const fakeEmail = `telegram_${telegramData.id}@sultantrade.app`;
        const fakePassword = `tg_${telegramData.id}_${telegramData.hash?.slice(0, 8)}`;

        // Пробуем войти
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: fakeEmail,
          password: fakePassword,
        });

        // Если не получилось — регистрируемся
        if (signInError) {
          const { error: signUpError } = await supabase.auth.signUp({
            email: fakeEmail,
            password: fakePassword,
            options: {
              data: {
                full_name: `${telegramData.first_name || ''} ${telegramData.last_name || ''}`.trim(),
                avatar_url: telegramData.photo_url || '',
                telegram_id: telegramData.id,
                telegram_username: telegramData.username,
              }
            }
          });

          if (signUpError) {
            console.error('Telegram auth error:', signUpError);
            navigate('/');
            return;
          }
        }

        navigate('/profile');
        return;
      }

      // Обычный OAuth callback (Google)
      await supabase.auth.getSession();
      navigate('/profile');
    };

    handleCallback();
  }, []);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: '#080808', flexDirection: 'column', gap: '1rem'
    }}>
      <div style={{ width: 40, height: 40, border: '3px solid #B8860B', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}/>
      <p style={{ color: '#555', fontFamily: 'sans-serif' }}>Авторизация...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}