import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Crown, Trophy, Award, Globe, Shield } from 'lucide-react';
import Layout from '../components/Layout';
import { api } from '../lib/api';
import { useGuild } from '../lib/useGuild';

const CATEGORY_META = {
  season_champion: { label: 'Campeón de temporada', icon: Crown, color: 'text-elite-gold', border: 'border-elite-gold/40', bg: 'bg-elite-gold/10' },
  top_8: { label: 'Top 8', icon: Trophy, color: 'text-elite-violet', border: 'border-elite-violet/30', bg: 'bg-elite-violet/5' },
  best_rookie: { label: 'Mejor novato', icon: Award, color: 'text-elite-blue', border: 'border-elite-blue/30', bg: 'bg-elite-blue/5' },
};

function metaFor(category) {
  if (category in CATEGORY_META) return CATEGORY_META[category];
  return { label: category.replace(/_/g, ' '), icon: Award, color: 'text-white/60', border: 'border-white/10', bg: 'bg-white/5' };
}

export default function HallOfFame() {
  const { current } = useGuild();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState('guild'); // 'guild' | 'global'

  useEffect(() => {
    setLoading(true);
    api.get(`/hall-of-fame?scope=${scope}`)
      .then((r) => setEntries(r.data))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [scope, current?.guild?.id]);

  // Agrupar por temporada — incluye guild_id para distinguir entries de cross-Gremio
  const grouped = entries.reduce((acc, e) => {
    const k = `${e.guild_id ?? 'g'}::${e.season_id}`;
    if (!acc[k]) acc[k] = {
      season_id: e.season_id, number: e.season_number, name: e.season_name,
      guild_id: e.guild_id, guild_name: e.guild_name, guild_code: e.guild_code,
      guild_accent: e.guild_accent_color, items: [],
    };
    acc[k].items.push(e);
    return acc;
  }, {});
  const seasons = Object.values(grouped).sort((a, b) => b.number - a.number);

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-6 py-10">
        <header className="text-center mb-8">
          <Crown size={36} className="mx-auto text-elite-gold mb-3" />
          <h1 className="font-display text-4xl font-bold">Hall of Fame</h1>
          <p className="text-white/50 mt-2 text-sm max-w-md mx-auto">
            Los nombres que quedan en la historia. Cada temporada deja su huella.
          </p>
        </header>

        <div className="flex justify-center gap-2 mb-8">
          <button
            onClick={() => setScope('guild')}
            disabled={!current}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition border disabled:opacity-40 ${
              scope === 'guild'
                ? 'bg-elite-gold/10 text-elite-gold border-elite-gold/40'
                : 'bg-bg-surface text-white/60 border-bg-border hover:text-white'
            }`}
          >
            <Shield size={13} /> {current?.guild?.name || 'Mi Gremio'}
          </button>
          <button
            onClick={() => setScope('global')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition border ${
              scope === 'global'
                ? 'bg-elite-violet/15 text-elite-violet border-elite-violet/40'
                : 'bg-bg-surface text-white/60 border-bg-border hover:text-white'
            }`}
          >
            <Globe size={13} /> Global (todos los Gremios)
          </button>
        </div>

        {loading ? (
          <p className="text-white/40 text-center">Cargando…</p>
        ) : seasons.length === 0 ? (
          <p className="text-center text-white/40">Aún no hay temporadas cerradas.</p>
        ) : (
          <div className="space-y-8">
            {seasons.map((season, sidx) => {
              const champ = season.items.find((i) => i.category === 'season_champion');
              const top8 = season.items.filter((i) => i.category === 'top_8');
              const others = season.items.filter((i) => i.category !== 'season_champion' && i.category !== 'top_8');
              return (
                <motion.section
                  key={season.season_id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: sidx * 0.05 }}
                  className="p-6 rounded-2xl bg-gradient-to-br from-elite-gold/5 via-bg-surface to-bg-surface border border-elite-gold/20"
                >
                  <header className="mb-5">
                    <span className="text-xs tracking-widest uppercase text-elite-gold font-semibold">Temporada T{season.number}</span>
                    <h2 className="font-display text-2xl font-bold mt-1">{season.name}</h2>
                    {scope === 'global' && season.guild_name && (
                      <p className="mt-2 inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md bg-bg-elevated/60 border border-bg-border"
                         style={season.guild_accent ? { borderColor: `${season.guild_accent}55`, color: season.guild_accent } : {}}>
                        <Shield size={11} /> {season.guild_name}
                      </p>
                    )}
                  </header>

                  {champ && (
                    <div className="mb-5 p-5 rounded-xl bg-gradient-to-br from-elite-gold/15 via-elite-gold/5 to-transparent border border-elite-gold/40 shadow-glow-gold">
                      <div className="flex items-center gap-3">
                        <Crown size={28} className="text-elite-gold" />
                        <div>
                          <p className="text-[10px] tracking-widest uppercase text-elite-gold">Campeón</p>
                          <p className="font-display text-2xl font-bold">{champ.player_alias}</p>
                          <p className="font-mono text-[10px] text-white/50">{champ.player_elite_id}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {top8.length > 0 && (
                    <div>
                      <p className="text-xs uppercase tracking-widest text-white/40 mb-2">Top 8</p>
                      <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-2">
                        {top8.map((it) => (
                          <div key={it.entry_id} className="p-3 rounded-lg bg-bg-elevated/60 border border-bg-border">
                            <p className="font-semibold text-sm">{it.player_alias}</p>
                            <p className="font-mono text-[10px] text-white/40">{it.note || it.player_elite_id}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {others.length > 0 && (
                    <div className="mt-5 pt-5 border-t border-white/5">
                      <p className="text-xs uppercase tracking-widest text-white/40 mb-2">Otros honores</p>
                      <div className="flex flex-wrap gap-2">
                        {others.map((it) => {
                          const m = metaFor(it.category);
                          const Icon = m.icon;
                          return (
                            <div key={it.entry_id} className={`px-3 py-1.5 rounded-md ${m.bg} ${m.border} border inline-flex items-center gap-2 text-xs`}>
                              <Icon size={12} className={m.color} />
                              <span className="text-white/80">{it.player_alias}</span>
                              <span className={`${m.color}`}>· {m.label}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {season.items.length === 0 && (
                    <p className="text-sm text-white/40">Esta temporada no tiene entradas registradas.</p>
                  )}
                </motion.section>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
