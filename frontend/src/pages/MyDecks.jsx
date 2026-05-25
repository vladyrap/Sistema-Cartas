import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { Layers, Plus, Edit3, Trash2, Sparkles, X, Loader2, AlertCircle, Check } from 'lucide-react';
import Layout from '../components/Layout';
import AdminFormModal, { Field, Input, Textarea, Select } from '../components/AdminFormModal';
import { api } from '../lib/api';

const EMPTY = { game_id: '', name: '', archetype: '', list_text: '', notes: '' };

export default function MyDecks() {
  const [decks, setDecks] = useState([]);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(null); // deck id
  const [analysis, setAnalysis] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const [d, g] = await Promise.all([api.get('/decks/me'), api.get('/games')]);
      setDecks(d.data); setGames(g.data);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function openNew() {
    setEditing('new');
    setForm({ ...EMPTY, game_id: games[0]?.id || '' });
  }
  function openEdit(d) {
    setEditing(d.id);
    setForm({
      game_id: d.game_id,
      name: d.name,
      archetype: d.archetype || '',
      list_text: d.list_text || '',
      notes: d.notes || '',
    });
  }

  async function submit() {
    setSaving(true);
    try {
      const payload = {
        game_id: Number(form.game_id),
        name: form.name,
        archetype: form.archetype || null,
        list_text: form.list_text || null,
        notes: form.notes || null,
      };
      if (editing === 'new') {
        await api.post('/decks/me', payload);
        toast.success('Deck guardado');
      } else {
        const { game_id, ...rest } = payload;
        await api.patch(`/decks/me/${editing}`, rest);
        toast.success('Actualizado');
      }
      setEditing(null); load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
    finally { setSaving(false); }
  }

  async function del(d) {
    if (!confirm(`¿Borrar "${d.name}"?`)) return;
    await api.delete(`/decks/me/${d.id}`); load();
  }

  async function analyze(d) {
    if (!d.list_text || d.list_text.trim().length < 10) {
      toast.error('El deck necesita una lista cargada (mínimo 10 chars)');
      return;
    }
    setAnalyzing(d.id);
    setAnalysis(null);
    try {
      const r = await api.post(`/ai/decks/${d.id}/analyze`);
      setAnalysis({ ...r.data, deck_name: d.name });
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error en análisis IA');
    } finally { setAnalyzing(null); }
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <header className="mb-6 flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-elite-violet/10 border border-elite-violet/30 mb-2">
              <Layers size={12} className="text-elite-violet" />
              <span className="text-[10px] tracking-widest uppercase text-elite-violet font-semibold">Mis Decks</span>
            </div>
            <h1 className="font-display text-3xl font-bold">Mi colección</h1>
            <p className="text-sm text-white/50 mt-1">Registra tus decks. Usa IA para analizarlos al instante.</p>
          </div>
          <button onClick={openNew} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-elite-violet to-elite-blue text-white text-sm font-medium hover:shadow-glow-violet">
            <Plus size={14} /> Nuevo deck
          </button>
        </header>

        {loading ? <p className="text-white/40 text-sm">Cargando…</p> : decks.length === 0 ? (
          <div className="p-10 rounded-2xl bg-bg-surface border border-bg-border text-center">
            <Layers size={32} className="mx-auto text-white/30 mb-3" />
            <p className="text-white/60">Aún no registraste ningún deck.</p>
            <button onClick={openNew} className="mt-4 text-sm text-elite-violet hover:text-white">Crear el primero →</button>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {decks.map((d, i) => (
              <motion.div
                key={d.id}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                className="p-4 rounded-2xl bg-bg-surface border border-bg-border hover:border-elite-violet/40 transition"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-grow min-w-0">
                    <p className="font-display font-semibold leading-tight">{d.name}</p>
                    <p className="text-[10px] tracking-widest uppercase text-white/40 mt-0.5">{d.game_name}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => openEdit(d)} className="p-1.5 rounded text-white/50 hover:text-white hover:bg-white/5" title="Editar">
                      <Edit3 size={13} />
                    </button>
                    <button onClick={() => del(d)} className="p-1.5 rounded text-rose-400 hover:bg-rose-500/10" title="Borrar">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                {d.archetype && (
                  <p className="text-xs text-elite-violet mb-2">{d.archetype}</p>
                )}
                {d.list_text ? (
                  <pre className="text-[10px] text-white/50 font-mono whitespace-pre-wrap line-clamp-4 leading-relaxed">{d.list_text}</pre>
                ) : (
                  <p className="text-[10px] text-white/30 italic">Sin lista cargada</p>
                )}
                <button
                  onClick={() => analyze(d)}
                  disabled={analyzing === d.id}
                  className="mt-3 w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-elite-violet/20 to-elite-blue/20 border border-elite-violet/30 hover:border-elite-violet/60 text-xs text-elite-violet hover:text-white transition disabled:opacity-50"
                >
                  {analyzing === d.id ? (
                    <><Loader2 size={12} className="animate-spin" /> Analizando con Claude…</>
                  ) : (
                    <><Sparkles size={12} /> Analizar con IA</>
                  )}
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Form modal */}
      <AdminFormModal
        open={editing !== null}
        title={editing === 'new' ? 'Nuevo deck' : 'Editar deck'}
        onClose={() => setEditing(null)}
        onSubmit={submit}
        submitting={saving}
        size="lg"
      >
        <Field label="Juego">
          <Select value={form.game_id} onChange={(e) => setForm({ ...form, game_id: e.target.value })} required disabled={editing !== 'new'}>
            <option value="">— Elige juego —</option>
            {games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select>
        </Field>
        <Field label="Nombre">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={1} maxLength={120} placeholder="Ej. Mono-Red Aggro" />
        </Field>
        <Field label="Arquetipo (opcional)">
          <Input value={form.archetype} onChange={(e) => setForm({ ...form, archetype: e.target.value })} maxLength={80} placeholder="Aggro · Control · Combo · Midrange" />
        </Field>
        <Field label="Lista (decklist)" hint="Pega tu decklist. La IA la lee para análisis.">
          <Textarea rows={8} value={form.list_text} onChange={(e) => setForm({ ...form, list_text: e.target.value })} placeholder="4 Lightning Bolt&#10;4 Goblin Guide&#10;..." className="font-mono text-[11px]" />
        </Field>
        <Field label="Notas">
          <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
      </AdminFormModal>

      {/* Analysis modal */}
      {analysis && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setAnalysis(null)}>
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-bg-surface border border-elite-violet/40 shadow-2xl"
          >
            <header className="p-5 border-b border-bg-border flex items-center justify-between sticky top-0 bg-bg-surface z-10">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-elite-violet" />
                <h2 className="font-display font-semibold">Análisis IA: {analysis.deck_name}</h2>
              </div>
              <button onClick={() => setAnalysis(null)} className="text-white/50 hover:text-white">
                <X size={18} />
              </button>
            </header>
            <div className="p-5 space-y-4">
              {analysis.error ? (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs">
                  <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">No pudimos parsear la respuesta como JSON.</p>
                    {analysis.raw && <pre className="mt-2 text-[10px] font-mono whitespace-pre-wrap text-white/60 max-h-40 overflow-y-auto">{analysis.raw}</pre>}
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {analysis.game && (
                      <Card label="Juego detectado" value={analysis.game} />
                    )}
                    {analysis.archetype && (
                      <Card label="Arquetipo" value={analysis.archetype} accent />
                    )}
                  </div>

                  {analysis.summary && (
                    <div className="p-4 rounded-lg bg-elite-violet/5 border border-elite-violet/30">
                      <p className="text-[10px] uppercase tracking-widest text-elite-violet mb-1.5">Resumen</p>
                      <p className="text-sm text-white/90 leading-relaxed">{analysis.summary}</p>
                    </div>
                  )}

                  {analysis.strengths?.length > 0 && (
                    <Section label="Fortalezas" items={analysis.strengths} icon={Check} cls="text-emerald-300" />
                  )}
                  {analysis.weaknesses?.length > 0 && (
                    <Section label="Debilidades" items={analysis.weaknesses} icon={AlertCircle} cls="text-rose-300" />
                  )}
                  {analysis.suggestions?.length > 0 && (
                    <Section label="Sugerencias" items={analysis.suggestions} icon={Sparkles} cls="text-elite-gold" />
                  )}
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </Layout>
  );
}

function Card({ label, value, accent }) {
  return (
    <div className={`p-3 rounded-lg border ${accent ? 'bg-elite-violet/10 border-elite-violet/30' : 'bg-bg-elevated border-bg-border'}`}>
      <p className="text-[10px] uppercase tracking-widest text-white/40 mb-1">{label}</p>
      <p className={`text-sm font-semibold ${accent ? 'text-elite-violet' : ''}`}>{value}</p>
    </div>
  );
}

function Section({ label, items, icon: Icon, cls }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-white/40 mb-2">{label}</p>
      <ul className="space-y-1.5">
        {items.map((s, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <Icon size={12} className={`${cls} flex-shrink-0 mt-1`} />
            <span className="text-white/80">{s}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
