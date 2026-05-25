import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, BellRing, Check, CheckCheck, Inbox, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api';
import { useGuild } from '../lib/useGuild';

const ICONS = {
  level_up: '🎉',
  achievement_granted: '🏅',
  mission_completed: '✨',
  reservation_approved: '✅',
  reservation_rejected: '⛔',
  reservation_paid: '💳',
  event_finished_results: '🏆',
  event_registered: '📅',
  season_closed: '🔒',
};

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [scope, setScope] = useState('all'); // 'all' | 'guild'
  const ref = useRef(null);
  const { current, myGuilds } = useGuild();

  const guildById = (myGuilds || []).reduce((acc, mg) => { acc[mg.guild.id] = mg.guild; return acc; }, {});

  async function loadCount() {
    try {
      const { data } = await api.get('/notifications/unread-count');
      setUnread(data.unread_count || 0);
    } catch { /* silent */ }
  }

  async function loadList() {
    setLoading(true);
    try {
      const params = { limit: 30 };
      if (scope === 'guild' && current?.guild?.id) params.guild_id = current.guild.id;
      const { data } = await api.get('/notifications', { params });
      setItems(data.notifications);
      setUnread(data.unread_count);
    } catch { /* silent */ } finally { setLoading(false); }
  }

  useEffect(() => {
    loadCount();
    const interval = setInterval(loadCount, 45000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (open) loadList();
  }, [open, scope, current?.guild?.id]);

  useEffect(() => {
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  async function markOne(id) {
    try {
      await api.post(`/notifications/${id}/read`);
      setItems((arr) => arr.map((n) => n.id === id ? { ...n, is_read: true } : n));
      setUnread((u) => Math.max(0, u - 1));
    } catch { /* silent */ }
  }

  async function markAll() {
    try {
      await api.post('/notifications/read-all');
      setItems((arr) => arr.map((n) => ({ ...n, is_read: true })));
      setUnread(0);
    } catch { /* silent */ }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/5 transition"
        aria-label="Notificaciones"
      >
        {unread > 0 ? <BellRing size={18} className="text-elite-violet" /> : <Bell size={18} />}
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-elite-magenta text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-80 sm:w-96 max-h-[80vh] rounded-2xl bg-bg-surface border border-bg-border shadow-2xl overflow-hidden flex flex-col z-50"
          >
            <header className="flex items-center justify-between px-4 py-3 border-b border-bg-border">
              <div className="flex items-center gap-2">
                <Bell size={14} className="text-elite-violet" />
                <h3 className="font-semibold text-sm">Notificaciones</h3>
              </div>
              {unread > 0 && (
                <button onClick={markAll}
                  className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-white/70 transition">
                  <CheckCheck size={11} /> Marcar todas
                </button>
              )}
            </header>
            {current && (
              <div className="flex items-center gap-1 px-4 py-2 border-b border-bg-border bg-bg-elevated/30">
                <button onClick={() => setScope('all')}
                  className={`text-[10px] px-2 py-1 rounded transition ${scope === 'all' ? 'bg-elite-violet/20 text-elite-violet' : 'text-white/50 hover:text-white'}`}>
                  Todas
                </button>
                <button onClick={() => setScope('guild')}
                  className={`text-[10px] px-2 py-1 rounded transition ${scope === 'guild' ? 'bg-elite-violet/20 text-elite-violet' : 'text-white/50 hover:text-white'}`}>
                  Solo de {current.guild.name}
                </button>
              </div>
            )}

            <div className="overflow-y-auto">
              {loading ? (
                <p className="p-4 text-xs text-white/40">Cargando…</p>
              ) : items.length === 0 ? (
                <div className="p-8 text-center">
                  <Inbox size={28} className="mx-auto text-white/20 mb-2" />
                  <p className="text-xs text-white/40">Sin notificaciones todavía</p>
                </div>
              ) : (
                <ul className="divide-y divide-bg-border">
                  {items.map((n) => (
                    <li key={n.id} className={`flex items-start gap-3 p-3 hover:bg-white/[0.02] ${!n.is_read ? 'bg-elite-violet/5' : ''}`}>
                      <span className="text-lg flex-shrink-0 leading-none mt-0.5">
                        {ICONS[n.type] || '🔔'}
                      </span>
                      <div className="flex-grow min-w-0">
                        <div className="flex items-start gap-2">
                          {n.link ? (
                            <Link to={n.link} onClick={() => { markOne(n.id); setOpen(false); }}
                              className="flex-grow min-w-0">
                              <p className={`text-sm font-medium ${n.is_read ? 'text-white/70' : 'text-white'}`}>{n.title}</p>
                              {n.body && <p className="text-xs text-white/50 mt-0.5 leading-snug">{n.body}</p>}
                            </Link>
                          ) : (
                            <div className="flex-grow min-w-0">
                              <p className={`text-sm font-medium ${n.is_read ? 'text-white/70' : 'text-white'}`}>{n.title}</p>
                              {n.body && <p className="text-xs text-white/50 mt-0.5 leading-snug">{n.body}</p>}
                            </div>
                          )}
                          {!n.is_read && (
                            <button onClick={() => markOne(n.id)} title="Marcar leída"
                              className="text-white/30 hover:text-elite-violet flex-shrink-0">
                              <Check size={12} />
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-[9px] font-mono text-white/30">
                            {timeAgo(new Date(n.created_at))}
                          </p>
                          {n.guild_id && guildById[n.guild_id] && (
                            <span className="inline-flex items-center gap-1 text-[9px] text-white/40">
                              <Shield size={8} /> {guildById[n.guild_id].name}
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function timeAgo(date) {
  const ms = Date.now() - date.getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `hace ${d} d`;
  return date.toLocaleDateString('es-CL');
}
