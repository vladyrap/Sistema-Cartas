import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Camera, Upload, X, Save } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api';

const CLASSES = ['DUELISTA', 'COLECCIONISTA', 'ESTRATEGA', 'MENTOR', 'TRADER', 'EXPLORADOR'];

export default function ProfileEditModal({ open, onClose, profile, onUpdated }) {
  const [form, setForm] = useState({
    full_name: profile?.full_name || '',
    bio: profile?.bio || '',
    avatar_url: profile?.avatar_url || '',
    player_class: profile?.player_class || 'DUELISTA',
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  async function uploadFile(file) {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    setUploading(true);
    try {
      const { data } = await api.post('/players/me/avatar', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setForm((f) => ({ ...f, avatar_url: data.avatar_url || '' }));
      toast.success('Foto subida');
      onUpdated?.(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'No se pudo subir');
    } finally {
      setUploading(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        full_name: form.full_name || null,
        bio: form.bio || null,
        avatar_url: form.avatar_url || null,
        player_class: form.player_class,
      };
      const { data } = await api.patch('/players/me/profile', payload);
      toast.success('Perfil actualizado');
      onUpdated?.(data);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.form
            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
            className="w-full max-w-md max-h-[90vh] rounded-2xl bg-bg-surface border border-bg-border overflow-hidden flex flex-col"
          >
            <header className="flex items-center justify-between p-5 border-b border-bg-border flex-shrink-0">
              <h2 className="font-display text-lg font-semibold">Editar mi perfil</h2>
              <button type="button" onClick={onClose} className="text-white/50 hover:text-white">
                <X size={18} />
              </button>
            </header>

            <div className="p-5 space-y-4 overflow-y-auto">
              {/* Avatar */}
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-full bg-bg-elevated border border-bg-border overflow-hidden flex items-center justify-center flex-shrink-0">
                  {form.avatar_url ? (
                    <img src={form.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Camera size={24} className="text-white/30" />
                  )}
                </div>
                <div className="flex-grow">
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-xs transition disabled:opacity-50">
                    <Upload size={12} /> {uploading ? 'Subiendo…' : 'Subir foto'}
                  </button>
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => uploadFile(e.target.files?.[0])} />
                  <p className="text-[10px] text-white/40 mt-1.5">JPG / PNG / WEBP · máx 3MB</p>
                </div>
              </div>

              <div>
                <label className="block text-xs text-white/60 mb-1.5">O pega una URL de imagen</label>
                <input value={form.avatar_url}
                  onChange={(e) => setForm({ ...form, avatar_url: e.target.value })}
                  placeholder="https://… o /uploads/avatars/…"
                  className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-bg-border text-sm placeholder:text-white/30 focus:outline-none focus:border-elite-violet/60" />
              </div>

              <div>
                <label className="block text-xs text-white/60 mb-1.5">Nombre completo</label>
                <input value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  maxLength={120}
                  className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-bg-border text-sm placeholder:text-white/30 focus:outline-none focus:border-elite-violet/60" />
              </div>

              <div>
                <label className="block text-xs text-white/60 mb-1.5">Clase</label>
                <select value={form.player_class}
                  onChange={(e) => setForm({ ...form, player_class: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-bg-border text-sm">
                  {CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs text-white/60 mb-1.5">
                  Reseña <span className="text-white/30 font-mono">({form.bio.length}/500)</span>
                </label>
                <textarea value={form.bio}
                  onChange={(e) => setForm({ ...form, bio: e.target.value.slice(0, 500) })}
                  rows={4} maxLength={500}
                  placeholder="Cuéntale a la comunidad quién eres, qué juegas, qué te gusta…"
                  className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-bg-border text-sm placeholder:text-white/30 focus:outline-none focus:border-elite-violet/60 resize-none" />
              </div>
            </div>

            <footer className="p-4 border-t border-bg-border flex items-center justify-end gap-2 bg-bg-elevated/30 flex-shrink-0">
              <button type="button" onClick={onClose}
                className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-sm">
                Cancelar
              </button>
              <button type="submit" disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-elite-violet to-elite-blue text-white font-medium hover:shadow-glow-violet transition disabled:opacity-50 text-sm">
                <Save size={14} /> {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </footer>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
