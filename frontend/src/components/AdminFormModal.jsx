import { motion, AnimatePresence } from 'framer-motion';
import { X, Save } from 'lucide-react';

export default function AdminFormModal({ open, title, onClose, onSubmit, submitting, children, size = 'md' }) {
  const widthCls = size === 'lg' ? 'max-w-2xl' : size === 'sm' ? 'max-w-sm' : 'max-w-lg';
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
            onSubmit={(e) => { e.preventDefault(); onSubmit(e); }}
            className={`w-full ${widthCls} max-h-[90vh] rounded-2xl bg-bg-surface border border-bg-border overflow-hidden flex flex-col`}
          >
            <header className="flex items-center justify-between p-5 border-b border-bg-border flex-shrink-0">
              <h2 className="font-display text-lg font-semibold">{title}</h2>
              <button type="button" onClick={onClose} className="text-white/50 hover:text-white">
                <X size={18} />
              </button>
            </header>
            <div className="p-5 space-y-4 overflow-y-auto">{children}</div>
            <footer className="p-4 border-t border-bg-border flex items-center justify-end gap-2 bg-bg-elevated/30 flex-shrink-0">
              <button type="button" onClick={onClose}
                className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-sm">
                Cancelar
              </button>
              <button type="submit" disabled={submitting}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-elite-violet to-elite-blue text-white font-medium hover:shadow-glow-violet transition disabled:opacity-50 text-sm">
                <Save size={14} /> {submitting ? 'Guardando…' : 'Guardar'}
              </button>
            </footer>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Field({ label, children, hint }) {
  return (
    <div>
      <label className="block text-xs text-white/60 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-white/40 mt-1">{hint}</p>}
    </div>
  );
}

export function Input({ ...props }) {
  return (
    <input
      {...props}
      className={`w-full px-3 py-2 rounded-lg bg-bg-elevated border border-bg-border text-sm placeholder:text-white/30 focus:outline-none focus:border-elite-violet/60 ${props.className || ''}`}
    />
  );
}

export function Textarea({ ...props }) {
  return (
    <textarea
      {...props}
      className={`w-full px-3 py-2 rounded-lg bg-bg-elevated border border-bg-border text-sm placeholder:text-white/30 focus:outline-none focus:border-elite-violet/60 resize-none ${props.className || ''}`}
    />
  );
}

export function Select({ children, ...props }) {
  return (
    <select
      {...props}
      className={`w-full px-3 py-2 rounded-lg bg-bg-elevated border border-bg-border text-sm focus:outline-none focus:border-elite-violet/60 ${props.className || ''}`}
    >
      {children}
    </select>
  );
}

export function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <button type="button" onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition ${checked ? 'bg-elite-violet' : 'bg-white/10'}`}>
        <span className={`absolute top-0.5 ${checked ? 'left-5' : 'left-0.5'} w-4 h-4 rounded-full bg-white transition-all`} />
      </button>
      <span className="text-sm text-white/80">{label}</span>
    </label>
  );
}
