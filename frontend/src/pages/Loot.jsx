import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Gift, Check, Clock, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';
import AuthGuard from '../components/AuthGuard';
import { api } from '../lib/api';

export default function Loot() {
  return (
    <AuthGuard feature="el botín físico" returnUrl={window.location.pathname} accent="fuchsia">
      <Inner />
    </AuthGuard>
  );
}

function Inner() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const r = await api.get('/growth/loot/me').catch(() => ({ data: { claimable: [], claimed: [] } }));
    setData(r.data);
  };
  useEffect(() => { load(); }, []);

  const claim = async (key, label) => {
    setBusy(true);
    try {
      const r = await api.post(`/growth/loot/claim?achievement_key=${encodeURIComponent(key)}`);
      toast.success(r.data.message || `Canjeaste: ${label}`);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
    finally { setBusy(false); }
  };

  if (!data) {
    return (
      <div className="min-h-screen bg-bg text-white">
        <Navbar />
        <div className="pt-24 grid place-items-center"><Loader2 className="animate-spin text-fuchsia-300" /></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-fuchsia-950/10 to-slate-950 text-white">
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 pt-24 pb-16 space-y-6">
        <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-fuchsia-300 mb-1">
            <Gift size={14} /> Botín físico
          </div>
          <h1 className="font-display text-3xl font-black">Tus logros, premios reales</h1>
          <p className="text-white/50 text-sm mt-1">Achievements legendarios canjean sleeves, dados y sobres en la tienda.</p>
        </motion.header>

        <section>
          <h2 className="text-sm font-bold text-fuchsia-200 mb-3">Canjeable ahora ({data.claimable.length})</h2>
          <div className="space-y-3">
            {data.claimable.map(item => (
              <div key={item.achievement_key} className="rounded-2xl glass border border-fuchsia-400/30 p-4 flex items-center justify-between gap-3">
                <div>
                  <div className="font-bold">{item.label}</div>
                  <div className="text-xs text-white/50">{item.description || `Desbloqueado por: ${item.achievement_key}`}</div>
                </div>
                <button onClick={() => claim(item.achievement_key, item.label)} disabled={busy}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-500 text-white font-bold text-sm shrink-0 disabled:opacity-50">
                  Canjear 🎁
                </button>
              </div>
            ))}
            {!data.claimable.length && (
              <div className="rounded-2xl glass p-8 text-center text-white/40 text-sm">
                Sin botín canjeable. Ganá achievements en torneos para desbloquear premios.
              </div>
            )}
          </div>
        </section>

        {data.claimed.length > 0 && (
          <section>
            <h2 className="text-sm font-bold text-white/50 mb-3">Historial</h2>
            <div className="space-y-2">
              {data.claimed.map(item => (
                <div key={item.achievement_key} className="rounded-xl bg-white/5 p-3 flex items-center justify-between text-sm">
                  <span>{item.label}</span>
                  {item.status === 'DELIVERED' ? (
                    <span className="flex items-center gap-1 text-emerald-300 text-xs font-bold"><Check size={12} /> Entregado</span>
                  ) : (
                    <span className="flex items-center gap-1 text-amber-300 text-xs font-bold"><Clock size={12} /> Retiralo en tienda</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
