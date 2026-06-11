import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Plus, Trash2, Edit3, Eye, EyeOff, ExternalLink,
  Construction, X, Image as ImageIcon, Check, Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../../components/Navbar';
import AuthGuard from '../../components/AuthGuard';
import { api } from '../../lib/api';
import { invalidateCache } from '../../lib/comingSoon';

// Rutas comunes preseteadas para autocompletar el admin
const SUGGESTED_ROUTES = [
  '/wrapped', '/quantum', '/quests', '/constellation', '/brain', '/sealed',
  '/voice-report', '/card-drama', '/devotion', '/deck-roulette', '/tornado',
  '/bounty', '/bounty-contracts', '/spinner', '/ar-id', '/visualizer',
  '/cardgrave', '/wordle', '/pack', '/ceiling', '/tinder', '/smack-talk',
  '/shop-radar', '/cosmos', '/news', '/duel', '/warroom',
];

export default function AdminComingSoon() {
  return (
    <AuthGuard feature="el panel de Coming Soon" returnUrl={window.location.pathname} accent="amber">
      <Inner />
    </AuthGuard>
  );
}

function Inner() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null = nuevo, obj = edit
  const [gallery, setGallery] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const [a, g] = await Promise.all([
        api.get('/api/coming-soon/admin/list'),
        api.get('/api/coming-soon/gallery'),
      ]);
      setItems(a.data || []);
      setGallery(g.data || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'No se pudo cargar');
    } finally {
      setLoading(false);
      invalidateCache();
    }
  };
  useEffect(() => { load(); }, []);

  const remove = async (it) => {
    if (!confirm(`Eliminar Coming Soon de ${it.route}?`)) return;
    try {
      await api.delete(`/api/coming-soon/${it.id}`);
      toast.success('Eliminado');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  };

  const toggleEnabled = async (it) => {
    try {
      await api.put(`/api/coming-soon/${it.id}`, { ...it, is_enabled: !it.is_enabled });
      toast.success(it.is_enabled ? 'Desactivado' : 'Activado');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-amber-950/10 to-slate-950 text-white">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 pt-24 pb-16 space-y-6">
        <Link to="/admin" className="flex items-center gap-2 text-white/60 hover:text-white text-sm w-fit">
          <ArrowLeft size={16} /> Admin
        </Link>

        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-amber-300 mb-1">
              <Construction size={14} /> Coming Soon
            </div>
            <h1 className="font-display text-3xl font-black">Páginas en construcción</h1>
            <p className="text-white/50 text-sm mt-1">
              Marcá rutas con un overlay TCG cuando aún no estén listas para producción.
            </p>
          </div>
          <button
            onClick={() => setEditing({ route: '', title: 'Próximamente', message: '', image_url: '', eta: '', is_enabled: true })}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-elite-violet to-elite-blue text-white font-bold shadow-lg shadow-elite-violet/30 hover:scale-[1.02] transition flex items-center gap-2"
          >
            <Plus size={16} /> Nueva
          </button>
        </div>

        {loading ? (
          <div className="grid place-items-center py-20 text-white/40">Cargando…</div>
        ) : items.length === 0 ? (
          <div className="rounded-3xl glass p-12 text-center">
            <Construction className="mx-auto mb-3 text-white/30" size={40} />
            <div className="text-lg font-bold mb-2">Sin páginas marcadas</div>
            <p className="text-white/50 text-sm max-w-md mx-auto">
              Cuando marqués una ruta como Coming Soon, los usuarios que la visiten verán un overlay con la imagen TCG que elijas en lugar del contenido.
            </p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {items.map(it => (
              <motion.div
                key={it.id}
                layout
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className={`relative rounded-2xl border overflow-hidden ${
                  it.is_enabled ? 'glass border-amber-400/30' : 'bg-bg-surface/50 border-white/5 opacity-60'
                }`}
              >
                {it.image_url && (
                  <div className="aspect-[16/7] relative overflow-hidden">
                    <img src={it.image_url} alt="" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-bg/90 via-bg/40 to-transparent" />
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-xs text-amber-300 truncate">{it.route}</div>
                      <h3 className="font-display font-bold text-lg truncate">{it.title}</h3>
                    </div>
                    <button
                      onClick={() => toggleEnabled(it)}
                      title={it.is_enabled ? 'Desactivar' : 'Activar'}
                      className={`p-2 rounded-lg ${it.is_enabled ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/5 text-white/40'} hover:opacity-100`}
                    >
                      {it.is_enabled ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                  </div>
                  {it.message && (
                    <p className="text-sm text-white/60 line-clamp-2 mb-3">{it.message}</p>
                  )}
                  {it.eta && (
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-elite-gold/10 text-elite-gold mb-3">
                      ETA: {it.eta}
                    </span>
                  )}
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => setEditing(it)}
                      className="flex-1 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-bold flex items-center justify-center gap-1.5"
                    >
                      <Edit3 size={12} /> Editar
                    </button>
                    <a
                      href={it.route}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-bold flex items-center gap-1.5"
                      title="Abrir página en nueva pestaña"
                    >
                      <ExternalLink size={12} />
                    </a>
                    <button
                      onClick={() => remove(it)}
                      className="px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 text-xs flex items-center gap-1"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {editing && (
          <EditorModal
            initial={editing}
            gallery={gallery}
            onClose={() => setEditing(null)}
            onSaved={() => { setEditing(null); load(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}


function EditorModal({ initial, gallery, onClose, onSaved }) {
  const [form, setForm] = useState({
    route: initial.route || '',
    title: initial.title || 'Próximamente',
    message: initial.message || '',
    image_url: initial.image_url || '',
    eta: initial.eta || '',
    is_enabled: initial.is_enabled ?? true,
  });
  const [saving, setSaving] = useState(false);
  const isEdit = !!initial.id;

  const setField = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const save = async () => {
    if (!form.route.startsWith('/')) {
      toast.error('La ruta debe empezar con /');
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await api.put(`/api/coming-soon/${initial.id}`, form);
        toast.success('Actualizado');
      } else {
        await api.post('/api/coming-soon/', form);
        toast.success('Creado');
      }
      onSaved();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
        onClick={e => e.stopPropagation()}
        className="bg-bg-elevated border border-white/10 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
      >
        <div className="p-5 border-b border-white/10 flex items-center justify-between sticky top-0 bg-bg-elevated z-10">
          <h2 className="font-display font-bold text-xl flex items-center gap-2">
            <Construction size={18} className="text-amber-300" />
            {isEdit ? 'Editar Coming Soon' : 'Nueva Coming Soon'}
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs uppercase tracking-wider text-white/50 font-bold mb-1.5 block">
              Ruta del frontend *
            </label>
            <input
              value={form.route}
              onChange={e => setField('route', e.target.value)}
              placeholder="/wrapped, /quantum, /events/:id"
              className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-bg-border focus:border-amber-400/60 outline-none font-mono text-sm"
            />
            {!form.route && (
              <div className="mt-2 flex flex-wrap gap-1">
                <span className="text-[10px] text-white/40 mr-1">Sugerencias:</span>
                {SUGGESTED_ROUTES.slice(0, 12).map(r => (
                  <button
                    key={r}
                    onClick={() => setField('route', r)}
                    className="text-[10px] px-2 py-0.5 rounded bg-white/5 hover:bg-amber-500/20 text-white/60 hover:text-amber-200 font-mono"
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-white/50 font-bold mb-1.5 block">
              Título
            </label>
            <input
              value={form.title}
              onChange={e => setField('title', e.target.value)}
              maxLength={120}
              className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-bg-border focus:border-amber-400/60 outline-none"
            />
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-white/50 font-bold mb-1.5 block">
              Mensaje
            </label>
            <textarea
              value={form.message || ''}
              onChange={e => setField('message', e.target.value)}
              rows={3}
              maxLength={600}
              placeholder="Estamos trabajando en algo épico. Volvé pronto."
              className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-bg-border focus:border-amber-400/60 outline-none resize-none"
            />
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-white/50 font-bold mb-1.5 block">
              ETA (opcional)
            </label>
            <input
              value={form.eta || ''}
              onChange={e => setField('eta', e.target.value)}
              maxLength={120}
              placeholder="Q3 2026, después del torneo, muy pronto…"
              className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-bg-border focus:border-amber-400/60 outline-none"
            />
          </div>

          <div>
            <label className="text-xs uppercase tracking-wider text-white/50 font-bold mb-1.5 block flex items-center gap-2">
              <ImageIcon size={12} /> Imagen TCG
            </label>
            <input
              value={form.image_url || ''}
              onChange={e => setField('image_url', e.target.value)}
              placeholder="https://… o elegí de la galería"
              className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-bg-border focus:border-amber-400/60 outline-none font-mono text-xs mb-3"
            />
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {gallery.map(item => {
                const picked = form.image_url === item.image_url;
                return (
                  <button
                    key={item.image_url}
                    onClick={() => setField('image_url', item.image_url)}
                    className={`relative aspect-[16/11] rounded-lg overflow-hidden border-2 transition ${
                      picked ? 'border-amber-400 ring-2 ring-amber-400/40' : 'border-transparent hover:border-white/30'
                    }`}
                    title={item.label}
                  >
                    <img src={item.image_url} alt={item.label} className="w-full h-full object-cover" loading="lazy" />
                    {picked && (
                      <div className="absolute inset-0 bg-amber-500/30 grid place-items-center">
                        <div className="w-7 h-7 rounded-full bg-amber-400 grid place-items-center">
                          <Check size={14} className="text-slate-950" />
                        </div>
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5">
                      <div className="text-[9px] text-white truncate font-bold">{item.label}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_enabled}
              onChange={e => setField('is_enabled', e.target.checked)}
              className="w-4 h-4 accent-amber-400"
            />
            <span className="text-sm">
              <span className="font-semibold">Activado</span>{' '}
              <span className="text-white/50">— usuarios verán el overlay en esta ruta</span>
            </span>
          </label>

          {/* Preview en miniatura */}
          {form.image_url && (
            <div className="border border-white/10 rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-bg-surface text-[10px] uppercase tracking-wider text-white/40 font-bold border-b border-white/5">
                Preview
              </div>
              <div className="relative h-32">
                <div className="absolute inset-0 bg-cover bg-center blur-md opacity-50" style={{ backgroundImage: `url(${form.image_url})` }} />
                <div className="absolute inset-0 bg-gradient-to-b from-bg/40 via-bg/60 to-bg" />
                <div className="absolute inset-0 grid place-items-center text-center px-4">
                  <div>
                    <div className="text-[9px] uppercase tracking-widest text-white/60 mb-1">
                      <Sparkles size={10} className="inline mr-1" /> En construcción
                    </div>
                    <div className="font-display font-black text-lg leading-tight">{form.title}</div>
                    {form.eta && <div className="text-[10px] text-amber-300 mt-1">ETA: {form.eta}</div>}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-5 border-t border-white/10 flex justify-end gap-2 sticky bottom-0 bg-bg-elevated">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm"
          >
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving || !form.route}
            className="px-5 py-2 rounded-lg bg-gradient-to-r from-elite-violet to-elite-blue text-white font-bold text-sm disabled:opacity-40"
          >
            {saving ? 'Guardando…' : (isEdit ? 'Guardar cambios' : 'Crear')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
