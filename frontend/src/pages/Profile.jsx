import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Award, Crown, Edit3, FileText } from 'lucide-react';
import Layout from '../components/Layout';
import EliteIdCard from '../components/EliteIdCard';
import RankBadge from '../components/RankBadge';
import ProfileEditModal from '../components/ProfileEditModal';
import { api } from '../lib/api';
import { auth } from '../lib/auth';
import { RANK_COLORS } from '../lib/progression';

export default function Profile() {
  const [me, setMe] = useState(null);
  const [history, setHistory] = useState([]);
  const [achievements, setAchievements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);

  async function load() {
    if (!auth.isAuthed()) return;
    setLoading(true);
    const [m, h, a] = await Promise.all([
      api.get('/players/me'),
      api.get('/players/me/history'),
      api.get('/achievements/me').catch(() => ({ data: [] })),
    ]);
    setMe(m.data); setHistory(h.data); setAchievements(a.data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  if (!auth.isAuthed()) return <Navigate to="/login" replace />;
  if (loading) return <Layout><div className="p-10 text-white/40">Cargando…</div></Layout>;
  if (!me) return <Layout><div className="p-10 text-rose-400">Sin perfil</div></Layout>;

  const { player, progress } = me;

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
          <h1 className="font-display text-3xl font-bold">Mi perfil</h1>
          <button onClick={() => setEditOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-elite-violet to-elite-blue text-white font-medium hover:shadow-glow-violet transition text-sm">
            <Edit3 size={14} /> Editar perfil
          </button>
        </div>

        <div className="grid md:grid-cols-[auto_1fr] gap-8 items-start">
          <EliteIdCard player={{ ...player, level: progress?.level ?? 1, current_rank: progress?.current_rank ?? 'INICIADO' }} />

          <div className="space-y-6 min-w-0">
            <div className="p-6 rounded-2xl bg-bg-surface border border-bg-border">
              <h2 className="font-display text-lg font-semibold mb-4">Información</h2>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <Row label="Alias" value={player.alias} />
                <Row label="Nombre" value={player.full_name || '—'} />
                <Row label="Clase" value={player.player_class.toLowerCase()} />
                <Row label="Prestigio histórico" value={`${player.prestige.toLocaleString()} pts`} highlight />
                <Row label="Elite ID" value={player.elite_id_code} mono />
                <Row label="Jugador #" value={`#${player.elite_id_number}`} mono />
              </dl>
            </div>

            <div className="p-6 rounded-2xl bg-bg-surface border border-bg-border">
              <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2">
                <FileText size={16} className="text-elite-blue" /> Sobre mí
              </h2>
              {player.bio ? (
                <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">{player.bio}</p>
              ) : (
                <p className="text-sm text-white/40 italic">Aún no has escrito una reseña. Cuéntale a la comunidad quién eres haciendo click en "Editar perfil".</p>
              )}
            </div>

            <div className="p-6 rounded-2xl bg-bg-surface border border-bg-border">
              <h2 className="font-display text-lg font-semibold mb-4 flex items-center gap-2">
                <Award size={16} className="text-elite-magenta" /> Medallas
                <span className="text-xs text-white/40 font-normal ml-auto">{achievements.length}</span>
              </h2>
              {achievements.length === 0 ? (
                <p className="text-sm text-white/40">Aún no tienes medallas. Compite, asiste a eventos y completa misiones.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {achievements.map((a, i) => (
                    <div key={`${a.achievement.id}-${a.season_id || 'global'}-${i}`}
                      className="p-3 rounded-xl bg-gradient-to-br from-elite-magenta/10 to-bg-elevated border border-elite-magenta/20 text-center">
                      <Crown size={20} className="mx-auto text-elite-magenta mb-2" />
                      <p className="text-xs font-semibold">{a.achievement.name}</p>
                      {a.achievement.description && (
                        <p className="text-[10px] text-white/40 mt-1 leading-tight">{a.achievement.description}</p>
                      )}
                      {a.season_id && (
                        <p className="text-[9px] font-mono text-elite-gold mt-1">T{a.season_id}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-6 rounded-2xl bg-bg-surface border border-bg-border">
              <h2 className="font-display text-lg font-semibold mb-4">Historial de temporadas</h2>
              {history.length === 0 ? (
                <p className="text-sm text-white/40">Aún no has completado ninguna temporada.</p>
              ) : (
                <div className="space-y-2">
                  {history.map((h) => (
                    <div key={h.season_id} className="flex items-center justify-between flex-wrap gap-2 p-3 rounded-lg bg-bg-elevated/40 border border-bg-border">
                      <div>
                        <p className="text-sm font-semibold">T{h.season_number} · {h.season_name}</p>
                        <p className="text-xs text-white/40">Nivel final {h.final_level} · EXP {h.final_exp_total.toLocaleString()}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <RankBadge rank={h.max_rank} size="sm" />
                        {h.final_position && (
                          <span className="text-xs font-mono text-white/60">#{h.final_position}</span>
                        )}
                        <span className="text-xs text-elite-gold font-mono">+{h.prestige_earned} prestigio</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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

function Row({ label, value, highlight, mono }) {
  return (
    <div>
      <dt className="text-[10px] tracking-widest uppercase text-white/40">{label}</dt>
      <dd className={`mt-0.5 ${mono ? 'font-mono' : ''} ${highlight ? 'text-elite-gold font-semibold' : 'text-white/80'}`}>{value}</dd>
    </div>
  );
}
