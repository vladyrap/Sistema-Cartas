// Mapeo de action → metadata para presentar en el feed.
import {
  Trophy, Sparkles, Award, Calendar, Package, Zap,
  UserPlus, UserMinus, Crown, Settings, Activity,
} from 'lucide-react';

const META = {
  // Seasons
  'season.create':    { Icon: Trophy,   color: 'text-elite-violet', verb: 'creó la temporada' },
  'season.activate':  { Icon: Trophy,   color: 'text-elite-gold',   verb: 'activó la temporada' },
  'season.close':     { Icon: Trophy,   color: 'text-white/60',     verb: 'cerró la temporada' },
  // EXP
  'exp.adjust':       { Icon: Sparkles, color: 'text-elite-blue',   verb: 'ajustó EXP a' },
  // Events
  'event.create':     { Icon: Calendar, color: 'text-elite-blue',   verb: 'creó el evento' },
  'event.update':     { Icon: Calendar, color: 'text-white/60',     verb: 'actualizó el evento' },
  'event.delete':     { Icon: Calendar, color: 'text-rose-400',     verb: 'eliminó el evento' },
  'event.results':    { Icon: Calendar, color: 'text-elite-gold',   verb: 'registró resultados de' },
  'event.award_exp':  { Icon: Sparkles, color: 'text-elite-gold',   verb: 'otorgó EXP del evento' },
  // Products
  'product.create':   { Icon: Package,  color: 'text-elite-gold',   verb: 'creó el producto' },
  'product.update':   { Icon: Package,  color: 'text-white/60',     verb: 'actualizó el producto' },
  'product.delete':   { Icon: Package,  color: 'text-rose-400',     verb: 'eliminó el producto' },
  // Missions
  'mission.create':   { Icon: Zap,      color: 'text-elite-blue',   verb: 'creó la misión' },
  'mission.update':   { Icon: Zap,      color: 'text-white/60',     verb: 'actualizó la misión' },
  'mission.delete':   { Icon: Zap,      color: 'text-rose-400',     verb: 'eliminó la misión' },
  // Achievements
  'achievement.create': { Icon: Award,  color: 'text-elite-magenta',verb: 'creó la medalla' },
  'achievement.update': { Icon: Award,  color: 'text-white/60',     verb: 'actualizó la medalla' },
  'achievement.delete': { Icon: Award,  color: 'text-rose-400',     verb: 'eliminó la medalla' },
  // Members
  'member.role_changed': { Icon: Crown, color: 'text-elite-gold',   verb: 'cambió el rol de' },
  'member.removed':      { Icon: UserMinus, color: 'text-rose-400', verb: 'removió del Gremio a' },
  // Join requests
  'join_request.approved': { Icon: UserPlus, color: 'text-emerald-400', verb: 'aprobó la solicitud de' },
  'join_request.rejected': { Icon: UserPlus, color: 'text-rose-400',    verb: 'rechazó la solicitud de' },
  // Guild
  'guild.settings_updated': { Icon: Settings, color: 'text-elite-violet', verb: 'actualizó los ajustes del Gremio' },
};

export function describeAction(entry) {
  const m = META[entry.action] || { Icon: Activity, color: 'text-white/40', verb: entry.action };
  return m;
}

export function formatPayload(entry) {
  if (!entry.payload) return null;
  try {
    const p = JSON.parse(entry.payload);
    if (p.name) return p.name;
    if (p.from && p.to) return `${p.from} → ${p.to}`;
    if (p.amount !== undefined) return `${p.amount > 0 ? '+' : ''}${p.amount} EXP`;
    if (p.fields) return `[${p.fields.join(', ')}]`;
    return null;
  } catch {
    return entry.payload;
  }
}
