import axios from 'axios';

// Локально (npm run dev) → запросы идут через Vite proxy → Railway (CORS обходится)
// На проде (Vercel)      → запросы идут напрямую на Railway (CORS разрешён для vercel.app)
export const BACKEND_URL = import.meta.env.DEV
  ? ''   // пустая строка = относительный путь, Vite proxy подхватит /api/*
  : (import.meta.env.VITE_BACKEND_URL || 'https://sultantrade-production.up.railway.app');

console.log('🔗 BACKEND_URL:', BACKEND_URL || '(proxy)');

const apiClient = axios.create({
  baseURL: BACKEND_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.message);
    return Promise.reject(error);
  }
);

export default apiClient;