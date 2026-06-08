/** Trade Simulator — mesa partida 50/50, drag & drop entre lados,
 * value calculator USD en vivo, balance indicator. */
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import {
  ArrowLeft, ArrowLeftRight, Sparkles, DollarSign, Scale, X,
  TrendingUp, TrendingDown, Equal, Plus,
} from 'lucide-react';
import clsx from 'clsx';

import { api } from '../lib/api';

export default function TradeSimulator() {
  const [params] = useSearchParams();
  const myDeckId = Number(params.get('me') || 1);
  const peerDeckId = Number(params.get('peer') || 2);

  const [myCards, setMyCards] = useState([]);
  const [peerCards, setPeerCards] = useState([]);
  const [myStack, setMyStack] = useState([]);   // cartas que YO ofrezco
  const [peerStack, setPeerStack] = useState([]); // cartas que el otro ofrece
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get(`/tcg/decks/${myDeckId}/enrich`).catch(() => ({ data: { main: [] } })),
      api.get(`/tcg/decks/${peerDeckId}/enrich`).catch(() => ({ data: { main: [] } })),
    ]).then(([m, p]) => {
      setMyCards((m.data.main || []).filter(c => c.meta?.image_url));
      setPeerCards((p.data.main || []).filter(c => c.meta?.image_url));
      setLoading(false);
    });
  }, [myDeckId, peerDeckId]);

  function offer(card, side, isMine) {
    const id = Math.random().toString(36).slice(2);
    const item = { ...card, _id: id };
    if (isMine) setMyStack(s => [...s, item]);
    else setPeerStack(s => [...s, item]);
  }
  function withdraw(_id, isMine) {
    if (isMine) setMyStack(s => s.filter(c => c._id !== _id));
    else setPeerStack(s => s.filter(c => c._id !== _id));
  }
  function reset() {
    setMyStack([]);
    setPeerStack([]);
  }

  const myValue = myStack.reduce((a, c) => a + (c.meta?.prices_usd || 0) * (c.qty || 1), 0);
  const peerValue = peerStack.reduce((a, c) => a + (c.meta?.prices_usd || 0) * (c.qty || 1), 0);
  const diff = Math.abs(myValue - peerValue);
  const balance = diff < Math.max(myValue, peerValue) * 0.05
    ? 'even' : myValue > peerValue ? 'mine_higher' : 'peer_higher';

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-amber-950/40 via-slate-950 to-violet-950/30 text-white overflow-hidden">
      {/* Wood texture-ish bg */}
      <div className="absolute inset-0 opacity-10 pointer-events-none"
           style={{
             backgroundImage:
               'repeating-linear-gradient(90deg, rgba(180,83,9,0.3) 0px, rgba(180,83,9,0.3) 2px, transparent 2px, transparent 60px)',
           }} />

      {/* HUD top */}
      <div className="absolute top-0 left-0 right-0 z-30 px-6 py-4 flex items-center justify-between">
        <Link to="/decks" className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5">
          <ArrowLeft size={12} /> Volver
        </Link>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/15 border border-violet-500/30">
            <ArrowLeftRight size={12} className="text-violet-300" />
            <span className="text-[10px] uppercase tracking-[0.4em] text-violet-200 font-bold">TRADE_BENCH</span>
          </span>
          <button onClick={reset} className="text-[10px] uppercase tracking-widest text-rose-300 hover:text-white">
            Reset
          </button>
        </div>
      </div>

      {/* MAIN: dos lados */}
      <div className="absolute inset-0 grid grid-cols-2 pt-16 pb-32">
        <TradeSide
          title="OFRECES"
          color="violet"
          stack={myStack}
          inventory={myCards}
          onOffer={(c) => offer(c, 'me', true)}
          onWithdraw={(id) => withdraw(id, true)}
          value={myValue}
          loading={loading}
        />
        <TradeSide
          title="RECIBES"
          color="amber"
          stack={peerStack}
          inventory={peerCards}
          onOffer={(c) => offer(c, 'peer', false)}
          onWithdraw={(id) => withdraw(id, false)}
          value={peerValue}
          loading={loading}
        />
      </div>

      {/* Divisor central con scale */}
      <div className="absolute top-16 bottom-32 left-1/2 -translate-x-1/2 w-px bg-gradient-to-b from-transparent via-violet-400/40 to-transparent pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none">
        <motion.div
          animate={{ rotate: balance === 'mine_higher' ? -12 : balance === 'peer_higher' ? 12 : 0 }}
          transition={{ type: 'spring', stiffness: 80, damping: 14 }}
          className="relative w-32 h-32"
        >
          <Scale size={120} className={clsx(
            "absolute inset-0",
            balance === 'even' ? "text-emerald-400" :
            balance === 'mine_higher' ? "text-violet-300" : "text-amber-300"
          )} />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className={clsx(
              "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest backdrop-blur",
              balance === 'even' ? "bg-emerald-500/30 text-emerald-100" :
              balance === 'mine_higher' ? "bg-violet-500/30 text-violet-100" : "bg-amber-500/30 text-amber-100"
            )}>
              {balance === 'even' ? 'JUSTO' : balance === 'mine_higher' ? 'TÚ +' : 'EL OTRO +'}
            </div>
          </div>
        </motion.div>
      </div>

      {/* HUD bottom */}
      <div className="absolute bottom-0 left-0 right-0 z-30 px-6 pb-6">
        <div className="rounded-2xl bg-black/70 backdrop-blur-xl border border-violet-500/20 px-4 py-3 flex items-center justify-between max-w-5xl mx-auto">
          <ValueDisplay
            label="OFRECES" value={myValue} color="violet"
            count={myStack.length}
            opposing={peerValue}
          />
          <div className="text-center">
            <div className="text-[9px] uppercase tracking-[0.4em] text-slate-500 font-bold">DIFERENCIA</div>
            <div className={clsx(
              "text-2xl font-black tabular-nums",
              balance === 'even' ? "text-emerald-400" :
              "text-amber-300"
            )}>
              {balance === 'even' ? '~ $0' : `$${diff.toFixed(2)}`}
            </div>
          </div>
          <ValueDisplay
            label="RECIBES" value={peerValue} color="amber"
            count={peerStack.length}
            opposing={myValue}
            reverse
          />
        </div>
      </div>
    </div>
  );
}

