import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Palette, Check } from 'lucide-react';
import { THEMES, useTheme } from '../lib/useTheme';

export default function ThemePicker() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const current = THEMES.find((t) => t.id === theme) || THEMES[0];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title={`Tema: ${current.name}`}
        className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/5 transition relative"
        aria-label="Cambiar tema"
      >
        <Palette size={18} />
        <span
          className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-bg ring-1 ring-white/10"
          style={{ background: current.swatch[0] }}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-72 rounded-2xl bg-bg-surface border border-bg-border shadow-2xl overflow-hidden z-50"
          >
            <div className="px-4 py-2 border-b border-bg-border flex items-center gap-2">
              <Palette size={12} className="text-elite-violet" />
              <p className="text-[10px] tracking-widest uppercase text-white/40">Temas visuales</p>
            </div>
            <ul className="max-h-96 overflow-y-auto">
              {THEMES.map((t) => {
                const active = t.id === theme;
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => { setTheme(t.id); setOpen(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] text-left transition ${active ? 'bg-elite-violet/10' : ''}`}
                    >
                      {/* Mini swatch trio */}
                      <div className="flex flex-col gap-0.5 flex-shrink-0">
                        <div className="flex gap-0.5">
                          <span className="w-3 h-3 rounded-sm" style={{ background: t.swatch[0] }} />
                          <span className="w-3 h-3 rounded-sm" style={{ background: t.swatch[1] }} />
                        </div>
                        <div className="flex gap-0.5">
                          <span className="w-3 h-3 rounded-sm" style={{ background: t.swatch[2] }} />
                          <span className="w-3 h-3 rounded-sm bg-white/5" />
                        </div>
                      </div>
                      <div className="flex-grow min-w-0">
                        <p className="text-sm font-semibold leading-tight">{t.name}</p>
                        <p className="text-[10px] text-white/40 mt-0.5 leading-snug">{t.description}</p>
                      </div>
                      {active && <Check size={14} className="text-elite-violet flex-shrink-0" />}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="px-4 py-2 border-t border-bg-border bg-bg-elevated/40">
              <p className="text-[9px] text-white/30">El tema se guarda en este navegador.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
