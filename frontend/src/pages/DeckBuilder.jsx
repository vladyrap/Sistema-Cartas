/** Deck Builder visual: autocomplete con card art, mana curve,
 * archetype detection live, validación inline, AI analyzer.
 */
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, AlertTriangle, Sparkles, Save, Trash2, Eye, Printer, Crown } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';

import { api } from '../lib/api';
import CardAutocomplete from '../components/CardAutocomplete';
import ManaCurve from '../components/ManaCurve';

function parseCmc(manaCost) {
  if (!manaCost) return null;
  // Parsear {1}{R}{R} → 3, {X}{R} → 1 (X ignorado para la curva)
  const matches = manaCost.match(/\{([^}]+)\}/g) || [];
  let cmc = 0;
  for (const m of matches) {
    const inside = m.slice(1, -1);
    if (/^\d+$/.test(inside)) cmc += parseInt(inside, 10);
    else if (inside !== 'X') cmc += 1;
  }
  return cmc;
}

export default function DeckBuilder() {
  const { id } = useParams();
  const deckId = Number(id);

  const [deck, setDeck] = useState(null);
  const [enriched, setEnriched] = useState(null);
  const [validation, setValidation] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [section, setSection] = useState('main'); // main | side | extra

  async function refresh() {
    try {
      const [dRes, eRes] = await Promise.all([
        api.get(`/decks/me/${deckId}`),
        api.get(`/tcg/decks/${deckId}/enrich`).catch(() => ({ data: null })),
      ]);
      setDeck(dRes.data);
      setEnriched(eRes.data);
    } finally { setLoading(false); }
  }

  useEffect(() => { refresh(); }, [deckId]);

  async function addCard(card) {
    // Insertar línea "1 <name>" en list_text del deck, según sección.
    const current = deck.list_text || '';
    const section_marker = {
      main: null,
      side: '// Sideboard',
      extra: '// Extra Deck',
    }[section];

    let newText;
    if (section === 'main') {
      newText = `1 ${card.name}\n${current}`;
    } else {
      if (current.includes(section_marker)) {
        // Insertar después del marker
        newText = current.replace(section_marker, `${section_marker}\n1 ${card.name}`);
      } else {
        newText = `${current}\n${section_marker}\n1 ${card.name}\n`;
      }
    }
    await api.patch(`/decks/me/${deckId}`, { list_text: newText });
    refresh();
  }

  async function removeCard(name, sect) {
    // Decrementa o elimina la línea con esa carta.
    const lines = (deck.list_text || '').split('\n');
    const out = [];
    let removed = false;
    let inSection = 'main';
    for (const line of lines) {
      const l = line.trim();
      if (/sideboard|side:/i.test(l)) inSection = 'side';
      else if (/extra|extra deck/i.test(l)) inSection = 'extra';
      if (!removed && inSection === sect) {
        const m = l.match(/^(\d+)x?\s+(.+?)$/i);
        if (m && m[2].trim().toLowerCase() === name.toLowerCase()) {
          const qty = parseInt(m[1], 10);
          if (qty > 1) out.push(`${qty - 1} ${m[2]}`);
          // si qty == 1, omitir línea
          removed = true;
          continue;
        }
      }
      out.push(line);
    }
    await api.patch(`/decks/me/${deckId}`, { list_text: out.join('\n') });
    refresh();
  }

  async function validate() {
    try {
      const r = await api.post(`/decks/me/${deckId}/validate`);
      setValidation(r.data);
      toast.success(r.data.is_legal ? '✓ Deck legal' : `${r.data.issues.length} problemas detectados`);
    } catch (e) {
      toast.error('No se pudo validar (¿asignaste formato?)');
    }
  }

  async function analyze() {
    setAnalyzing(true);
    try {
      const r = await api.post(`/ai/decks/${deckId}/analyze`);
      setAnalysis(r.data);
    } catch { toast.error('Error en análisis IA'); }
    finally { setAnalyzing(false); }
  }

  // Mana curve desde enriched
  const manaCurveData = useMemo(() => {
    if (!enriched?.main) return [];
    const buckets = { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7+': 0 };
    for (const c of enriched.main) {
      const cmc = c.meta?.cmc ?? parseCmc(c.meta?.mana_cost);
      if (cmc == null) continue;
      const key = cmc >= 7 ? '7+' : String(Math.floor(cmc));
      buckets[key] = (buckets[key] || 0) + c.qty;
    }
    return Object.entries(buckets).map(([cost, count]) => ({ cost, count }));
  }, [enriched]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-400">Cargando…</div>;
  if (!deck) return <div className="min-h-screen flex items-center justify-center text-rose-400">Deck no encontrado</div>;

  const currentSection = enriched?.[section] || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950/30 text-white">
      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles size={14} className="text-violet-400" />
              <span className="text-[10px] uppercase tracking-widest text-violet-300 font-semibold">
                Deck Builder · {deck.game_name}
                {deck.format_name && <> · {deck.format_name}</>}
              </span>
            </div>
            <h1 className="text-3xl font-black bg-gradient-to-r from-white via-violet-100 to-violet-300 bg-clip-text text-transparent">
              {deck.name}
            </h1>
            {deck.archetype && <p className="text-slate-400 mt-1 text-sm">Arquetipo: {deck.archetype}</p>}
          </div>
          <div className="flex gap-2">
            <button onClick={validate} className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm hover:bg-white/10 flex items-center gap-2">
              <CheckCircle2 size={14} /> Validar
            </button>
            <button onClick={analyze} disabled={analyzing}
                    className="px-3 py-2 rounded-lg bg-violet-500/20 border border-violet-400/40 text-violet-100 text-sm hover:bg-violet-500/30 disabled:opacity-50 flex items-center gap-2">
              <Sparkles size={14} className={analyzing ? 'animate-pulse' : ''} />
              {analyzing ? 'Analizando…' : 'AI Analyzer'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6">
          {/* Columna izquierda: autocomplete + cartas */}
          <div className="space-y-5">
            {/* Toggle sección */}
            <div className="flex gap-1.5">
              {['main', 'side', 'extra'].map(s => (
                <button
                  key={s}
                  onClick={() => setSection(s)}
                  className={clsx(
                    'px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition',
                    section === s
                      ? 'bg-violet-500/20 border border-violet-400/40 text-violet-100'
                      : 'bg-white/5 border border-white/10 text-slate-400 hover:text-white'
                  )}
                >
                  {s === 'main' && `Main (${enriched?.main_count || 0})`}
                  {s === 'side' && `Side (${enriched?.side_count || 0})`}
                  {s === 'extra' && `Extra (${enriched?.extra_count || 0})`}
                </button>
              ))}
            </div>

            <CardAutocomplete gameId={deck.game_id} onAdd={addCard} />

            {/* Lista de cartas en grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {currentSection.map((c, i) => (
                <motion.div
                  key={`${c.name}-${i}`}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="group relative rounded-lg overflow-hidden bg-slate-900/40 border border-white/5 hover:border-violet-400/50 transition-all"
                >
                  {c.meta?.image_url ? (
                    <img src={c.meta.image_url} alt={c.name} className="w-full aspect-[63/88] object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full aspect-[63/88] flex items-center justify-center text-center text-[11px] text-slate-500 px-2">
                      {c.name}
                    </div>
                  )}
                  <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-black/80 backdrop-blur text-xs font-bold text-violet-300">
                    ×{c.qty}
                  </div>
                  <button
                    onClick={() => removeCard(c.name, section)}
                    className="absolute top-1.5 right-1.5 p-1 rounded-md bg-black/80 backdrop-blur opacity-0 group-hover:opacity-100 transition hover:bg-rose-500/80"
                  >
                    <Trash2 size={11} className="text-rose-300" />
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black via-black/80 to-transparent">
                    <div className="text-[10px] font-medium truncate">{c.name}</div>
                    {c.meta?.prices_usd != null && (
                      <div className="text-[9px] text-emerald-400 font-mono">${c.meta.prices_usd}</div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
            {currentSection.length === 0 && (
              <div className="text-center text-slate-500 py-8 text-sm">
                Empieza agregando cartas con el buscador
              </div>
            )}
          </div>

          {/* Columna derecha: stats + leader + validation + analysis */}
          <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
            {enriched?.leader && (
              <Panel title="Líder" icon={Crown}>
                <div className="flex items-center gap-3">
                  {enriched.leader.meta?.image_url && (
                    <img src={enriched.leader.meta.image_url} className="h-20 rounded shadow-lg" alt="" />
                  )}
                  <div>
                    <div className="font-semibold text-amber-300">{enriched.leader.name}</div>
                    {enriched.leader.meta?.set_name && <div className="text-[10px] text-slate-500">{enriched.leader.meta.set_name}</div>}
                  </div>
                </div>
              </Panel>
            )}

            <Panel title="Mana Curve" icon={Eye}>
              <ManaCurve data={manaCurveData} />
            </Panel>

            <Panel title="Stats" icon={Eye}>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat label="Main" value={enriched?.main_count || 0} hint={deck.is_legal === true ? '✓' : deck.is_legal === false ? '⚠' : ''} />
                <Stat label="Side" value={enriched?.side_count || 0} />
                <Stat label="Extra" value={enriched?.extra_count || 0} />
              </div>
              {enriched?.total_price_usd != null && (
                <div className="mt-3 text-center text-xs">
                  <span className="text-slate-500">Costo total: </span>
                  <span className="text-emerald-400 font-bold tabular-nums">${enriched.total_price_usd}</span>
                </div>
              )}
              <div className="mt-2 text-center text-[10px] text-slate-500">
                {enriched?.cards_resolved}/{enriched?.cards_total} cartas resueltas con metadata
              </div>
            </Panel>

            {validation && (
              <Panel title="Validación" icon={validation.is_legal ? CheckCircle2 : XCircle}
                     accent={validation.is_legal ? 'emerald' : 'rose'}>
                <div className={clsx('font-bold mb-2', validation.is_legal ? 'text-emerald-400' : 'text-rose-400')}>
                  {validation.is_legal ? '✓ Legal en este formato' : `⚠ ${validation.issues.length} problema(s)`}
                </div>
                <ul className="space-y-1 max-h-40 overflow-auto text-xs">
                  {validation.issues.map((i, k) => (
                    <li key={k} className="flex items-start gap-1.5">
                      <AlertTriangle size={11} className={clsx('shrink-0 mt-0.5', i.severity === 'error' ? 'text-rose-400' : 'text-amber-400')} />
                      <span className="text-slate-300">{i.message}</span>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}

            {analysis && (
              <Panel title="AI Insight" icon={Sparkles} accent="violet">
                <div className="text-xs space-y-2">
                  {analysis.archetype && (
                    <div>
                      <span className="text-slate-500">Arquetipo: </span>
                      <span className="font-bold text-violet-300">{analysis.archetype}</span>
                    </div>
                  )}
                  {analysis.strengths?.length > 0 && (
                    <div>
                      <div className="text-emerald-400 font-semibold mb-1">Fortalezas</div>
                      <ul className="space-y-0.5">
                        {analysis.strengths.map((s, k) => <li key={k} className="text-slate-300">• {s}</li>)}
                      </ul>
                    </div>
                  )}
                  {analysis.weaknesses?.length > 0 && (
                    <div>
                      <div className="text-rose-400 font-semibold mb-1">Debilidades</div>
                      <ul className="space-y-0.5">
                        {analysis.weaknesses.map((s, k) => <li key={k} className="text-slate-300">• {s}</li>)}
                      </ul>
                    </div>
                  )}
                  {analysis.suggestions?.length > 0 && (
                    <div>
                      <div className="text-amber-400 font-semibold mb-1">Sugerencias</div>
                      <ul className="space-y-0.5">
                        {analysis.suggestions.map((s, k) => <li key={k} className="text-slate-300">• {s}</li>)}
                      </ul>
                    </div>
                  )}
                  {analysis.summary && (
                    <p className="text-slate-400 italic pt-2 border-t border-white/5">{analysis.summary}</p>
                  )}
                </div>
              </Panel>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Panel({ title, icon: Icon, children, accent = 'violet' }) {
  const ring = {
    violet: 'border-violet-500/20',
    emerald: 'border-emerald-500/30',
    rose: 'border-rose-500/30',
  }[accent];
  return (
    <div className={clsx('rounded-xl bg-white/[0.03] border backdrop-blur-sm p-3', ring)}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-slate-400 font-semibold mb-2">
        <Icon size={11} /> {title}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value, hint }) {
  return (
    <div className="bg-black/30 rounded-lg p-2">
      <div className="text-[9px] uppercase text-slate-500">{label}</div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
      {hint && <div className="text-xs">{hint}</div>}
    </div>
  );
}
