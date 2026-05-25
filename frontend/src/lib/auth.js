import { api } from './api';

const KEY_ACCESS = 'ec_access_token';
const KEY_REFRESH = 'ec_refresh_token';

export const auth = {
  getAccess: () => localStorage.getItem(KEY_ACCESS),
  getRefresh: () => localStorage.getItem(KEY_REFRESH),
  isAuthed: () => Boolean(localStorage.getItem(KEY_ACCESS)),
  setTokens: ({ access_token, refresh_token }) => {
    localStorage.setItem(KEY_ACCESS, access_token);
    if (refresh_token) localStorage.setItem(KEY_REFRESH, refresh_token);
  },
  clear: () => {
    localStorage.removeItem(KEY_ACCESS);
    localStorage.removeItem(KEY_REFRESH);
  },
  async login(email, password) {
    const { data } = await api.post('/auth/login', { email, password });
    auth.setTokens(data);
    return data;
  },
  async register(payload) {
    const { data } = await api.post('/auth/register', payload);
    auth.setTokens(data);
    return data;
  },
  async me() {
    const { data } = await api.get('/auth/me');
    return data;
  },
  logout() {
    auth.clear();
    window.location.href = '/';
  },
};
