import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, GitBranch, ArrowLeft, Share2, Hash } from 'lucide-react';
import Navbar from '../components/Navbar';
import EmptyState from '../components/EmptyState';
import { api } from '../lib/api';

export default function DeckDNA() {
  const { id } = useParams();
  const [dna, setDna] = useState(null);
  const [relatives, setRelatives] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get(`/decks/${id}/dna`).then((r) => r.data),
      api.get(`/decks/${id}/relatives`).then((r) => r.data).catch(() => ({ relatives: [] })),
    ])
      .then(([d, r]) => { setDna(d); setRelatives(r); })
      .catch((e) => setError(e?.response?.data?.detail || 'No se pudo cargar el ADN'));
  }, [id]);

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <Navbar />
        <EmptyState icon={GitBranch} title="No disponible" description={error} accent="violet" />
      </div>
    );
  }

  if (!dna) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <Navbar />
        <div className="max-w-4xl mx-auto px-6 py-20 text-center text-slate-400">
          Analizando ADN…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-violet-950/20 to-slate-950 text-white overflow-hidden">
      <Navbar />

      <div className="max-w-5xl mx-auto px-6 py-10">
        <Link to="/decks" className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white mb-4">
          <ArrowLeft size={12} /> Volver a decks
        </Link>

        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <GitBranch size={14} className="text-violet-300" />
            <span className="text-[10px] uppercase tracking-[0.5em] text-violet-300 font-bold">
              Deck DNA · Genoma
            </span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tighter">{dna.deck_name}</h1>
          <div className="inline-flex items-center gap-2 mt-3 px-3 py-1.5 rounded-lg bg-violet-500/15 ring-1 ring-violet-500/30">
            <Hash size={12} className="text-violet-300" />
            <code className="text-sm font-mono text-violet-200">{dna.dna}</code>
          </div>
        </div>

        {/* Helix visual + features */}
        <div className="grid md:grid-cols-[1fr_1.3fr] gap-6">
          <DNAHelix cards={dna.features.top_cards} />

          <div className="space-y-3">
            <FeaturesPanel features={dna.features} />
            <TopCardsList top={dna.features.top_cards} />
          </div>
        </div>

        {/* Relatives */}
        {relatives && relatives.relatives.length > 0 && (
          <div className="mt-10">
            <h2 className="text-2xl font-black mb-1">Parientes genéticos</h2>
            <p className="text-sm text-slate-400 mb-5">
              Decks más cercanos por similitud de cartas (Jaccard).
            </p>
            <ul className="space-y-3">
              {relatives.relatives.map((r) => <RelativeRow key={r.deck_id} r={r} />)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function DNAHelix({ cards }) {
  // SVG helix con dots representando cards. Animation rotates helix slowly.
  const nodes = useMemo(() => {
    return (cards || []).slice(0, 12).map((c, i) => ({
      ...c,
      angle: i * 30,
      y: i * 24,
    }));
  }, [cards]);

  return (
    <div className="rounded-2xl bg-gradient-to-br from-violet-900/30 via-slate-900 to-fuchsia-900/30 ring-1 ring-violet-500/30 p-6 aspect-square overflow-hidden relative">
      <motion.svg
        viewBox="0 0 200 320"
        className="w-full h-full"
        animate={{ rotateY: [0, 360] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* Backbone curves */}
        {[0, 60, 120, 180, 240, 300].map((offset) => (
          <path
            key={offset}
            d={`M ${100 + 40 * Math.cos((offset * Math.PI) / 180)} 0
                Q 100 100, ${100 + 40 * Math.cos(((offset + 90) * Math.PI) / 180)} 200
                T ${100 + 40 * Math.cos(((offset + 180) * Math.PI) / 180)} 320`}
            stroke="rgba(168,85,247,0.2)"
            fill="none"
            strokeWidth="1"
          />
        ))}
        {/* Nodes */}
        {nodes.map((n, i) => {
          const x1 = 100 + 50 * Math.cos((n.angle * Math.PI) / 180);
          const x2 = 100 - 50 * Math.cos((n.angle * Math.PI) / 180);
          const y = 20 + i * 24;
          return (
            <g key={i}>
              <line x1={x1} y1={y} x2={x2} y2={y} stroke="rgba(168,85,247,0.3)" strokeWidth="1" />
              <circle cx={x1} cy={y} r="5" fill="url(#g1)" />
              <circle cx={x2} cy={y} r="5" fill="url(#g2)" />
            </g>
          );
        })}
        <defs>
          <radialGradient id="g1">
            <stop offset="0%" stopColor="#c4b5fd" />
            <stop offset="100%" stopColor="#7c3aed" />
          </radialGradient>
          <radialGradient id="g2">
            <stop offset="0%" stopColor="#f0abfc" />
            <stop offset="100%" stopColor="#c026d3" />
          </radialGradient>
        </defs>
      </motion.svg>
      <div className="absolute bottom-3 left-4 right-4 text-center">
        <p className="text-[10px] uppercase tracking-widest text-violet-300/60 font-bold">
          Double Helix · Top {nodes.length} cards
        </p>
      </div>
    </div>
  );
}

function FeaturesPanel({ features }) {
  return (
    <div className="rounded-2xl bg-white/[0.04] ring-1 ring-white/10 p-5">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Feature label="Archetype" value={features.archetype || '—'} />
        <Feature label="Leader" value={features.leader || '—'} />
        <Feature label="Cartas únicas" value={features.total_unique} />
        <Feature label="Total cartas" value={features.total_cards} />
        <Feature label="Main" value={features.main_count} />
        <Feature label="Side" value={features.side_count} />
      </div>
    </div>
  );
}

function Feature({ label, value }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">{label}</div>
      <div className="text-base font-bold mt-0.5 truncate">{value}</div>
    </div>
  );
}

function TopCardsList({ top }) {
  if (!top || top.length === 0) {
    return <div className="rounded-2xl bg-white/[0.03] p-4 text-center text-sm text-slate-500">Sin lista parseable.</div>;
  }
  return (
    <div className="rounded-2xl bg-white/[0.04] ring-1 ring-white/10 p-5">
      <div className="text-[10px] uppercase tracking-widest text-violet-300 font-bold mb-2">
        Top cards
      </div>
      <ul className="space-y-1">
        {top.slice(0, 8).map((c, i) => (
          <li key={i} className="flex justify-between text-sm py-1 border-b border-white/5 last:border-b-0">
            <span className="truncate">{c.name}</span>
            <span className="font-mono text-violet-300 tabular-nums shrink-0">×{c.qty}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RelativeRow({ r }) {
  const pct = Math.round(r.similarity * 100);
  return (
    <li className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.04] ring-1 ring-white/10 hover:bg-white/[0.07] transition">
      <div className="w-12 text-right">
        <div className="text-2xl font-black tabular-nums text-violet-300">{pct}%</div>
      </div>
      <div className="flex-1 min-w-0">
        <Link to={`/decks/${r.deck_id}/dna`} className="font-bold text-white hover:text-violet-300 truncate block">
          {r.deck_name}
        </Link>
        <div className="text-xs text-slate-500 truncate">
          {r.player_alias && <>de <span className="text-slate-400">{r.player_alias}</span> · </>}
          {r.archetype || '?'} · {r.shared_cards.length} cartas en común
        </div>
      </div>
      <div className="hidden sm:flex flex-wrap gap-1 max-w-[40%] justify-end">
        {r.shared_cards.slice(0, 3).map((c) => (
          <span key={c} className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-200">{c}</span>
        ))}
      </div>
    </li>
  );
}
