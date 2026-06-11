import { useEffect, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ArrowLeft, Construction, Bell } from 'lucide-react';
import { fetchComingSoon, matchComingSoon } from '../lib/comingSoon';

/**
 * Envolvé `<Routes>` con este componente — si la ruta actual está marcada
 * como coming soon, se muestra el overlay full screen en lugar del contenido.
 */
export default function ComingSoonGate({ children }) {
  const location = useLocation();
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchComingSoon().then(list => {
      if (!alive) return;
      setItems(list);
      setLoaded(true);
    });
    return () => { alive = false; };
  }, []);

  // Refetch cuando cambia la ruta — TTL del cache evita pegarle al backend siempre
  useEffect(() => {
    fetchComingSoon().then(list => setItems(list));
  }, [location.pathname]);

  // Mientras no cargó la primera vez, mostramos el contenido normal — evitamos flash.
  // Si la ruta está marcada veremos el overlay apenas llegue la lista.
  if (!loaded) return children;

  const match = matchComingSoon(location.pathname, items);
  if (!match) return children;

  return <ComingSoonOverlay entry={match} />;
}


function ComingSoonOverlay({ entry }) {
  const hasImage = !!entry.image_url;
  return (
    <AnimatePresence>
      <motion.div
        key={entry.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
        className="min-h-screen bg-bg text-white relative overflow-hidden"
      >
        {/* Background: imagen TCG difuminada como hero o aurora si no hay */}
        {hasImage ? (
          <div
            className="absolute inset-0 bg-cover bg-center scale-110 blur-md opacity-40"
            style={{ backgroundImage: `url(${entry.image_url})` }}
            aria-hidden="true"
          />
        ) : (
          <div className="absolute inset-0 aurora-bg" aria-hidden="true" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-bg/50 via-bg/70 to-bg pointer-events-none" />
        <div className="absolute inset-0 grain pointer-events-none" />

        {/* Floating orbs ambient */}
        <div className="absolute top-20 left-[10%] w-72 h-72 rounded-full bg-elite-violet/20 blur-3xl float-y-slow pointer-events-none" />
        <div className="absolute bottom-32 right-[10%] w-80 h-80 rounded-full bg-elite-blue/15 blur-3xl float-y pointer-events-none" />

        <div className="relative min-h-screen flex items-center justify-center px-6 py-24">
          <div className="max-w-4xl w-full grid md:grid-cols-[1fr_1.2fr] gap-10 items-center">
            {/* Card art (si hay imagen) */}
            {hasImage && (
              <motion.div
                initial={{ opacity: 0, x: -20, rotateY: -15 }}
                animate={{ opacity: 1, x: 0, rotateY: 0 }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                className="relative"
              >
                <div className="absolute -inset-4 bg-gradient-to-br from-elite-violet/40 to-elite-blue/40 blur-2xl opacity-70" />
                <div className="relative rounded-2xl overflow-hidden ring-2 ring-elite-violet/50 shadow-2xl shadow-elite-violet/30 aspect-[3/4]">
                  <img
                    src={entry.image_url}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
                </div>
              </motion.div>
            )}

            {/* Texto */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.15 }}
              className={hasImage ? '' : 'md:col-span-2 text-center max-w-2xl mx-auto'}
            >
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass mb-4">
                <Construction size={12} className="text-elite-gold" />
                <span className="text-[10px] tracking-[0.3em] uppercase text-white/80 font-bold">
                  En construcción
                </span>
              </div>

              <h1 className="font-display text-4xl md:text-6xl font-black leading-[1.05] tracking-tight mb-4">
                {entry.title.split(/\s+/).map((word, i, arr) =>
                  i === arr.length - 1 ? (
                    <span key={i} className="text-gradient">{word}</span>
                  ) : (
                    <span key={i}>{word} </span>
                  )
                )}
              </h1>

              {entry.message && (
                <p className="text-lg text-white/70 leading-relaxed mb-6 max-w-xl">
                  {entry.message}
                </p>
              )}

              {entry.eta && (
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-elite-gold/10 border border-elite-gold/30 mb-6">
                  <Bell size={14} className="text-elite-gold" />
                  <span className="text-sm">
                    <span className="text-white/60">ETA:</span>{' '}
                    <span className="text-elite-gold font-semibold">{entry.eta}</span>
                  </span>
                </div>
              )}

              <div className={`flex gap-3 flex-wrap ${hasImage ? '' : 'justify-center'}`}>
                <Link
                  to="/"
                  className="group inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-elite-violet to-elite-blue text-white font-semibold shadow-lg shadow-elite-violet/30 hover:scale-[1.02] transition"
                >
                  <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
                  Volver al inicio
                </Link>
                <Link
                  to="/dashboard"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl glass-strong hover:border-elite-violet/40 text-white font-semibold transition"
                >
                  <Sparkles size={16} className="text-elite-gold" />
                  Mi Dashboard
                </Link>
              </div>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
