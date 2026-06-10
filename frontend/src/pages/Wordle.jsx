import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Send, Share2, Trophy, Frown } from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';
import { api } from '../lib/api';

const COLORS = {
  exact:   'bg-emerald-500 text-emerald-50 ring-emerald-300',
  partial: 'bg-amber-500 text-amber-50 ring-amber-300',
  far:     'bg-slate-700 text-slate-300 ring-slate-500',
  up:      'bg-rose-500 text-rose-50 ring-rose-300',
  down:    'bg-cyan-500 text-cyan-50 ring-cyan-300',
};

const ARROW = { up: '▲', down: '▼', exact: '✓' };

export default function Wordle() {
  const [state, setState] = useState(null);
  const [guess, setGuess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const debounceRef = useRef(null);

  const load = async () => {
    try {
      const { data } = await api.get('/wordle/status');
      setState(data);
    } catch {
      toast.error('No se pudo cargar el Wordle');
    }
  };

  useEffect(() => { load(); }, []);

  // Autocomplete via Scryfall suggest
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (guess.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      api.get('/scanner/suggest', { params: { q: guess } })
        .then((r) => setSuggestions(r.data.suggestions || []))
        .catch(() => setSuggestions([]));
    }, 220);
  }, [guess]);

  const submit = async (name) => {
    const g = (name || guess).trim();
    if (!g) return;
    setSubmitting(true);
    try {
      await api.post('/wordle/guess', { guess: g });
      setGuess('');
      setSuggestions([]);
      await load();
    } catch (err) {
      const msg = err?.response?.data?.detail || 'Error';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const share = () => {
    if (!state) return;
    const rows = state.attempts.map((a) => emojiRow(a)).join('\n');
    const verdict = state.is_solved ? `${state.attempts.length}/6` : state.is_failed ? 'X/6' : `${state.attempts.length}/6…`;
    const text = `EliteCards Wordle ${state.date} — ${verdict}\n\n${rows}\n\nhttps://elitecards.cl/wordle`;
    if (navigator.share) {
      navigator.share({ text }).catch(() => navigator.clipboard?.writeText(text));
    } else {
      navigator.clipboard?.writeText(text);
      toast.success('Resultado copiado');
    }
  };

  if (!state) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <Navbar />
        <div className="max-w-2xl mx-auto px-6 py-20 text-center text-slate-400">Cargando Wordle…</div>
      </div>
    );
  }

  const done = state.is_solved || state.is_failed;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-emerald-950/20 text-white">
      <Navbar />

      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-2">
            <Sparkles size={14} className="text-emerald-400" />
            <span className="text-[10px] uppercase tracking-[0.5em] text-emerald-300 font-bold">
              Card Wordle
            </span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter mb-2">
            Adivina la carta.
          </h1>
          <p className="text-slate-400 text-sm">
            6 intentos. Cada intento te muestra qué cerca estás.
          </p>
        </div>

        {/* Leyenda */}
        <div className="mb-5 grid grid-cols-3 gap-2 text-[10px] uppercase tracking-widest font-bold">
          <Legend color="exact" label="Acierto" />
          <Legend color="partial" label="Parcial" />
          <Legend color="far" label="Lejos" />
        </div>

        {/* Tabla de intentos */}
        <div className="space-y-2 mb-6">
          {[...state.attempts, ...Array(Math.max(0, 6 - state.attempts.length))].map((a, i) => (
            <AttemptRow key={i} attempt={a} />
          ))}
        </div>

        {/* Input */}
        {!done && (
          <div className="relative mb-6">
            <input
              type="text"
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="Nombre de la carta (en inglés)…"
              disabled={submitting}
              className="w-full px-4 py-3 pr-32 rounded-xl bg-white/[0.05] border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 disabled:opacity-50"
            />
            <button
              onClick={() => submit()}
              disabled={!guess.trim() || submitting}
              className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 text-white text-sm font-bold disabled:opacity-50 transition"
            >
              <Send size={14} /> Guess
            </button>
            {suggestions.length > 0 && (
              <ul className="absolute z-10 left-0 right-0 mt-1 rounded-xl bg-bg-surface/95 backdrop-blur-xl border border-bg-border shadow-2xl overflow-hidden max-h-48 overflow-y-auto">
                {suggestions.slice(0, 8).map((s) => (
                  <li key={s}>
                    <button
                      onClick={() => submit(s)}
                      className="w-full text-left px-4 py-2 text-sm text-white/80 hover:bg-emerald-500/10 hover:text-white"
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Result */}
        {done && state.answer && (
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className={`rounded-2xl p-5 ${state.is_solved ? 'bg-emerald-500/15 ring-1 ring-emerald-400/40' : 'bg-rose-500/15 ring-1 ring-rose-400/40'}`}
          >
            <div className="flex items-start gap-4">
              {state.answer.image_url && (
                <img src={state.answer.image_url} alt={state.answer.name} className="w-24 rounded-lg ring-1 ring-white/10" />
              )}
              <div className="flex-1 min-w-0">
                <div className={`flex items-center gap-2 text-xs uppercase tracking-widest font-bold mb-1 ${state.is_solved ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {state.is_solved ? <><Trophy size={14}/> ¡Resuelto!</> : <><Frown size={14}/> Casi…</>}
                </div>
                <h3 className="text-2xl font-black">{state.answer.name}</h3>
                <p className="text-xs text-slate-400 mt-1">
                  {state.answer.type_line} · {state.answer.set_code?.toUpperCase()}
                </p>
              </div>
            </div>
            <button
              onClick={share}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/10 text-white text-sm font-bold transition"
            >
              <Share2 size={14} /> Compartir
            </button>
          </motion.div>
        )}

        <p className="text-center text-xs text-slate-500 mt-8">
          {state.attempts_left} intentos restantes · Una carta nueva cada día.
        </p>
      </div>
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`w-4 h-4 rounded ring-1 ${COLORS[color]}`} />
      <span className="text-slate-400">{label}</span>
    </div>
  );
}

function AttemptRow({ attempt }) {
  if (!attempt) {
    return (
      <div className="grid grid-cols-[1fr_auto] gap-2 p-3 rounded-xl bg-white/[0.02] ring-1 ring-white/5 min-h-[58px]">
        <div className="text-slate-600 text-sm italic flex items-center">—</div>
      </div>
    );
  }
  const cells = [
    { label: 'CMC', val: attempt.cmc?.value, res: attempt.cmc?.result, arrow: ARROW[attempt.cmc?.result] || '' },
    { label: 'Colors', val: (attempt.colors?.value || []).join('') || '—', res: attempt.colors?.result },
    { label: 'Rarity', val: attempt.rarity?.value, res: attempt.rarity?.result },
    { label: 'Set', val: attempt.set?.value, res: attempt.set?.result },
  ];
  return (
    <div className="p-3 rounded-xl bg-white/[0.03] ring-1 ring-white/10">
      <div className="font-bold text-sm mb-2">{attempt.name}</div>
      <div className="grid grid-cols-4 gap-1.5">
        {cells.map((c, i) => (
          <div key={i} className={`text-center py-2 rounded-md ring-1 text-xs font-bold ${COLORS[c.res] || COLORS.far}`}>
            <div className="text-[9px] uppercase tracking-widest opacity-70">{c.label}</div>
            <div className="font-black truncate px-1">{c.val ?? '—'} {c.arrow && <span>{c.arrow}</span>}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function emojiRow(attempt) {
  const map = { exact: '🟩', partial: '🟨', far: '⬛', up: '⬆', down: '⬇' };
  return [attempt.cmc?.result, attempt.colors?.result, attempt.rarity?.result, attempt.set?.result]
    .map((r) => map[r] || '⬛').join('');
}
