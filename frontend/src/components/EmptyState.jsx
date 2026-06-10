/** EmptyState — pantalla amigable cuando no hay datos. */
import { Link } from 'react-router-dom';
import { Inbox } from 'lucide-react';

/**
 * @param {object} props
 * @param {React.ComponentType} [props.icon=Inbox]   Ícono lucide.
 * @param {string} props.title                       Título principal.
 * @param {string} [props.description]               Texto explicativo.
 * @param {{ label: string, to?: string, onClick?: () => void }} [props.action]
 *        CTA opcional. Si `to` → Link; si `onClick` → button.
 * @param {string} [props.accent='violet']           violet|amber|cyan|rose|emerald|fuchsia
 * @param {string} [props.className]                 Clases extra al wrapper.
 */
const ACCENT = {
  violet:  { ring: 'ring-violet-500/30',  bg: 'bg-violet-500/10',  text: 'text-violet-300',  btn: 'from-violet-500 to-fuchsia-500' },
  amber:   { ring: 'ring-amber-500/30',   bg: 'bg-amber-500/10',   text: 'text-amber-300',   btn: 'from-amber-500 to-orange-500' },
  cyan:    { ring: 'ring-cyan-500/30',    bg: 'bg-cyan-500/10',    text: 'text-cyan-300',    btn: 'from-cyan-500 to-blue-500' },
  rose:    { ring: 'ring-rose-500/30',    bg: 'bg-rose-500/10',    text: 'text-rose-300',    btn: 'from-rose-500 to-fuchsia-500' },
  emerald: { ring: 'ring-emerald-500/30', bg: 'bg-emerald-500/10', text: 'text-emerald-300', btn: 'from-emerald-500 to-cyan-500' },
  fuchsia: { ring: 'ring-fuchsia-500/30', bg: 'bg-fuchsia-500/10', text: 'text-fuchsia-300', btn: 'from-fuchsia-500 to-violet-500' },
};

export default function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  accent = 'violet',
  className = '',
}) {
  const a = ACCENT[accent] || ACCENT.violet;

  return (
    <div className={`flex flex-col items-center justify-center text-center px-6 py-12 sm:py-16 ${className}`}>
      <div className={`w-16 h-16 rounded-2xl ${a.bg} ring-1 ${a.ring} flex items-center justify-center ${a.text} mb-5`}>
        <Icon size={28} />
      </div>
      <h3 className="text-xl sm:text-2xl font-black tracking-tight mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-slate-400 max-w-md mb-6 leading-relaxed">{description}</p>
      )}
      {action && (
        action.to ? (
          <Link
            to={action.to}
            className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r ${a.btn} text-white font-bold text-sm hover:shadow-lg transition`}
          >
            {action.label}
          </Link>
        ) : (
          <button
            onClick={action.onClick}
            className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r ${a.btn} text-white font-bold text-sm hover:shadow-lg transition`}
          >
            {action.label}
          </button>
        )
      )}
    </div>
  );
}
