import { motion } from 'framer-motion';
import { Lock, Sparkles, Crown, Zap, Package } from 'lucide-react';

const ACCESS_META = {
  NORMAL: { label: 'Normal', cls: 'bg-white/5 text-white/60 border-white/10', icon: Package },
  ELITE_ACCESS: { label: 'Elite Access', cls: 'bg-elite-blue/10 text-elite-blue border-elite-blue/30', icon: Sparkles },
  ELITE_PRO: { label: 'Elite Pro', cls: 'bg-elite-gold/10 text-elite-gold border-elite-gold/40', icon: Crown },
};

export default function ProductCard({ product, eligibility, onReserve }) {
  const access = ACCESS_META[product.access] || ACCESS_META.NORMAL;
  const AccessIcon = access.icon;
  const canReserve = eligibility?.can_reserve ?? true;
  const reason = eligibility?.reason;
  const lowStock = product.stock > 0 && product.stock <= 5;
  const outOfStock = product.stock <= 0;

  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.4 }}
      className="group relative rounded-2xl overflow-hidden bg-bg-surface border border-bg-border hover:border-elite-violet/40 transition flex flex-col"
    >
      {product.access === 'ELITE_PRO' && (
        <div className="absolute top-3 right-3 z-10 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-elite-gold/15 text-elite-gold border border-elite-gold/40 font-semibold">
          <Crown size={10} /> PRO
        </div>
      )}
      {product.is_preorder && (
        <div className="absolute top-3 left-3 z-10 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-elite-violet/15 text-elite-violet border border-elite-violet/40 font-semibold">
          <Zap size={10} /> PREVENTA
        </div>
      )}

      <div className="aspect-[4/3] bg-gradient-to-br from-bg-elevated via-bg-surface to-black relative flex items-center justify-center">
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <Package size={40} className="text-white/15" />
        )}
        {outOfStock && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <span className="text-rose-300 font-semibold text-sm">Sin stock</span>
          </div>
        )}
      </div>

      <div className="p-4 flex flex-col gap-3 flex-grow">
        <div>
          <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md border ${access.cls}`}>
            <AccessIcon size={10} /> {access.label}
          </span>
          {product.category && (
            <span className="ml-1.5 text-[10px] text-white/40 uppercase tracking-wider">{product.category}</span>
          )}
        </div>
        <h3 className="font-display text-base font-semibold leading-snug flex-grow">{product.name}</h3>

        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="font-mono text-lg font-bold">${product.price_clp.toLocaleString('es-CL')}</p>
            <p className="text-[10px] text-white/40">
              {outOfStock ? 'Sin stock' : lowStock ? `Solo ${product.stock} unidades` : `${product.stock} en stock`}
            </p>
          </div>
          {product.required_level > 1 && (
            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-elite-violet/10 text-elite-violet border border-elite-violet/20 font-mono">
              <Lock size={10} /> N{product.required_level}+
            </span>
          )}
        </div>

        <button
          onClick={() => canReserve && !outOfStock && onReserve?.(product)}
          disabled={!canReserve || outOfStock}
          title={reason || ''}
          className={`mt-1 w-full py-2 rounded-lg text-sm font-medium transition ${
            canReserve && !outOfStock
              ? 'bg-gradient-to-r from-elite-violet to-elite-blue text-white hover:shadow-glow-violet'
              : 'bg-white/5 text-white/40 cursor-not-allowed border border-white/5'
          }`}
        >
          {outOfStock ? 'Sin stock' : canReserve ? 'Reservar' : 'Bloqueado'}
        </button>
        {!canReserve && reason && !outOfStock && (
          <p className="text-[10px] text-white/40 leading-tight -mt-1">{reason}</p>
        )}
      </div>
    </motion.article>
  );
}
