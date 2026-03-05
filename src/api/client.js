import axios from 'axios';

// Backend configuration
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const USE_BACKEND = import.meta.env.VITE_USE_BACKEND === 'true';

console.log('🔧 API Mode:', USE_BACKEND ? 'BACKEND' : 'DEMO');
console.log('🔗 Backend URL:', USE_BACKEND ? BACKEND_URL : 'N/A');

// Создаем axios instance
const apiClient = axios.create({
  baseURL: USE_BACKEND ? BACKEND_URL : '',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.message);
    return Promise.reject(error);
  }
);

export { USE_BACKEND, BACKEND_URL };
export default apiClient;