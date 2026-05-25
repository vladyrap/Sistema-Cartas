import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { X, Sparkles, Package, Lock } from 'lucide-react';
import { api } from '../lib/api';
import { useLevelUp } from '../lib/useLevelUp';

export default function ReservationModal({ product, onClose, onCreated }) {
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { checkLevelUp } = useLevelUp();
  const max = Math.min(product?.stock ?? 1, product?.per_player_limit ?? 10, 10);

  useEffect(() => {
    setQuantity(1);
    setNote('');
  }, [product?.id]);

  if (!product) return null;

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { data } = await api.post('/reservations/me', {
        product_id: product.id,
        quantity,
        note: note || null,
      });
      toast.success('Reserva creada · esperando aprobación del admin');
      onCreated?.(data);
      onClose();
      checkLevelUp();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo crear la reserva');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {product && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.form
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
            className="w-full max-w-md rounded-2xl bg-bg-surface border border-bg-border overflow-hidden"
          >
            <header className="flex items-center justify-between p-5 border-b border-bg-border">
              <h2 className="font-display text-lg font-semibold flex items-center gap-2">
                <Sparkles size={16} className="text-elite-gold" /> Nueva reserva
              </h2>
              <button type="button" onClick={onClose} className="text-white/50 hover:text-white">
                <X size={18} />
              </button>
            </header>

            <div className="p-5 space-y-4">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-bg-elevated/60 border border-bg-border">
                <div className="w-12 h-12 rounded-md bg-bg-elevated flex items-center justify-center">
                  <Package size={18} className="text-white/40" />
                </div>
                <div className="flex-grow">
                  <p className="font-semibold text-sm">{product.name}</p>
                  <p className="text-xs text-white/50 mt-0.5">
                    ${product.price_clp.toLocaleString('es-CL')} CLP · {product.stock} en stock
                  </p>
                  {product.required_level > 1 && (
                    <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] px-2 py-0.5 rounded bg-elite-violet/10 text-elite-violet border border-elite-violet/20 font-mono">
                      <Lock size={10} /> Nivel {product.required_level}+
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs text-white/60 mb-1.5">Cantidad</label>
                <div className="flex items-center gap-2">
                  <button type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="w-10 h-10 rounded-lg bg-bg-elevated border border-bg-border hover:bg-white/5">−</button>
                  <input
                    type="number"
                    min={1}
                    max={max}
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, Math.min(max, parseInt(e.target.value) || 1)))}
                    className="w-20 text-center px-2 py-2 rounded-lg bg-bg-elevated border border-bg-border font-mono"
                  />
                  <button type="button"
                    onClick={() => setQuantity((q) => Math.min(max, q + 1))}
                    className="w-10 h-10 rounded-lg bg-bg-elevated border border-bg-border hover:bg-white/5">+</button>
                  <span className="text-xs text-white/40 ml-2">máx {max}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs text-white/60 mb-1.5">Nota para el admin (opcional)</label>
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ej: paso a buscar el sábado"
                  className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-bg-border text-sm placeholder:text-white/30 focus:outline-none focus:border-elite-violet/60 resize-none"
                />
              </div>

              <div className="p-3 rounded-lg bg-elite-violet/5 border border-elite-violet/20 text-xs text-white/70 leading-relaxed">
                Tu reserva queda PENDIENTE hasta que el admin la apruebe. Si no se paga en 72 hrs, se libera el stock.
              </div>
            </div>

            <footer className="p-5 border-t border-bg-border flex items-center justify-between gap-3 bg-bg-elevated/30">
              <p className="font-mono text-sm">
                Total: <span className="font-bold">${(product.price_clp * quantity).toLocaleString('es-CL')}</span>
              </p>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-elite-violet to-elite-blue text-white font-semibold hover:shadow-glow-violet transition disabled:opacity-50"
              >
                {submitting ? 'Reservando…' : 'Confirmar reserva'}
              </button>
            </footer>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
