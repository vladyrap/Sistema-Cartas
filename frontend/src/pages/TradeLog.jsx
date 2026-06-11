import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeftRight, Plus, Check, X, Loader2, Scale } from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';
import AuthGuard from '../components/AuthGuard';
import { api } from '../lib/api';

export default function TradeLog() {
  return (
    <AuthGuard feature="el registro de trades" returnUrl={window.location.pathname} accent="cyan">
      <Inner />
    </AuthGuard>
  );
}

function Inner() {
  const [trades, setTrades] = useState([]);
  const [me, setMe] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ partner_player_id: '', items_mine: '', items_theirs: '', value_mine_clp: 0, value_theirs_clp: 0 });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [t, m] = await Promise.all([
      api.get('/growth/trades/me').catch(() => ({ data: [] })),
      api.get('/players/me').catch(() => ({ data: null })),
    ]);
    setTrades(t.data); setMe(m.data?.player);
  };
  useEffect(() => { load(); }, []);

  const propose = async () => {
    if (!form.partner_player_id || !form.items_mine || !form.items_theirs) { toast.error('Faltan campos'); return; }
    setBusy(true);
    try {
      await api.post('/growth/trades', {
        ...form,
        partner_player_id: parseInt(form.partner_player_id, 10),
        value_mine_clp: parseInt(form.value_mine_clp, 10) || 0,
        value_theirs_clp: parseInt(form.value_theirs_clp, 10) || 0,
      });
      toast.success('Trade propuesto — tu partner debe confirmarlo');
      setOpen(false);
      setForm({ partner_player_id: '', items_mine: '', items_theirs: '', value_mine_clp: 0, value_theirs_clp: 0 });
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
    finally { setBusy(false); }
  };

  const act = async (id, action) => {
    setBusy(true);
    try {
      await api.post(`/growth/trades/${id}/${action}`);
      toast.success(action === 'confirm' ? 'Trade confirmado ✓' : 'Rechazado');
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-cyan-950/10 to-slate-950 text-white">
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 pt-24 pb-16 space-y-6">
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-cyan-300 mb-1">
              <ArrowLeftRight size={14} /> Trade Log
            </div>
            <h1 className="font-display text-3xl font-black">Registro de intercambios</h1>
            <p className="text-white/50 text-sm mt-1">Historial con fairness check — protección para ambos lados.</p>
          </div>
          <button onClick={() => setOpen(true)}
            className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm flex items-center gap-1">
            <Plus size={14} /> Registrar trade
          </button>
        </div>

        {open && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl glass border border-cyan-400/30 p-5 space-y-3">
            <input value={form.partner_player_id} type="number"
              onChange={e => setForm({ ...form, partner_player_id: e.target.value })}
              placeholder="Player ID del partner"
              className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-sm" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-white/50 font-bold mb-1 block">Yo entrego</label>
                <textarea value={form.items_mine} onChange={e => setForm({ ...form, items_mine: e.target.value })}
                  rows={3} placeholder="2x Carta X foil…"
                  className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-xs resize-none" />
                <input type="number" value={form.value_mine_clp}
                  onChange={e => setForm({ ...form, value_mine_clp: e.target.value })}
                  placeholder="Valor CLP" className="w-full mt-1 px-3 py-1.5 rounded-lg bg-bg-surface border border-bg-border text-xs font-mono" />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-white/50 font-bold mb-1 block">Recibo</label>
                <textarea value={form.items_theirs} onChange={e => setForm({ ...form, items_theirs: e.target.value })}
                  rows={3} placeholder="1x Carta Y…"
                  className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-xs resize-none" />
                <input type="number" value={form.value_theirs_clp}
                  onChange={e => setForm({ ...form, value_theirs_clp: e.target.value })}
                  placeholder="Valor CLP" className="w-full mt-1 px-3 py-1.5 rounded-lg bg-bg-surface border border-bg-border text-xs font-mono" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="px-3 py-1.5 rounded-lg bg-white/5 text-sm">Cancelar</button>
              <button onClick={propose} disabled={busy}
                className="px-4 py-1.5 rounded-lg bg-cyan-500 text-slate-950 font-bold text-sm disabled:opacity-40">
                Proponer
              </button>
            </div>
            <p className="text-[10px] text-white/40">💡 Tip: usá el Scanner para sacar valores TCGPlayer→CLP de cada carta.</p>
          </motion.div>
        )}

        <div className="space-y-3">
          {trades.map(t => {
            const iAmB = me && t.player_b_id === me.id;
            const pending = t.status === 'PROPOSED';
            return (
              <div key={t.id} className={`rounded-2xl glass p-4 ${pending ? 'border border-amber-400/40' : ''}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-sm">
                    {t.player_a_alias} <ArrowLeftRight size={12} className="inline text-white/40 mx-1" /> {t.player_b_alias}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    t.status === 'CONFIRMED' ? 'bg-emerald-500/20 text-emerald-300' :
                    t.status === 'PROPOSED' ? 'bg-amber-500/20 text-amber-300' :
                    'bg-white/10 text-white/40'
                  }`}>{t.status}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-lg bg-bg-surface p-2.5">
                    <div className="text-white/40 mb-1">{t.player_a_alias} entrega · <span className="font-mono">${t.value_a_clp.toLocaleString('es-CL')}</span></div>
                    <div className="whitespace-pre-wrap text-white/80">{t.items_a}</div>
                  </div>
                  <div className="rounded-lg bg-bg-surface p-2.5">
                    <div className="text-white/40 mb-1">{t.player_b_alias} entrega · <span className="font-mono">${t.value_b_clp.toLocaleString('es-CL')}</span></div>
                    <div className="whitespace-pre-wrap text-white/80">{t.items_b}</div>
                  </div>
                </div>
                {t.fairness !== null && (
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <Scale size={12} className={t.fairness >= 0.8 ? 'text-emerald-300' : t.fairness >= 0.6 ? 'text-amber-300' : 'text-rose-300'} />
                    <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <div className={`h-full ${t.fairness >= 0.8 ? 'bg-emerald-400' : t.fairness >= 0.6 ? 'bg-amber-400' : 'bg-rose-400'}`}
                        style={{ width: `${t.fairness * 100}%` }} />
                    </div>
                    <span className="font-mono text-white/50">{(t.fairness * 100).toFixed(0)}% parejo</span>
                  </div>
                )}
                {pending && iAmB && (
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => act(t.id, 'confirm')} disabled={busy}
                      className="flex-1 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-40">
                      <Check size={12} /> Confirmar
                    </button>
                    <button onClick={() => act(t.id, 'reject')} disabled={busy}
                      className="flex-1 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-40">
                      <X size={12} /> Rechazar
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {!trades.length && (
            <div className="rounded-2xl glass p-10 text-center text-white/40 text-sm">
              Sin trades registrados. El registro protege a ambos: queda fecha, contenido y valor.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
