import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Calendar, Sparkles, Trophy, Zap, Shield, LogIn } from 'lucide-react';

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
};

export default function Landing() {
  return (
    <div className="min-h-screen bg-bg text-white overflow-x-hidden">
      {/* Top bar */}
      <header className="absolute top-0 inset-x-0 z-30">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-elite-violet to-elite-blue flex items-center justify-center">
              <Sparkles size={14} className="text-white" />
            </div>
            <span className="font-display font-bold tracking-tight">EliteCards</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm text-white/80 hover:text-white hover:bg-white/5 border border-white/10 transition"
            >
              <LogIn size={14} /> Iniciar sesión
            </Link>
            <Link
              to="/register"
              className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-elite-violet to-elite-blue text-white hover:shadow-glow-violet transition"
            >
              Crear Elite ID
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center px-6 py-16">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(124,92,255,0.18),transparent_60%)] pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(77,163,255,0.12),transparent_60%)] pointer-events-none" />

        <div className="relative max-w-5xl text-center">
          <motion.div {...fadeUp} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 mb-8">
            <Sparkles size={14} className="text-elite-gold" />
            <span className="text-xs tracking-widest uppercase text-white/70">EliteCards · Ruta del Campeón</span>
          </motion.div>

          <motion.h1
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.1 }}
            className="font-display font-extrabold text-5xl md:text-7xl leading-[1.05] tracking-tight"
          >
            Juega. Sube de nivel.
            <br />
            <span className="bg-gradient-to-r from-elite-violet via-elite-blue to-elite-magenta bg-clip-text text-transparent">
              Conviértete en campeón.
            </span>
          </motion.h1>

          <motion.p {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.2 }} className="text-lg md:text-xl text-white/70 mt-6 max-w-2xl mx-auto leading-relaxed">
            La plataforma TCG donde tu progreso vale. Torneos, ranking, niveles, prestigio y
            beneficios reales — todo en una sola Ruta del Campeón.
          </motion.p>

          <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.3 }} className="flex flex-col sm:flex-row gap-4 justify-center mt-10">
            <Link
              to="/register"
              className="group inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-gradient-to-r from-elite-violet to-elite-blue text-white font-semibold hover:shadow-glow-violet transition"
            >
              Crear mi Elite ID
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              to="/events"
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-white/5 border border-white/10 text-white font-semibold hover:bg-white/10 transition"
            >
              <Calendar size={18} /> Ver próximos eventos
            </Link>
          </motion.div>

          <motion.p {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.4 }} className="text-sm text-white/50 mt-5">
            ¿Ya tienes Elite ID?{' '}
            <Link to="/login" className="text-elite-blue hover:text-white underline underline-offset-4">
              Inicia sesión
            </Link>
          </motion.p>

          <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {[
              { icon: Trophy, label: 'Ranking competitivo' },
              { icon: Zap, label: 'EXP Elite y prestigio' },
              { icon: Shield, label: 'Hall of Fame eterno' },
              { icon: Sparkles, label: 'Beneficios reales' },
            ].map(({ icon: Icon, label }, i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.4 + i * 0.08 }}
                className="p-4 rounded-xl bg-bg-surface border border-bg-border flex items-center gap-3"
              >
                <Icon size={18} className="text-elite-violet" />
                <span className="text-xs text-white/70">{label}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* TODO(fase-2): Ruta del Campeón visual / EXP grid / próximos torneos / catálogo Pro / Hall of Fame / Footer */}
      <section className="border-t border-white/5 py-20 px-6 text-center">
        <p className="font-mono text-sm text-white/40">
          Más secciones en construcción — Ruta del Campeón · Rankings · Catálogo · Hall of Fame
        </p>
      </section>
    </div>
  );
}
