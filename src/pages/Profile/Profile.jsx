// src/pages/Profile/Profile.jsx
import { useState, useEffect } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../api/supabaseClient';
import './Profile.css';

const TABS = [
  { id: 'orders',    label: 'Заказы',    icon: '📦' },
  { id: 'favorites', label: 'Избранное', icon: '❤️' },
  { id: 'addresses', label: 'Адреса',    icon: '📍' },
  { id: 'settings',  label: 'Данные',    icon: '👤' },
];

const STATUS_LABELS = {
  pending:   { label: 'Ожидает',    color: '#F59E0B' },
  confirmed: { label: 'Подтверждён', color: '#3B82F6' },
  shipping:  { label: 'Доставляется', color: '#8B5CF6' },
  delivered: { label: 'Доставлен',  color: '#10B981' },
  cancelled: { label: 'Отменён',    color: '#EF4444' },
};

export default function Profile() {
  const { user, profile, loading, isAuthenticated, updateProfile, signOut } = useAuth();
  const [tab, setTab]           = useState('orders');
  const [orders, setOrders]     = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [addresses, setAddresses] = useState([]);
  const [saving, setSaving]     = useState(false);
  const [saveMsg, setSaveMsg]   = useState('');

  // Настройки формы
  const [fullName, setFullName] = useState('');
  const [phone, setPhone]       = useState('');

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setPhone(profile.phone || '');
    }
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    if (tab === 'orders')    fetchOrders();
    if (tab === 'favorites') fetchFavorites();
    if (tab === 'addresses') fetchAddresses();
  }, [tab, user]);

  const fetchOrders = async () => {
    const { data } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });
    setOrders(data || []);
  };

  const fetchFavorites = async () => {
    const { data } = await supabase
      .from('favorites')
      .select('*')
      .order('created_at', { ascending: false });
    setFavorites(data || []);
  };

  const fetchAddresses = async () => {
    const { data } = await supabase
      .from('addresses')
      .select('*')
      .order('is_default', { ascending: false });
    setAddresses(data || []);
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await updateProfile({ full_name: fullName, phone });
    setSaving(false);
    setSaveMsg(error ? '❌ Ошибка сохранения' : '✅ Сохранено!');
    setTimeout(() => setSaveMsg(''), 3000);
  };

  const handleRemoveFavorite = async (article) => {
    await supabase.from('favorites').delete().eq('article', article).eq('user_id', user.id);
    setFavorites(prev => prev.filter(f => f.article !== article));
  };

  const handleSetDefaultAddress = async (id) => {
    await supabase.from('addresses').update({ is_default: false }).eq('user_id', user.id);
    await supabase.from('addresses').update({ is_default: true }).eq('id', id);
    fetchAddresses();
  };

  const handleDeleteAddress = async (id) => {
    await supabase.from('addresses').delete().eq('id', id);
    setAddresses(prev => prev.filter(a => a.id !== id));
  };

  if (loading) return (
    <div className="profile-page"><div className="container">
      <div className="profile-loading"><div className="loader"/><p>Загрузка...</p></div>
    </div></div>
  );

  if (!isAuthenticated) return <Navigate to="/" replace />;

  const avatar = profile?.avatar_url || user?.user_metadata?.avatar_url;
  const displayName = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0];

  return (
    <div className="profile-page">
      <div className="container">

        {/* Header */}
        <div className="profile-header">
          <div className="profile-avatar">
            {avatar
              ? <img src={avatar} alt={displayName} />
              : <span>{(displayName?.[0] || 'U').toUpperCase()}</span>
            }
          </div>
          <div className="profile-info">
            <h1 className="profile-name">{displayName}</h1>
            <p className="profile-email">{user?.email || user?.phone}</p>
          </div>
          <button className="profile-signout" onClick={signOut}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Выйти
          </button>
        </div>

        {/* Tabs */}
        <div className="profile-tabs">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`profile-tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <span className="tab-icon">{t.icon}</span>
              <span className="tab-label">{t.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="profile-content">

          {/* ── ORDERS ── */}
          {tab === 'orders' && (
            <div className="orders-list">
              {orders.length === 0 ? (
                <div className="profile-empty">
                  <span>📦</span>
                  <p>У вас пока нет заказов</p>
                  <Link to="/catalog" className="profile-empty-btn">Перейти в каталог</Link>
                </div>
              ) : orders.map(order => {
                const st = STATUS_LABELS[order.status] || STATUS_LABELS.pending;
                return (
                  <div key={order.id} className="order-card">
                    <div className="order-card-header">
                      <div>
                        <span className="order-id">#{order.id.slice(0, 8).toUpperCase()}</span>
                        <span className="order-date">
                          {new Date(order.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </span>
                      </div>
                      <span className="order-status" style={{ color: st.color, borderColor: st.color + '44', background: st.color + '11' }}>
                        {st.label}
                      </span>
                    </div>
                    <div className="order-items-preview">
                      {(order.items || []).slice(0, 3).map((item, i) => (
                        <div key={i} className="order-item-row">
                          {item.image_url && <img src={item.image_url} alt={item.name} />}
                          <div>
                            <p className="order-item-name">{item.name}</p>
                            <p className="order-item-qty">× {item.quantity}</p>
                          </div>
                          <span className="order-item-price">{(item.price * item.quantity).toLocaleString('ru-RU')} ₸</span>
                        </div>
                      ))}
                      {order.items?.length > 3 && (
                        <p className="order-more">+{order.items.length - 3} товаров</p>
                      )}
                    </div>
                    <div className="order-card-footer">
                      <span className="order-total">Итого: <strong>{order.total_price?.toLocaleString('ru-RU')} ₸</strong></span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── FAVORITES ── */}
          {tab === 'favorites' && (
            <div className="favorites-grid">
              {favorites.length === 0 ? (
                <div className="profile-empty">
                  <span>❤️</span>
                  <p>Нет избранных товаров</p>
                  <Link to="/catalog" className="profile-empty-btn">Перейти в каталог</Link>
                </div>
              ) : favorites.map(fav => (
                <div key={fav.article} className="fav-card">
                  {fav.image_url && (
                    <Link to={`/product/${fav.article}`} className="fav-image">
                      <img src={fav.image_url} alt={fav.name} />
                    </Link>
                  )}
                  <div className="fav-info">
                    <Link to={`/product/${fav.article}`} className="fav-name">{fav.name}</Link>
                    {fav.price && <p className="fav-price">{fav.price?.toLocaleString('ru-RU')} ₸</p>}
                  </div>
                  <button className="fav-remove" onClick={() => handleRemoveFavorite(fav.article)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* ── ADDRESSES ── */}
          {tab === 'addresses' && (
            <div className="addresses-section">
              <AddressForm userId={user.id} onAdded={fetchAddresses} />
              <div className="addresses-list">
                {addresses.length === 0 ? (
                  <p className="addresses-empty">Нет сохранённых адресов</p>
                ) : addresses.map(addr => (
                  <div key={addr.id} className={`address-card ${addr.is_default ? 'default' : ''}`}>
                    <div className="address-info">
                      <span className="address-label">{addr.label}</span>
                      {addr.is_default && <span className="address-default-badge">По умолчанию</span>}
                      <p className="address-text">{addr.city}, {addr.street}{addr.apartment ? `, кв. ${addr.apartment}` : ''}</p>
                    </div>
                    <div className="address-actions">
                      {!addr.is_default && (
                        <button className="addr-btn" onClick={() => handleSetDefaultAddress(addr.id)}>
                          Сделать основным
                        </button>
                      )}
                      <button className="addr-btn addr-btn-delete" onClick={() => handleDeleteAddress(addr.id)}>
                        Удалить
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── SETTINGS ── */}
          {tab === 'settings' && (
            <form className="settings-form" onSubmit={handleSaveProfile}>
              <div className="settings-field">
                <label>Имя и фамилия</label>
                <input
                  type="text" value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Иван Иванов"
                />
              </div>
              <div className="settings-field">
                <label>Телефон</label>
                <input
                  type="tel" value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+77001234567"
                />
              </div>
              <div className="settings-field">
                <label>Email</label>
                <input type="email" value={user?.email || ''} disabled className="settings-input-disabled" />
                <p className="settings-hint">Email изменить нельзя</p>
              </div>
              <div className="settings-actions">
                <button type="submit" className="settings-save" disabled={saving}>
                  {saving ? 'Сохранение...' : 'Сохранить изменения'}
                </button>
                {saveMsg && <span className="settings-msg">{saveMsg}</span>}
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
}

// ── Форма добавления адреса ──────────────────────────────────
function AddressForm({ userId, onAdded }) {
  const [open, setOpen]     = useState(false);
  const [label, setLabel]   = useState('Дом');
  const [city, setCity]     = useState('Алматы');
  const [street, setStreet] = useState('');
  const [apt, setApt]       = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await supabase.from('addresses').insert({
      user_id: userId, label, city, street, apartment: apt
    });
    setSaving(false);
    setStreet(''); setApt(''); setOpen(false);
    onAdded();
  };

  if (!open) return (
    <button className="add-address-btn" onClick={() => setOpen(true)}>
      + Добавить адрес
    </button>
  );

  return (
    <form className="address-form" onSubmit={handleSubmit}>
      <h4>Новый адрес</h4>
      <div className="address-form-row">
        <select value={label} onChange={e => setLabel(e.target.value)} className="addr-select">
          <option>Дом</option><option>Работа</option><option>Другое</option>
        </select>
        <input type="text" value={city} onChange={e => setCity(e.target.value)} placeholder="Город" required />
      </div>
      <input type="text" value={street} onChange={e => setStreet(e.target.value)} placeholder="Улица и дом" required />
      <input type="text" value={apt} onChange={e => setApt(e.target.value)} placeholder="Квартира (необязательно)" />
      <div className="address-form-btns">
        <button type="submit" className="addr-save-btn" disabled={saving}>{saving ? 'Сохранение...' : 'Сохранить'}</button>
        <button type="button" className="addr-cancel-btn" onClick={() => setOpen(false)}>Отмена</button>
      </div>
    </form>
  );
}