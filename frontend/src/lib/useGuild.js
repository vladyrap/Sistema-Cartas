import { useEffect, useState } from 'react';
import { api } from './api';
import { auth } from './auth';

const KEY = 'ec_current_guild_id';

const listeners = new Set();
function emit() { listeners.forEach((fn) => fn()); }

export const guildStore = {
  getId: () => {
    const v = localStorage.getItem(KEY);
    return v ? Number(v) : null;
  },
  setId: (id) => {
    if (id == null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, String(id));
    emit();
  },
};

// Interceptor: inyecta X-Guild-Id en cada request si hay uno seleccionado.
api.interceptors.request.use((config) => {
  const gid = guildStore.getId();
  if (gid != null) config.headers['X-Guild-Id'] = String(gid);
  return config;
});

export function useGuild() {
  const [currentId, setCurrentId] = useState(() => guildStore.getId());
  const [myGuilds, setMyGuilds] = useState([]);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    if (!auth.isAuthed()) {
      setMyGuilds([]);
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.get('/guilds/me');
      setMyGuilds(data);
      // Auto-seleccionar el primero si no hay uno guardado
      const stored = guildStore.getId();
      if (!stored && data.length > 0) {
        guildStore.setId(data[0].guild.id);
        setCurrentId(data[0].guild.id);
      } else if (stored && !data.find((g) => g.guild.id === stored)) {
        // El guildId guardado ya no aplica (saliste de él)
        const next = data[0]?.guild.id ?? null;
        guildStore.setId(next);
        setCurrentId(next);
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const onChange = () => setCurrentId(guildStore.getId());
    listeners.add(onChange);
    return () => listeners.delete(onChange);
  }, []);

  const current = myGuilds.find((g) => g.guild.id === currentId) || null;

  function switchTo(id) {
    guildStore.setId(id);
    setCurrentId(id);
  }

  return { current, currentId, myGuilds, loading, switchTo, refresh };
}
