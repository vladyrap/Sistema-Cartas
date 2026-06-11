import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Crown, CreditCard, Snowflake, ListOrdered, Percent, Swords, Gift, Loader2, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';
import AuthGuard from '../components/AuthGuard';
import { api } from '../lib/api';

export default function Membership() {
  return (
    <AuthGuard feature="la Membresía Elite" returnUrl={window.location.pathname} accent="amber">
      <Inner />
    </AuthGuard>
  );
}

function Inner() {
  const [data, setData] = useState(null);
  const [credits, setCredits] = useState(null);
  const [nemesis, setNemesis] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [m, c, n] = await Promise.all([
      api.get('/growth/membership/me').catch(() => ({ data: null })),
      api.get('/growth/credits/me').catch(() => ({ data: null })),
      api.get('/growth/nemesis/me').catch(() => ({ data: null })),
    ]);
    setData(m.data); setCredits(c.data); setNemesis(n.data);
  };
  useEffect(() => { load(); }, []);

  const checkout = async () => {
    setBusy(true);
    try {
      const r = await api.post('/growth/membership/checkout');
      if (r.data.mock) toast('MP en modo mock — pedile a un admin que active tu membresía', { icon: 'ℹ️', duration: 5000 });
      else if (r.data.init_point) window.location.href = r.data.init_point;
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
    finally { setBusy(false); }
  };

  if (!data) {
    return (
      <div className="min-h-screen bg-bg text-white">
        <Navbar />
        <div className="pt-24 grid place-items-center"><Loader2 className="animate-spin text-amber-300" /></div>
      </div>
    );
  }

  const benefits = [
    { icon: Percent, label: `${data.benefits.event_discount_pct}% de descuento en entradas a torneos` },
    { icon: ListOrdered, label: 'Prioridad en listas de espera — entrás primero' },
    { icon: Snowflake, label: 'Freeze de rating sin tope (hasta 365 días)' },
    { icon: Crown, label: 'Badge Elite en tu perfil y standings' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-amber-950/10 to-slate-950 text-white">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 pt-24 pb-16 space-y-6">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl glass aurora-bg grain p-8 relative overflow-hidden">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-amber-300 mb-1">
            <Crown size={14} /> Membresía Elite
          </div>
          <h1 className="font-display text-4xl font-black mb-2">
            {data.is_member ? <>Sos <span className="text-gradient-gold">Elite</span> ⭐</> : <>Hacete <span className="text-gradient-gold">Elite</span></>}
          </h1>
          {data.is_member ? (
            <p className="text-white/70 text-sm flex items-center gap-2">
              <Calendar size={14} className="text-amber-300" />
              Vigente hasta <strong>{new Date(data.paid_until).toLocaleDateString('es-CL', { dateStyle: 'long' })}</strong>
              <span className="text-white/40">· {data.total_payments} pago(s)</span>
            </p>
          ) : (
            <p className="text-white/60 text-sm max-w-lg">
              30 días de beneficios por ${data.price_clp.toLocaleString('es-CL')} CLP. Cada pago extiende tu vigencia.
            </p>
          )}
          <ul className="mt-5 space-y-2.5">
            {benefits.map((b, i) => (
              <li key={i} className="flex items-center gap-3 text-sm">
                <span className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-400/30 grid place-items-center text-amber-300 shrink-0">
                  <b.icon size={14} />
                </span>
                {b.label}
              </li>
            ))}
          </ul>
          <button onClick={checkout} disabled={busy}
            className="mt-6 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-black shadow-lg shadow-amber-500/30 hover:scale-[1.02] transition disabled:opacity-50">
            {busy ? 'Abriendo…' : data.is_member
              ? `Extender 30 días — $${data.price_clp.toLocaleString('es-CL')}`
              : `Activar membresía — $${data.price_clp.toLocaleString('es-CL')}`}
          </button>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-4">
          {/* Crédito de tienda */}
          <div className="rounded-2xl glass p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-emerald-300 font-bold mb-2">
              <CreditCard size={12} /> Crédito de tienda
            </div>
            <div className="font-display text-3xl font-black font-mono">
              ${(credits?.balance_clp || 0).toLocaleString('es-CL')}
            </div>
            <p className="text-[11px] text-white/40 mt-1 mb-3">Canjeable en la tienda — premios de torneo y cupones.</p>
            <div className="space-y-1.5 max-h-44 overflow-y-auto">
              {(credits?.ledger || []).map((l, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-white/60 truncate mr-2">{l.reason}</span>
                  <span className={`font-mono shrink-0 ${l.amount_clp > 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {l.amount_clp > 0 ? '+' : ''}{l.amount_clp.toLocaleString('es-CL')}
                  </span>
                </div>
              ))}
              {!credits?.ledger?.length && <div className="text-xs text-white/30">Sin movimientos todavía.</div>}
            </div>
          </div>

          {/* Némesis */}
          <div className="rounded-2xl glass p-5 border border-rose-400/20">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-rose-300 font-bold mb-2">
              <Swords size={12} /> Tu archienemigo
            </div>
            {nemesis ? (
              <>
                <div className="font-display text-2xl font-black">{nemesis.nemesis_alias}</div>
                <p className="text-[11px] text-white/40 mt-1 mb-3">EXP doble cada vez que lo enfrentás esta temporada.</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-emerald-500/10 p-2">
                    <div className="font-mono font-black text-emerald-300 text-xl">{nemesis.my_wins}</div>
                    <div className="text-[9px] uppercase text-white/40">Tus W</div>
                  </div>
                  <div className="rounded-lg bg-white/5 p-2">
                    <div className="font-mono font-black text-white/60 text-xl">{nemesis.draws}</div>
                    <div className="text-[9px] uppercase text-white/40">Draws</div>
                  </div>
                  <div className="rounded-lg bg-rose-500/10 p-2">
                    <div className="font-mono font-black text-rose-300 text-xl">{nemesis.their_wins}</div>
                    <div className="text-[9px] uppercase text-white/40">Sus W</div>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-white/50">
                Sin némesis asignado todavía — se sortea al activar la temporada entre jugadores activos.
              </p>
            )}
          </div>
        </div>

        <a href="/loot" className="block rounded-2xl glass p-5 border border-fuchsia-400/20 hover:border-fuchsia-400/50 card-lift">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-fuchsia-500/15 grid place-items-center text-fuchsia-300"><Gift size={18} /></span>
            <div>
              <div className="font-bold">Botín físico</div>
              <div className="text-xs text-white/50">Tus achievements desbloquean premios reales en la tienda →</div>
            </div>
          </div>
        </a>

        <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-xs text-white/50 flex items-center gap-2">
          📅 Agregá los torneos a tu calendario:{' '}
          <code className="text-cyan-300 select-all">{window.location.origin}/api/growth/calendar.ics</code>
        </div>
      </div>
    </div>
  );
}
