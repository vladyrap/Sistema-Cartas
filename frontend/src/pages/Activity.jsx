import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Activity as ActivityIcon, Sparkles } from 'lucide-react';
import Layout from '../components/Layout';

const ICONS = {
  level_up: '🎉',
  event_registration: '📅',
  achievement: '🏅',
  champion: '👑',
  result: '🏆',
};

const COLOR = {
  champion: 'border-elite-gold/40 bg-elite-gold/5',
  result: 'border-elite-violet/30 bg-elite-violet/5',
  achievement: 'border-elite-magenta/30 bg-elite-magenta/5',
  event_registration: 'border-elite-blue/30 bg-elite-blue/5',
  level_up: 'border-emerald-500/30 bg-emerald-500/5',
};

import { api } from '../lib/api';

export default function Activity() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/activity/feed', { params: { limit: 50 } })
      .then((r) => setRows(r.data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-6 py-10">
        <header className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-elite-violet/10 border border-elite-violet/30 mb-3">
            <Sparkles size={12} className="text-elite-violet" />
            <span className="text-[10px] tracking-widest uppercase text-elite-violet">Comunidad EliteCards</span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold flex items-center justify-center gap-2">
            <ActivityIcon size={28} className="text-elite-violet" /> Actividad
          </h1>
          <p className="text-white/50 mt-2 text-sm">Lo que está pasando en la plataforma — torneos, medallas, campeones.</p>
        </header>

        {loading ? (
          <p className="text-center text-white/40">Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="text-center text-white/40">Aún no hay actividad reciente.</p>
        ) : (
          <ol className="space-y-2">
            {rows.map((row, i) => (
              <motion.li
                key={`${row.kind}-${row.at}-${row.player_id}-${i}`}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
                className={`flex items-start gap-3 p-3 rounded-xl border ${COLOR[row.kind] || 'border-bg-border bg-bg-surface'}`}
              >
                <span className="text-lg leading-none mt-0.5 flex-shrink-0">{ICONS[row.kind] || '✨'}</span>
                <div className="flex-grow min-w-0">
                  <p className="text-sm">
                    <Link to={`/players/${row.player_id}`} className="font-semibold text-white hover:text-elite-blue">{row.player_alias}</Link>
                    {' '}
                    <span className="text-white/70">{row.description}</span>
                  </p>
                  <p className="text-[10px] font-mono text-white/30 mt-1">
                    {new Date(row.at).toLocaleString('es-CL')}
                  </p>
                </div>
                {row.link && (
                  <Link to={row.link} className="text-xs text-elite-blue hover:underline flex-shrink-0">
                    Ver →
                  </Link>
                )}
              </motion.li>
            ))}
          </ol>
        )}
      </div>
    </Layout>
  );
}