function TradeSide({ title, color, stack, inventory, onOffer, onWithdraw, value, loading }) {
  const [picker, setPicker] = useState(false);
  const c = {
    violet: { border: 'border-violet-500/30', text: 'text-violet-300', bg: 'bg-violet-500/5' },
    amber:  { border: 'border-amber-500/30',  text: 'text-amber-300',  bg: 'bg-amber-500/5' },
  }[color];
  return (
    <div className={clsx("relative p-6 border-x", c.border, c.bg)}>
      <div className="flex items-center justify-between mb-3">
        <div className={clsx("text-[10px] uppercase tracking-[0.4em] font-bold", c.text)}>
          // {title}
        </div>
        <button
          onClick={() => setPicker(p => !p)}
          className={clsx(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] uppercase tracking-widest font-bold",
            "border", c.border, c.text, "hover:bg-white/5 transition"
          )}
        >
          <Plus size={11} /> Agregar
        </button>
      </div>

      {/* Picker */}
      <AnimatePresence>
        {picker && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-3"
          >
            <div className="grid grid-cols-4 gap-2 max-h-48 overflow-auto p-2 bg-black/40 rounded-xl border border-white/5">
              {loading && <div className="col-span-4 text-center text-xs text-slate-500 py-4">Cargando…</div>}
              {!loading && inventory.length === 0 && (
                <div className="col-span-4 text-center text-xs text-slate-500 py-4">Sin cartas con imagen</div>
              )}
              {inventory.map((card, i) => (
                <button
                  key={`${card.name}-${i}`}
                  onClick={() => { onOffer(card); setPicker(false); }}
                  className="group relative aspect-[63/88] rounded overflow-hidden hover:ring-2 hover:ring-violet-400 transition"
                >
                  <img src={card.meta.image_url} alt={card.name} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition flex items-end p-1">
                    <span className="text-[8px] font-bold truncate text-white">{card.name}</span>
                  </div>
                  {card.meta.prices_usd != null && (
                    <span className="absolute top-0.5 right-0.5 px-1 py-0.5 rounded bg-black/80 text-[8px] font-mono text-emerald-300">
                      ${card.meta.prices_usd}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stack */}
      <div className="grid grid-cols-3 gap-3 max-h-[calc(100vh-280px)] overflow-auto">
        <AnimatePresence>
          {stack.map((card) => (
            <motion.div
              key={card._id}
              layout
              initial={{ opacity: 0, scale: 0.7, rotate: -8 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.5, y: 30 }}
              transition={{ type: 'spring', damping: 18 }}
              className="group relative aspect-[63/88] rounded-lg overflow-hidden shadow-xl shadow-black/40 border-2"
              style={{ borderColor: color === 'violet' ? 'rgba(167,139,250,0.4)' : 'rgba(251,191,36,0.4)' }}
            >
              <img src={card.meta?.image_url} alt={card.name} className="w-full h-full object-cover" />
              <button
                onClick={() => onWithdraw(card._id)}
                className="absolute top-1 right-1 p-1 rounded-full bg-black/80 opacity-0 group-hover:opacity-100 hover:bg-rose-500/80 transition"
              >
                <X size={10} className="text-rose-300" />
              </button>
              {card.meta?.prices_usd != null && (
                <div className="absolute bottom-0 left-0 right-0 bg-black/80 backdrop-blur px-1.5 py-0.5">
                  <div className="text-[10px] font-mono text-emerald-300 tabular-nums text-center">
                    ${card.meta.prices_usd}
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        {stack.length === 0 && (
          <div className="col-span-3 text-center py-12 text-xs text-slate-600 uppercase tracking-widest">
            Mesa vacía — agrega cartas
          </div>
        )}
      </div>
    </div>
  );
}

function ValueDisplay({ label, value, color, count, opposing, reverse }) {
  const c = color === 'violet' ? 'text-violet-300' : 'text-amber-300';
  return (
    <div className={clsx("flex items-center gap-3", reverse && "flex-row-reverse")}>
      <DollarSign size={18} className={c} />
      <div className={clsx("text-left", reverse && "text-right")}>
        <div className="text-[9px] uppercase tracking-[0.4em] text-slate-500 font-bold">{label}</div>
        <div className={clsx("text-2xl font-black tabular-nums", c)}>
          ${value.toFixed(2)}
        </div>
        <div className="text-[10px] text-slate-500 font-mono">
          {count} carta{count === 1 ? '' : 's'}
        </div>
      </div>
    </div>
  );
}
