import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ec_access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // Normalización: baseURL ya es '/api' — si el caller pasó '/api/x',
  // evitamos el doble prefijo '/api/api/x'.
  if (config.url?.startsWith('/api/')) config.url = config.url.slice(4);
  // Trazabilidad: si el server inyecta X-Request-Id en la response, lo logueamos
  config.metadata = { startedAt: Date.now() };
  return config;
});

// ─── Retry con exponential backoff en errores de red / 5xx / 429 ───
const MAX_RETRIES = 2;
const isRetryable = (err) => {
  // No retry si fue cancelado por nosotros
  if (axios.isCancel(err)) return false;
  // Sin respuesta = error de red, timeout, DNS, etc.
  if (!err.response) return true;
  const s = err.response.status;
  // 5xx siempre. 429 sí (server pide esperar). 4xx (otros) no.
  return s >= 500 || s === 429;
};

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const cfg = err.config || {};

    // 401 → token expirado/inválido. Limpiar y rechazar.
    if (err.response?.status === 401) {
      localStorage.removeItem('ec_access_token');
      return Promise.reject(err);
    }

    // Retry logic
    cfg.__retryCount = cfg.__retryCount || 0;
    if (cfg.__retryCount < MAX_RETRIES && isRetryable(err)) {
      cfg.__retryCount += 1;
      const backoff = 400 * Math.pow(2, cfg.__retryCount - 1);
      // 429: respetar Retry-After si vino
      const retryAfter = err.response?.headers?.['retry-after'];
      const wait = retryAfter ? Math.min(Number(retryAfter) * 1000, 8000) : backoff;
      await new Promise((r) => setTimeout(r, wait));
      return api.request(cfg);
    }

    return Promise.reject(err);
  }
);
