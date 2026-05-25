import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Crown, Trophy, User, Award, Sparkles, Activity as ActivityIcon } from 'lucide-react';
import Layout from '../components/Layout';
import EliteIdCard from '../components/EliteIdCard';
import RankBadge from '../components/RankBadge';
import { api } from '../lib/api';

export default function PublicProfile() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get(`/players/${id}/public`)
      .then((r) => setData(r.data))
      .catch((e) => setError(e.response?.data?.detail || 'No encontrado'))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-6 py-10">
        <Link to="/ranking" className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white mb-6">
          <ArrowLeft size={14} /> Volver al ranking
        </Link>

        {loading && <p className="text-white/40">Cargando…</p>}
        {error && <p className="text-rose-400">{error}</p>}

        {data && (
          <>
            <header className="mb-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-elite-blue/10 border border-elite-blue/30 mb-3">
                <User size={12} className="text-elite-blue" />
                <span className="text-[10px] tracking-widest uppercase text-elite-blue">Perfil público</span>
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                <h1 className="font-display text-3xl sm:text-4xl font-bold">{data.alias}</h1>
                {data.current_rank && <RankBadge rank={data.current_rank} level={data.current_level} size="lg" />}
                {data.current_position && (
                  <span className="inline-flex items-center gap-1 text-xs font-mono text-elite-gold">
                    <Trophy size={12} /> #{data.current_position} en temporada
                  </span>
                )}
                <Link to={`/players/${id}/stats`}
                  className="ml-auto inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-elite-blue/10 text-elite-blue border border-elite-blue/30 hover:bg-elite-blue/20 transition">
                  <ActivityIcon size={12} /> Ver estadísticas
                </Link>
              </div>
            </header>

            <div className="grid md:grid-cols-[auto_1fr] gap-8 items-start">
              <EliteIdCard player={{
                alias: data.alias, avatar_url: data.avatar_url,
                player_class: data.player_class, elite_id_code: data.elite_id_code,
                prestige: data.prestige, level: data.current_level || 1,
                current_rank: data.current_rank || 'INICIADO',
              }} />

              <div className="space-y-6 min-w-0">
                {/* Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Stat label="Prestigio" value={data.prestige.toLocaleString()} icon={Crown} accent="text-elite-gold" />
                  <Stat label="Temporadas" value={data.season_count} icon={Sparkles} />
                  <Stat label="Medallas" value={data.achievements.length} icon={Award} accent="text-elite-magenta" />
                  <Stat label="Clase" value={data.player_class.toLowerCase()} icon={User} />
                </div>

                {/* Bio */}
                {data.bio && (
                  <div className="p-5 rounded-2xl bg-bg-surface border border-bg-border">
                    <h2 className="text-[10px] tracking-widest uppercase text-white/40 mb-2">Sobre {data.alias}</h2>
                    <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">{data.bio}</p>
                  </div>
                )}

                {/* Medallas */}
                {data.achievements.length > 0 && (
                  <div className="p-5 rounded-2xl bg-bg-surface border border-bg-border">
                    <h2 className="font-display text-base font-semibold mb-3 flex items-center gap-2">
                      <Award size={14} className="text-elite-magenta" /> Medallas ({data.achievements.length})
                    </h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {data.achievements.map((a, i) => (
                        <motion.div
                          key={`${a.achievement.id}-${a.season_id || 'g'}-${i}`}
                          initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.04 }}
                          className="p-3 rounded-xl bg-gradient-to-br from-elite-magenta/10 to-bg-elevated border border-elite-magenta/20 text-center">
                          <Crown size={18} className="mx-auto text-elite-magenta mb-1.5" />
                          <p className="text-xs font-semibold truncate">{a.achievement.name}</p>
                          {a.season_id && <p className="text-[9px] font-mono text-elite-gold mt-0.5">T{a.season_id}</p>}
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Historial */}
                <div className="p-5 rounded-2xl bg-bg-surface border border-bg-border">
                  <h2 className="font-display text-base font-semibold mb-3 flex items-center gap-2">
                    <Trophy size={14} className="text-elite-gold" /> Historial de temporadas
                  </h2>
                  {data.history.length === 0 ? (
                    <p className="text-sm text-white/40">Aún no ha cerrado temporadas.</p>
                  ) : (
                    <div className="space-y-2">
                      {data.history.map((h) => (
                        <div key={h.season_id} className="flex items-center justify-between flex-wrap gap-2 p-3 rounded-lg bg-bg-elevated/40 border border-bg-border">
                          <div>
                            <p className="text-sm font-semibold">T{h.season_number} · {h.season_name}</p>
                            <p className="text-xs text-white/40">Nivel {h.final_level} · {h.final_exp_total.toLocaleString()} EXP</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <RankBadge rank={h.max_rank} size="sm" />
                            {h.final_position && <span className="text-xs font-mono text-white/60">#{h.final_position}</span>}
                            <span className="text-xs text-elite-gold font-mono">+{h.prestige_earned}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

function Stat({ label, value, icon: Icon, accent }) {
  return (
    <div className="p-3 rounded-xl bg-bg-surface border border-bg-border">
      <Icon size={14} className={accent || 'text-white/60'} />
      <p className="text-[9px] tracking-widest uppercase text-white/40 mt-2">{label}</p>
      <p className={`font-mono text-lg font-bold mt-0.5 ${accent || 'text-white'}`}>{value}</p>
    </div>
  );
}
