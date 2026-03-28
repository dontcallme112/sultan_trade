// src/components/features/AuthModal/AuthModal.jsx
import { useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import './AuthModal.css';

export default function AuthModal({ onClose }) {
  const [tab, setTab]           = useState('login');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

  const { signIn, signUp, signInWithGoogle } = useAuth();

  const clearMessages = () => { setError(''); setSuccess(''); };

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) { setError(error.message); return; }
    onClose();
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    clearMessages();
    if (password.length < 6) { setError('Пароль минимум 6 символов'); return; }
    setLoading(true);
    const { error } = await signUp(email, password, fullName);
    setLoading(false);
    if (error) { setError(error.message); return; }
    setSuccess('Аккаунт создан! Можете войти.');
  };

  const handleGoogle = async () => {
    clearMessages();
    setLoading(true);
    const { error } = await signInWithGoogle();
    setLoading(false);
    if (error) setError(error.message);
  };

  return (
    <div className="auth-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="auth-modal">
        <button className="auth-close" onClick={onClose}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        {/* Логотип Stockera */}
        <div className="auth-logo">
          <img src="/logo.png" alt="Stockera" width="48" height="48" style={{ objectFit: 'contain' }} />
          <span className="auth-logo-text">Stockera</span>
        </div>

        <div className="auth-tabs">
          <button className={`auth-tab ${tab === 'login' ? 'active' : ''}`}
            onClick={() => { setTab('login'); clearMessages(); }}>
            Вход
          </button>
          <button className={`auth-tab ${tab === 'register' ? 'active' : ''}`}
            onClick={() => { setTab('register'); clearMessages(); }}>
            Регистрация
          </button>
        </div>

        {error   && <div className="auth-error">{error}</div>}
        {success && <div className="auth-success">{success}</div>}

        {tab === 'login' && (
          <form className="auth-form" onSubmit={handleEmailLogin}>
            <div className="auth-field">
              <label>Email</label>
              <input type="email" value={email} required autoFocus
                onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div className="auth-field">
              <label>Пароль</label>
              <input type="password" value={password} required
                onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
            <button type="submit" className="auth-btn-primary" disabled={loading}>
              {loading ? <span className="auth-spinner"/> : 'Войти'}
            </button>
          </form>
        )}

        {tab === 'register' && (
          <form className="auth-form" onSubmit={handleRegister}>
            <div className="auth-field">
              <label>Имя</label>
              <input type="text" value={fullName} required autoFocus
                onChange={e => setFullName(e.target.value)} placeholder="Иван Иванов" />
            </div>
            <div className="auth-field">
              <label>Email</label>
              <input type="email" value={email} required
                onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div className="auth-field">
              <label>Пароль</label>
              <input type="password" value={password} required minLength={6}
                onChange={e => setPassword(e.target.value)} placeholder="Минимум 6 символов" />
            </div>
            <button type="submit" className="auth-btn-primary" disabled={loading}>
              {loading ? <span className="auth-spinner"/> : 'Создать аккаунт'}
            </button>
          </form>
        )}

        <div className="auth-divider"><span>или</span></div>

        <button className="auth-btn-google" onClick={handleGoogle} disabled={loading}>
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Войти через Google
        </button>
      </div>
    </div>
  );
}