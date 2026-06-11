import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ShoppingCart, ExternalLink, Heart, RefreshCw, Sparkles,
  TrendingUp, AlertCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';
import EmptyState from '../components/EmptyState';
import AuthGuard from '../components/AuthGuard';
import { api } from '../lib/api';

export default function ShopRadar() {
  return (
    <AuthGuard feature="Shop Radar" returnUrl="/shop-radar" accent="emerald">
      <ShopRadarContent />
    </AuthGuard>
  );
}

function ShopRadarContent() {
  const [liked, setLiked] = useState([]);
  const [prices, setPrices] = useState(null); // BatchLookupOut
  const [loading, setLoading] = useState(true);
  const [pricing, setPricing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/tinder/me/liked', { params: { limit: 50 } });
      setLiked(data);
      if (data.length > 0) {
        await refreshPrices(data.map((c) => c.card_name));
      }
    } catch (err) {
      toast.error('No se pudo cargar tu wishlist');
    } finally {
      setLoading(false);
    }
  };

  const refreshPrices = async (names) => {
    setPricing(true);
    try {
      const { data } = await api.post('/scanner/batch', { names });
      setPrices(data);
    } catch (err) {
      toast.error('No se pudieron consultar precios');
    } finally {
      setPricing(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <Navbar />
        <div className="max-w-4xl mx-auto px-6 py-20 text-center text-slate-400">
          Cargando wishlist…
        </div>
      </div>
    );
  }

  if (liked.length === 0) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <Navbar />
        <EmptyState
          icon={Heart}
          title="Wishlist vacía"
          description="Hacé swipe derecha en /tinder sobre cartas que te interesen. Acá vas a ver sus precios actualizados desde TCGPlayer."
          action={{ label: 'Ir a Cards Tinder', to: '/tinder' }}
          accent="rose"
        />
      </div>
    );
  }

  const itemsMap = new Map((prices?.items || []).map((i) => [i.name.toLowerCase(), i]));
  const allItems = liked.map((l) => ({
    ...l,
    pricing: itemsMap.get(l.card_name.toLowerCase()),
  }));

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-emerald-950/20 text-white">
      <Navbar />

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <ShoppingCart size={14} className="text-emerald-400" />
            <span className="text-[10px] uppercase tracking-[0.5em] text-emerald-300 font-bold">
              Shop Radar · TCGPlayer
            </span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter">
            Tu wishlist, precios en vivo.
          </h1>
          <p className="text-slate-400 mt-3 max-w-xl mx-auto">
            Las cartas que likeaste en Tinder con precio actualizado desde TCGPlayer
            (vía Scryfall Market Price) y total estimado en CLP.
          </p>
        </div>

        {/* Total */}
        {prices && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6"
          >
            <TotalCard label="Total USD" value={`US$${prices.total_usd.toFixed(2)}`} icon={TrendingUp} accent="emerald" />
            <TotalCard label="Total CLP" value={`$${prices.total_clp.toLocaleString('es-CL')}`} icon={ShoppingCart} accent="amber" />
            <TotalCard label="Tipo de cambio" value={`${prices.usd_clp_rate.toFixed(0)} CLP / USD`} icon={Sparkles} accent="violet" small />
          </motion.div>
        )}

        {/* Refresh */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-slate-400">
            {liked.length} cartas · {prices?.items?.filter((i) => i.found).length || 0} con precio
          </p>
          <button
            onClick={() => refreshPrices(liked.map((c) => c.card_name))}
            disabled={pricing}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/10 transition disabled:opacity-50"
          >
            <RefreshCw size={12} className={pricing ? 'animate-spin' : ''} />
            {pricing ? 'Refrescando…' : 'Refrescar precios'}
          </button>
        </div>

        {/* List */}
        <div className="space-y-2">
          {allItems.map((c, i) => (
            <CardRow key={`${c.card_name}-${i}`} card={c} />
          ))}
        </div>

        <p className="text-center text-xs text-slate-500 mt-8">
          Precios: TCGPlayer Market Price vía Scryfall · USD→CLP estimado, no incluye envío ni aduana.
        </p>
      </div>
    </div>
  );
}

function TotalCard({ label, value, icon: Icon, accent, small }) {
  const c = {
    emerald: 'from-emerald-700/30 to-cyan-800/20 ring-emerald-500/30 text-emerald-300',
    amber:   'from-amber-700/30 to-orange-800/20 ring-amber-500/30 text-amber-300',
    violet:  'from-violet-700/30 to-fuchsia-800/20 ring-violet-500/30 text-violet-300',
  }[accent];
  return (
    <div className={`rounded-2xl bg-gradient-to-br ${c.split(' ').slice(0, 2).join(' ')} ring-1 ${c.split(' ')[2]} p-5`}>
      <div className={`text-[10px] uppercase tracking-widest font-bold mb-1 flex items-center gap-1.5 ${c.split(' ')[3]}`}>
        <Icon size={11} /> {label}
      </div>
      <div className={`font-black tabular-nums ${small ? 'text-xl' : 'text-3xl'}`}>{value}</div>
    </div>
  );
}

function CardRow({ card }) {
  const p = card.pricing;
  const hasPriceUSD = p?.price_usd != null && p.price_usd > 0;

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] ring-1 ring-white/10 hover:bg-white/[0.05] transition">
      {(p?.image_url || card.image_url) ? (
        <img
          src={p?.image_url || card.image_url}
          alt={card.card_name}
          className="w-12 h-16 sm:w-14 sm:h-20 rounded-lg ring-1 ring-white/10 object-cover shrink-0"
        />
      ) : (
        <div className="w-12 h-16 sm:w-14 sm:h-20 rounded-lg bg-slate-700 shrink-0" />
      )}

      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm truncate">{card.card_name}</div>
        <div className="text-[10px] text-slate-500 uppercase font-mono">
          {(p?.set_code || card.set_code || '?').toUpperCase()}
        </div>
        {!p?.found && p && (
          <div className="text-[10px] text-amber-400 mt-0.5 flex items-center gap-1">
            <AlertCircle size={9} /> Sin precio actual
          </div>
        )}
      </div>

      {/* Price column */}
      <div className="text-right shrink-0">
        {hasPriceUSD ? (
          <>
            <div className="text-lg font-black text-emerald-300 tabular-nums leading-tight">
              ${p.price_clp?.toLocaleString('es-CL')}
            </div>
            <div className="text-xs text-slate-400 font-mono">
              US${p.price_usd.toFixed(2)}
            </div>
          </>
        ) : (
          <div className="text-xs text-slate-500 italic">—</div>
        )}
      </div>

      {/* Buy button */}
      {p?.tcgplayer_url && (
        <a
          href={p.tcgplayer_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 text-white text-xs font-bold uppercase tracking-widest hover:shadow-lg hover:shadow-orange-500/30 transition shrink-0"
          title="Comprar en TCGPlayer"
        >
          Buy <ExternalLink size={10} />
        </a>
      )}
    </div>
  );
}
