import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Newspaper, ExternalLink, RefreshCw, MessageCircle, ArrowUp, Clock, Tag } from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';
import { api } from '../lib/api';

const GAMES = [
  { key: 'all',         label: 'Todos',         color: 'violet',  emoji: '🃏' },
  { key: 'mtg',         label: 'Magic',         color: 'amber',   emoji: '🜨' },
  { key: 'pokemon',     label: 'Pokémon',       color: 'rose',    emoji: '⚡' },
  { key: 'ygo',         label: 'Yu-Gi-Oh!',     color: 'fuchsia', emoji: '🜂' },
  { key: 'onepiece',    label: 'One Piece',     color: 'red',     emoji: '⚓' },
  { key: 'union_arena', label: 'Union Arena',   color: 'cyan',    emoji: '🜁' },
  { key: 'digimon',     label: 'Digimon',       color: 'emerald', emoji: '🜃' },
  { key: 'general',     label: 'General',       color: 'slate',   emoji: '✨' },
];

function relTime(iso) {
  const d = new Date(iso);
  const sec = Math.floor((Date.now() - d) / 1000);
  if (sec < 60) return 'ahora';
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)}d`;
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
}

export default function TcgNews() {
  const [items, setItems] = useState([]);
  const [game, setGame] = useState('all');
  const [loading, setLoading] = useState(true);

  const load = async (g = game) => {
    setLoading(true);
    try {
      const params = g === 'all' ? {} : { game: g };
      const r = await api.get('/api/news/feed', { params: { ...params, limit: 60 } });
      setItems(r.data || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'No se pudieron cargar las noticias');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load('all'); }, []);

  const pickGame = (g) => {
    setGame(g);
    load(g);
  };

  const refreshFromServer = async () => {
    try {
      toast.loading('Refrescando feeds…', { id: 'rf' });
      const r = await api.post('/api/news/refresh');
      toast.success(`+${r.data.inserted} noticias nuevas`, { id: 'rf' });
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Solo admins pueden refrescar', { id: 'rf' });
    }
  };

  const currentGame = GAMES.find(g => g.key === game) || GAMES[0];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-violet-950/30 text-white">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 pt-24 pb-16">
        <motion.header
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-violet-300/80 mb-1">
                <Newspaper size={14} /> News Feed
              </div>
              <h1 className="text-4xl font-black bg-gradient-to-r from-white via-violet-200 to-fuchsia-200 bg-clip-text text-transparent">
                Noticias TCG
              </h1>
              <p className="text-white/50 text-sm mt-1">
                Releases, banneos, eventos, deck tech — todo lo que pasa en el mundo de las cartas.
              </p>
            </div>
            <button
              onClick={refreshFromServer}
              className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm flex items-center gap-2"
            >
              <RefreshCw size={14} /> Refrescar
            </button>
          </div>
        </motion.header>

        <div className="flex flex-wrap gap-2 mb-6">
          {GAMES.map(g => {
            const active = game === g.key;
            return (
              <button
                key={g.key}
                onClick={() => pickGame(g.key)}
                className={`px-4 py-2 rounded-full text-sm font-medium flex items-center gap-1.5 transition border ${
                  active
                    ? `bg-${g.color}-500/30 border-${g.color}-400/60 text-${g.color}-100`
                    : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
                }`}
              >
                <span>{g.emoji}</span> {g.label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="grid place-items-center py-20">
            <RefreshCw className="animate-spin text-violet-400" size={32} />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-3xl bg-slate-900/40 border border-white/10 p-12 text-center">
            <Newspaper className="mx-auto mb-3 text-white/30" size={40} />
            <div className="text-lg font-bold">Sin noticias de {currentGame.label} todavía</div>
            <p className="text-white/40 text-sm mt-2">
              El scheduler corre cada hora. Si sos admin, dale "Refrescar" para forzar el fetch ahora.
            </p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((n, i) => {
                const gMeta = GAMES.find(g => g.key === n.game_key) || GAMES[0];
                return (
                  <motion.a
                    key={n.id}
                    href={n.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ delay: Math.min(i * 0.015, 0.4) }}
                    className={`group rounded-2xl bg-slate-900/50 border border-white/10 hover:border-${gMeta.color}-400/40 overflow-hidden transition flex flex-col`}
                  >
                    {n.image_url && (
                      <div className="aspect-[16/9] bg-slate-900 overflow-hidden relative">
                        <img
                          src={n.image_url}
                          alt=""
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                        <div className="absolute top-2 left-2">
                          <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-${gMeta.color}-500/30 backdrop-blur text-${gMeta.color}-100 border border-${gMeta.color}-400/40`}>
                            {gMeta.emoji} {gMeta.label}
                          </span>
                        </div>
                      </div>
                    )}
                    <div className="p-4 flex-1 flex flex-col">
                      {!n.image_url && (
                        <div className="mb-2">
                          <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-${gMeta.color}-500/20 text-${gMeta.color}-200 border border-${gMeta.color}-400/30`}>
                            {gMeta.emoji} {gMeta.label}
                          </span>
                        </div>
                      )}
                      <h3 className="font-bold text-white group-hover:text-violet-200 transition line-clamp-2 mb-2">
                        {n.title}
                      </h3>
                      {n.summary && (
                        <p className="text-sm text-white/50 line-clamp-3 mb-3">{n.summary}</p>
                      )}
                      <div className="mt-auto flex items-center justify-between gap-2 text-[11px] text-white/40 pt-2 border-t border-white/5">
                        <span className="flex items-center gap-1 truncate" title={n.source_label}>
                          <Tag size={10} className="shrink-0" />
                          <span className="truncate">{n.source_label}</span>
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          {n.score > 0 && <span className="flex items-center gap-0.5"><ArrowUp size={10} />{n.score}</span>}
                          {n.comments_count > 0 && <span className="flex items-center gap-0.5"><MessageCircle size={10} />{n.comments_count}</span>}
                          <span className="flex items-center gap-0.5"><Clock size={10} />{relTime(n.published_at)}</span>
                          <ExternalLink size={10} className="opacity-50" />
                        </span>
                      </div>
                    </div>
                  </motion.a>
                );
              })}
            </div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
