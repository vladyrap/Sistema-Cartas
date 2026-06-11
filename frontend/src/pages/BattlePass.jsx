import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Check, Sparkles, Zap, Gift, Star, Crown, Snowflake, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';
import AuthGuard from '../components/AuthGuard';
import { api } from '../lib/api';

export default function BattlePass() {
  return (
    <AuthGuard feature="el Battle Pass" returnUrl={window.location.pathname} accent="violet">
      <Inner />
    </AuthGuard>
  );
}

const KIND_ICON = {
  exp:         { icon: Zap,       color: 'text-amber-300' },
  exp_boost:   { icon: Sparkles,  color: 'text-violet-300' },
  freeze_days: { icon: Snowflake, color: 'text-cyan-300' },
  cosmetic:    { icon: Star,      color: 'text-fuchsia-300' },
  nothing:     { icon: Gift,      color: 'text-white/30' },
};

function Inner() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get('/api/battle-pass/active');
      setData(r.data);
    } catch (e) {
      // null state ok
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const claim = async (tier_number, track) => {
    setBusy(true);
    try {
      const r = await api.post('/api/battle-pass/claim', { tier_number, track });
      toast.success(`Reclamado: ${r.data.label || 'reward'}`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al reclamar');
    } finally { setBusy(false); }
  };

  const purchasePremium = async () => {
    setBusy(true);
    try {
      const r = await api.post('/api/battle-pass/premium/checkout');
      if (r.data.mock) {
        toast('MercadoPago en modo mock — pedile a un admin que te active premium', { icon: 'ℹ️', duration: 5000 });
      } else if (r.data.init_point) {
        window.location.href = r.data.init_point;  // redirect a MP checkout
      } else {
        toast.error('No se pudo crear el checkout');
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    } finally { setBusy(false); }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg text-white">
        <Navbar />
        <div className="pt-24 grid place-items-center"><Loader2 className="animate-spin text-violet-300" /></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-bg text-white">
        <Navbar />
        <div className="max-w-3xl mx-auto px-4 pt-24 text-center">
          <Gift className="mx-auto text-white/30 mb-3" size={48} />
          <h1 className="font-display text-3xl font-black mb-2">Sin Battle Pass activo</h1>
          <p className="text-white/50">Cuando un admin lance el pase de la temporada, aparecerá acá.</p>
        </div>
      </div>
    );
  }

  const bp = data.pass;
  const prog = data.my_progress;
  const tiers = data.tiers || [];
  const xpInTier = prog ? prog.bp_xp % bp.xp_per_tier : 0;
  const xpInTierPct = (xpInTier / bp.xp_per_tier) * 100;

  return (
    <div className="min-h-screen bg-bg text-white">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 pt-24 pb-16">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="relative rounded-3xl glass aurora-bg grain p-6 md:p-8 mb-6 overflow-hidden"
        >
          {bp.cover_image_url && (
            <div className="absolute inset-0 opacity-30 bg-cover bg-center blur-sm" style={{ backgroundImage: `url(${bp.cover_image_url})` }} />
          )}
          <div className="relative">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-violet-300 mb-1">
              <Sparkles size={14} /> Battle Pass
            </div>
            <h1 className="font-display text-4xl md:text-5xl font-black">
              {bp.name.split(' ').map((w, i, arr) =>
                i === arr.length - 1 ? <span key={i} className="text-gradient">{w}</span> : <span key={i}>{w} </span>
              )}
            </h1>
            <p className="text-white/60 text-sm mt-2 max-w-2xl">{bp.description || 'Subí tiers jugando matches, ganando torneos y haciendo duelos.'}</p>

            {prog && (
              <div className="mt-6 grid md:grid-cols-3 gap-4 items-center">
                <div className="md:col-span-2">
                  <div className="flex justify-between items-baseline mb-1">
                    <span className="text-xs uppercase tracking-wider text-white/50 font-bold">Tier {prog.current_tier} / {bp.max_tier}</span>
                    <span className="font-mono text-xs text-white/60">{xpInTier} / {bp.xp_per_tier} XP</span>
                  </div>
                  <div className="h-3 rounded-full bg-white/5 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }} animate={{ width: `${xpInTierPct}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                      className="h-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-amber-400"
                    />
                  </div>
                </div>
                <div>
                  {prog.is_premium ? (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-amber-500/30 to-fuchsia-500/30 border border-amber-400/40">
                      <Crown className="text-amber-300 glow-pulse" size={20} />
                      <div>
                        <div className="text-amber-200 font-bold text-sm">Premium activo</div>
                        <div className="text-[10px] text-white/50">Track premium desbloqueado</div>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={purchasePremium}
                      disabled={busy}
                      className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-fuchsia-500 text-white font-bold shadow-lg shadow-amber-500/30 disabled:opacity-40 text-sm flex items-center justify-center gap-2"
                    >
                      <Crown size={14} /> Premium · ${bp.premium_price_clp.toLocaleString('es-CL')} CLP
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* Tiers track */}
        <div className="rounded-2xl glass overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between sticky top-0 bg-bg-elevated/80 backdrop-blur z-10">
            <div className="text-xs uppercase tracking-wider text-white/60 font-bold">Tiers ({tiers.length})</div>
            <div className="flex items-center gap-3 text-[10px] text-white/40">
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-cyan-400" /> Free</span>
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-amber-400" /> Premium</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <div className="flex gap-3 p-4 min-w-fit">
              {tiers.map(t => (
                <TierColumn
                  key={t.tier_number}
                  tier={t}
                  unlocked={prog ? t.tier_number <= prog.current_tier : false}
                  isPremium={prog?.is_premium || false}
                  freeClaimed={prog?.free_claimed?.includes(t.tier_number) || false}
                  premiumClaimed={prog?.premium_claimed?.includes(t.tier_number) || false}
                  onClaim={claim}
                  busy={busy}
                />
              ))}
              {tiers.length === 0 && (
                <div className="px-12 py-20 text-center text-white/40 text-sm">
                  El admin aún no definió tiers para este pase.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TierColumn({ tier, unlocked, isPremium, freeClaimed, premiumClaimed, onClaim, busy }) {
  return (
    <div className={`w-36 shrink-0 flex flex-col gap-3 ${!unlocked ? 'opacity-50' : ''}`}>
      {/* Tier number */}
      <div className="text-center">
        <div className={`text-2xl font-display font-black ${
          unlocked ? 'text-gradient' : 'text-white/30'
        }`}>{tier.tier_number}</div>
        <div className="text-[10px] uppercase tracking-wider text-white/40">Tier</div>
      </div>
      {/* Free reward */}
      <RewardCard
        kind={tier.free_reward_kind}
        amount={tier.free_reward_amount}
        label={tier.free_reward_label}
        image={tier.free_reward_image_url}
        track="free"
        unlocked={unlocked}
        claimed={freeClaimed}
        onClaim={() => onClaim(tier.tier_number, 'free')}
        busy={busy}
      />
      {/* Premium reward */}
      <RewardCard
        kind={tier.premium_reward_kind}
        amount={tier.premium_reward_amount}
        label={tier.premium_reward_label}
        image={tier.premium_reward_image_url}
        track="premium"
        unlocked={unlocked && isPremium}
        unlockedNoPremium={unlocked && !isPremium}
        claimed={premiumClaimed}
        onClaim={() => onClaim(tier.tier_number, 'premium')}
        busy={busy}
      />
    </div>
  );
}

function RewardCard({ kind, amount, label, image, track, unlocked, unlockedNoPremium, claimed, onClaim, busy }) {
  const meta = KIND_ICON[kind] || KIND_ICON.nothing;
  const Icon = meta.icon;
  const trackColor = track === 'premium' ? 'amber' : 'cyan';

  if (!kind) {
    return (
      <div className={`aspect-square rounded-xl bg-white/5 border-2 border-dashed border-white/10 grid place-items-center`}>
        <Gift size={20} className="text-white/20" />
      </div>
    );
  }

  return (
    <motion.div
      whileHover={unlocked && !claimed ? { y: -2 } : {}}
      className={`relative aspect-square rounded-xl border-2 overflow-hidden grid place-items-center text-center p-2 ${
        claimed ? `bg-${trackColor}-500/10 border-${trackColor}-400/60` :
        unlocked ? `bg-bg-surface border-${trackColor}-400/50 cursor-pointer hover:border-${trackColor}-400` :
        'bg-bg-surface border-white/10'
      }`}
      onClick={() => unlocked && !claimed && !busy && onClaim()}
    >
      {image && <img src={image} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" />}
      <div className="relative z-10">
        <Icon size={20} className={`mx-auto mb-1 ${meta.color}`} />
        <div className={`text-[10px] font-bold ${meta.color} truncate`}>{label || kind}</div>
        {amount > 0 && <div className="text-xs font-mono font-bold text-white">{amount}</div>}
      </div>
      {claimed && (
        <div className="absolute inset-0 bg-emerald-500/30 grid place-items-center">
          <div className="w-7 h-7 rounded-full bg-emerald-400 grid place-items-center">
            <Check size={16} className="text-emerald-950" strokeWidth={3} />
          </div>
        </div>
      )}
      {!unlocked && !unlockedNoPremium && (
        <div className="absolute inset-0 bg-bg/70 grid place-items-center">
          <Lock size={16} className="text-white/40" />
        </div>
      )}
      {unlockedNoPremium && !claimed && (
        <div className="absolute inset-0 bg-amber-500/20 grid place-items-center">
          <Crown size={16} className="text-amber-300" />
        </div>
      )}
    </motion.div>
  );
}
