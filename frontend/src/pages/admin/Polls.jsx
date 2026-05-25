import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Vote, Plus, X, Trash2, Lock } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import AdminFormModal, { Field, Input, Textarea } from '../../components/AdminFormModal';
import { api } from '../../lib/api';
import { useGuild } from '../../lib/useGuild';

export default function AdminPolls() {
  const { current } = useGuild();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ question: '', options: ['', ''], closes_at: '' });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try { setItems((await api.get('/polls')).data); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [current?.guild?.id]);

  function openNew() {
    setCreating(true);
    setForm({ question: '', options: ['', ''], closes_at: '' });
  }

  function setOption(i, v) {
    const opts = [...form.options]; opts[i] = v;
    setForm({ ...form, options: opts });
  }

  function addOption() { setForm({ ...form, options: [...form.options, ''] }); }
  function removeOption(i) {
    if (form.options.length <= 2) return;
    setForm({ ...form, options: form.options.filter((_, idx) => idx !== i) });
  }

  async function submit() {
    const opts = form.options.map((o) => o.trim()).filter(Boolean);
    if (opts.length < 2) { toast.error('Necesitas al menos 2 opciones'); return; }
    if (!form.question.trim()) { toast.error('Pregunta requerida'); return; }
    setSaving(true);
    try {
      await api.post('/polls', {
        question: form.question.trim(),
        options: opts,
        closes_at: form.closes_at ? new Date(form.closes_at).toISOString() : null,
      });
      toast.success('Encuesta creada');
      setCreating(false); load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
    finally { setSaving(false); }
  }

  async function close(p) {
    if (!confirm('¿Cerrar votación?')) return;
    try { await api.post(`/polls/${p.id}/close`); load(); } catch (e) { toast.error('Error'); }
  }
  async function del(p) {
    if (!confirm('¿Borrar encuesta?')) return;
    try { await api.delete(`/polls/${p.id}`); load(); } catch (e) { toast.error('Error'); }
  }

  return (
    <AdminLayout title="Encuestas del Gremio" subtitle="Pregunta a tus miembros." actions={
      <button onClick={openNew} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-elite-violet to-elite-blue text-white text-sm font-medium hover:shadow-glow-violet">
        <Plus size={14} /> Nueva encuesta
      </button>
    }>
      {loading ? <p className="text-white/40 text-sm">Cargando…</p> : items.length === 0 ? (
        <div className="p-10 rounded-2xl bg-bg-surface border border-bg-border text-center">
          <Vote size={28} className="mx-auto text-white/30 mb-3" />
          <p className="text-white/60 text-sm">Sin encuestas aún.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((p) => {
            const total = p.options.reduce((s, o) => s + o.vote_count, 0);
            return (
              <div key={p.id} className="p-4 rounded-xl bg-bg-surface border border-bg-border">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="font-semibold flex items-center gap-2">
                      {!p.is_active && <Lock size={12} className="text-white/40" />}
                      {p.question}
                    </p>
                    <p className="text-[10px] text-white/40 mt-1">
                      {total} {total === 1 ? 'voto' : 'votos'}
                      {p.closes_at && ` · cierra ${new Date(p.closes_at).toLocaleString('es-CL')}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {p.is_active && (
                      <button onClick={() => close(p)} className="p-1.5 rounded text-white/50 hover:text-amber-300 hover:bg-amber-500/10" title="Cerrar">
                        <Lock size={13} />
                      </button>
                    )}
                    <button onClick={() => del(p)} className="p-1.5 rounded text-rose-400 hover:text-rose-300 hover:bg-rose-500/10" title="Borrar">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {p.options.map((o) => {
                    const pct = total > 0 ? (o.vote_count / total) * 100 : 0;
                    return (
                      <div key={o.id} className="relative">
                        <div className="flex items-center justify-between gap-2 text-xs px-3 py-1.5 relative z-10">
                          <span>{o.text}</span>
                          <span className="font-mono text-white/60">{o.vote_count} · {pct.toFixed(0)}%</span>
                        </div>
                        <div className="absolute inset-0 rounded-md bg-elite-violet/10" style={{ clipPath: `polygon(0 0, ${pct}% 0, ${pct}% 100%, 0 100%)` }} />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AdminFormModal open={creating} title="Nueva encuesta" onClose={() => setCreating(false)} onSubmit={submit} submitting={saving}>
        <Field label="Pregunta"><Textarea rows={2} value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} maxLength={280} /></Field>
        <Field label="Opciones" hint="Mínimo 2, máximo 10.">
          {form.options.map((o, i) => (
            <div key={i} className="flex gap-2 mb-1.5">
              <Input value={o} onChange={(e) => setOption(i, e.target.value)} placeholder={`Opción ${i + 1}`} maxLength={160} />
              {form.options.length > 2 && (
                <button type="button" onClick={() => removeOption(i)} className="p-2 rounded text-rose-400 hover:bg-rose-500/10"><X size={13} /></button>
              )}
            </div>
          ))}
          {form.options.length < 10 && (
            <button type="button" onClick={addOption} className="text-xs text-elite-violet hover:text-white inline-flex items-center gap-1">
              <Plus size={11} /> Agregar opción
            </button>
          )}
        </Field>
        <Field label="Cierre (opcional)"><Input type="datetime-local" value={form.closes_at} onChange={(e) => setForm({ ...form, closes_at: e.target.value })} /></Field>
      </AdminFormModal>
    </AdminLayout>
  );
}
