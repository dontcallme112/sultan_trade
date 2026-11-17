import apiClient from '../client.js';
import { supabase } from '../supabaseClient.js';

// Все запросы раздела тендеров идут с токеном вошедшего пользователя. Секретов в браузере нет.
async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
const req = async (method, url, { params, data } = {}) => {
  const res = await apiClient.request({ method, url, params, data, headers: await authHeaders(), timeout: 60000 });
  return res.data;
};

export const tendersAPI = {
  access: () => req('GET', '/api/tenders/access'),
  meta: () => req('GET', '/api/tenders/meta'),
  dashboard: () => req('GET', '/api/tenders/dashboard'),
  sources: () => req('GET', '/api/tenders/sources'),
  list: (params) => req('GET', '/api/tenders', { params }),
  get: (id) => req('GET', `/api/tenders/${id}`),
  setFavorite: (id, on) => req(on ? 'PUT' : 'DELETE', `/api/tenders/${id}/favorite`),
  setState: (id, body) => req('PUT', `/api/tenders/${id}/state`, { data: body }),
  syncDemo: () => req('POST', '/api/tenders/sync/demo'),
  importFile: (json) => req('POST', '/api/tenders/import', { data: json }),
  getSettings: () => req('GET', '/api/tenders/settings'),
  saveSettings: (cfg) => req('PUT', '/api/tenders/settings', { data: cfg }),
};

export const errorMessage = (e) => e?.response?.data?.error || e?.message || 'Ошибка';
