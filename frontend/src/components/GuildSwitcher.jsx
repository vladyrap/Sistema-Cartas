import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Check, ChevronDown, Plus, Crown, Sword, Hammer, Settings, Users as UsersIcon } from 'lucide-react';
import { useGuild } from '../lib/useGuild';

const ROLE_META = {
  GUILD_ADMIN: { label: 'Maestro', cls: 'text-elite-gold', Icon: Crown },
  ORGANIZER: { label: 'Organizador', cls: 'text-elite-blue', Icon: Hammer },
  JUDGE: { label: 'Juez', cls: 'text-elite-magenta', Icon: Sword },
  MEMBER: { label: 'Aventurero', cls: 'text-white/60', Icon: Shield },
};

export default function GuildSwitcher() {
  const { current, myGuilds, switchTo } = useGuild();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  if (myGuilds.length === 0) {
    return (
      <Link to="/guilds" className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-elite-violet/10 text-elite-violet border border-elite-violet/30 hover:bg-elite-violet/20 transition">
        <Plus size={12} /> Unirme a un Gremio
      </Link>
    );
  }

  const curMeta = ROLE_META[current?.role] || ROLE_META.MEMBER;
  const CurIcon = curMeta.Icon;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-white/5 border border-white/10 hover:bg-white/10 transition text-sm"
      >
        {current?.guild.logo_url ? (
          <img src={current.guild.logo_url} alt="" className="w-5 h-5 rounded object-cover" />
        ) : (
          <Shield size={14} className="text-elite-violet" />
        )}
        <span className="font-semibold max-w-[140px] truncate">{current?.guild.name || 'Selecciona…'}</span>
        <CurIcon size={11} className={curMeta.cls} />
        <ChevronDown size={12} className="text-white/40" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            className="absolute right-0 mt-2 w-72 rounded-2xl bg-bg-surface border border-bg-border shadow-2xl overflow-hidden z-50"
          >
            <div className="px-4 py-2 border-b border-bg-border">
              <p className="text-[10px] tracking-widest uppercase text-white/40">Mis Gremios</p>
            </div>
            <ul className="max-h-72 overflow-y-auto">
              {myGuilds.map((g) => {
                const meta = ROLE_META[g.role] || ROLE_META.MEMBER;
                const Icon = meta.Icon;
                const active = g.guild.id === current?.guild.id;
                return (
                  <li key={g.guild.id}>
                    <button
                      onClick={() => { switchTo(g.guild.id); setOpen(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03] text-left ${active ? 'bg-elite-violet/10' : ''}`}
                    >
                      {g.guild.logo_url ? (
                        <img src={g.guild.logo_url} alt="" className="w-7 h-7 rounded object-cover" />
                      ) : (
                        <div className="w-7 h-7 rounded bg-gradient-to-br from-elite-violet to-elite-blue flex items-center justify-center">
                          <Shield size={12} className="text-white" />
                        </div>
                      )}
                      <div className="flex-grow min-w-0">
                        <p className="text-sm font-semibold truncate">{g.guild.name}</p>
                        <p className={`text-[10px] ${meta.cls} flex items-center gap-1`}>
                          <Icon size={9} /> {meta.label} · {g.guild.member_count} miembros
                        </p>
                      </div>
                      {active && <Check size={14} className="text-elite-blue flex-shrink-0" />}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-bg-border">
              {current?.role === 'GUILD_ADMIN' && (
                <>
                  <Link to="/guild-admin/settings" onClick={() => setOpen(false)}
                    className="flex items-center gap-2 px-4 py-2.5 text-xs text-elite-gold hover:text-white hover:bg-white/[0.03]">
                    <Settings size={12} /> Ajustes del Gremio
                  </Link>
                  <Link to="/guild-admin/members" onClick={() => setOpen(false)}
                    className="flex items-center gap-2 px-4 py-2.5 text-xs text-elite-gold hover:text-white hover:bg-white/[0.03]">
                    <UsersIcon size={12} /> Gestionar miembros
                  </Link>
                </>
              )}
              <Link to="/guilds" onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-xs text-white/70 hover:text-white hover:bg-white/[0.03]">
                <Plus size={12} /> Explorar más Gremios
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
