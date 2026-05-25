import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, Lock, Sparkles, Trophy, ChevronRight, Edit3, FileText } from 'lucide-react';
import Layout from '../components/Layout';
import EliteIdCard from '../components/EliteIdCard';
import RankBadge from '../components/RankBadge';
import ExpBar from '../components/ExpBar';
import ProfileEditModal from '../components/ProfileEditModal';
import StreakWidget from '../components/StreakWidget';
import { api } from '../lib/api';
import { auth } from '../lib/auth';
import { useLevelUp } from '../lib/useLevelUp';
import { RANK_COLORS } from '../lib/progression';

export default function Dashboard() {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const { checkLevelUp, setBaseline } = useLevelUp();

  async function load() {
    if (!auth.isAuthed()) return;
    try {
      const { data } = await api.get('/players/me');
      setMe(data);
      const stored = localStorage.getItem('ec_last_level');
      if (!stored) setBaseline(data?.progress?.level || 1);
      else checkLevelUp();
    } catch (e) {
      setError(e.response?.data?.detail || 'Error cargando datos');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  if (!auth.isAuthed()) return <Navigate to="/login" replace />;

  if (loading) {
    return (
      <Layout>
        <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center text-white/40">
          Cargando tu Ruta…
        </div>
      </Layout>
    );
  }

  if (error || !me) {
    return (
      <Layout>
        <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center text-rose-400">
          {error || 'Sin datos'}
        </div>
      </Layout>
    );
  }

  const { player, progress, progress_to_next, benefits, season_name } = me;
  const cardPlayer = {
    ...player,
    level: progress?.level ?? 1,
    current_rank: progress?.current_rank ?? 'INICIADO',
  };
  const rankColors = RANK_COLORS[progress?.current_rank || 'INICIADO'];

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-6 py-10">
        <header className="mb-8 flex items-end justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs tracking-widest uppercase text-white/40">{season_name || 'Sin temporada activa'}</p>
            <h1 className="font-display text-3xl font-bold mt-1">Hola, {player.alias}</h1>
          </div>
          <button onClick={() => setEditOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-sm transition">
            <Edit3 size={14} /> Editar mi perfil
          </button>
        </header>

        <div className="grid md:grid-cols-[auto_1fr] gap-8 items-start">
          <div className="flex flex-col items-center gap-3">
            <EliteIdCard player={cardPlayer} />
            <button onClick={() => setEditOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs text-white/60 hover:text-white">
              <Edit3 size={12} /> {player.avatar_url || player.bio ? 'Editar foto y reseña' : 'Agregar foto y reseña'}
            </button>
          </div>

          <div className="space-y-6 min-w-0">
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
              className="p-6 rounded-2xl bg-bg-surface border border-bg-border"
            >
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <RankBadge rank={progress?.current_rank || 'INICIADO'} level={progress?.level} size="lg" />
                {progress?.was_promoted_start && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md bg-elite-gold/10 text-elite-gold border border-elite-gold/30">
                    <Sparkles size={12} /> Inicio promovido por mérito previo
                  </span>
                )}
              </div>
              {progress ? <ExpBar level={progress.level} expInLevel={progress.exp_in_level} /> : (
                <p className="text-sm text-white/50">No tienes progreso en la temporada activa todavía.</p>
              )}
              {progress && (
                <div className="grid grid-cols-3 gap-4 mt-6 pt-5 border-t border-white/5">
                  <Stat label="EXP total" value={progress.exp_total.toLocaleString()} />
                  <Stat label="Nivel inicial" value={progress.starting_level} />
                  <Stat label="Rango máx. T" value={RANK_COLORS[progress.max_rank].label} />
                </div>
              )}
            </motion.div>

            <StreakWidget />

            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}
              className="p-6 rounded-2xl bg-bg-surface border border-bg-border"
            >
              <h2 className="font-display text-lg font-semibold mb-4 flex items-center justify-between">
                Beneficios
                <span className="text-xs font-normal text-white/40">
                  {benefits.filter((b) => b.unlocked).length} / {benefits.length} desbloqueados
                </span>
              </h2>
              <ul className="space-y-2.5">
                {benefits.map((b) => (
                  <li key={b.level} className="flex items-center gap-3 text-sm">
                    {b.unlocked
                      ? <Check size={16} className="text-elite-blue flex-shrink-0" />
                      : <Lock size={16} className="text-white/30 flex-shrink-0" />}
                    <span className={b.unlocked ? 'text-white' : 'text-white/40'}>
                      {b.label} <span className="font-mono text-white/30">(N{b.level})</span>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-5 pt-4 border-t border-white/5">
                <Link to="/ruta" className="inline-flex items-center gap-1.5 text-xs text-elite-blue hover:text-elite-violet">
                  Ver Ruta del Campeón completa <ChevronRight size={12} />
                </Link>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.15 }}
              className="p-6 rounded-2xl bg-bg-surface border border-bg-border"
            >
              <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2">
                <FileText size={16} className="text-elite-blue" /> Sobre mí
              </h2>
              {player.bio ? (
                <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">{player.bio}</p>
              ) : (
                <button onClick={() => setEditOpen(true)}
                  className="w-full p-4 rounded-lg border border-dashed border-white/15 text-sm text-white/50 hover:text-white hover:border-elite-violet/40 hover:bg-white/5 transition text-left">
                  + Agregar una reseña sobre ti — cuéntale a la comunidad quién eres
                </button>
              )}
            </motion.div>

            <div className="grid sm:grid-cols-2 gap-4">
              <Link to="/ranking" className="p-5 rounded-2xl bg-bg-surface border border-bg-border hover:border-elite-violet/40 transition group">
                <Trophy size={18} className="text-elite-gold mb-2" />
                <p className="font-semibold">Ver ranking de temporada</p>
                <p className="text-xs text-white/40 mt-1">Compara tu posición con los demás <ChevronRight size={12} className="inline group-hover:translate-x-1 transition-transform" /></p>
              </Link>
              <Link to="/events" className="p-5 rounded-2xl bg-bg-surface border border-bg-border hover:border-elite-violet/40 transition group">
                <Sparkles size={18} className="text-elite-violet mb-2" />
                <p className="font-semibold">Próximos eventos</p>
                <p className="text-xs text-white/40 mt-1">Inscríbete y gana EXP <ChevronRight size={12} className="inline group-hover:translate-x-1 transition-transform" /></p>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <ProfileEditModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        profile={player}
        onUpdated={() => { load(); }}
      />
    </Layout>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-[10px] tracking-widest uppercase text-white/40">{label}</p>
      <p className="font-mono text-lg text-white mt-1">{value}</p>
    </div>
  );
}
