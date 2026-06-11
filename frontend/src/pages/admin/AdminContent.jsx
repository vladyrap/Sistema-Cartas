import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Megaphone, Check, X, RefreshCw, Send, Copy, BarChart3,
  Library, ListTodo, Loader2, Sparkles, ExternalLink, Pencil,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../../components/Navbar';
import AuthGuard from '../../components/AuthGuard';
import { api } from '../../lib/api';

const PLATFORM_META = {
  tiktok:         { label: 'TikTok',    emoji: '🎵', color: 'fuchsia' },
  instagram:      { label: 'Instagram', emoji: '📸', color: 'rose' },
  facebook:       { label: 'Facebook',  emoji: '👥', color: 'blue' },
  youtube_shorts: { label: 'YT Shorts', emoji: '▶️', color: 'red' },
  discord:        { label: 'Discord',   emoji: '💬', color: 'indigo' },
};

const STATUS_CHIP = {
  DRAFT:     'bg-amber-500/20 text-amber-300',
  APPROVED:  'bg-emerald-500/20 text-emerald-300',
  REJECTED:  'bg-rose-500/20 text-rose-300',
  PUBLISHED: 'bg-violet-500/20 text-violet-300',
  SKIPPED:   'bg-white/10 text-white/40',
};

export default function AdminContent() {
  return (
    <AuthGuard feature="el Content Engine" returnUrl={window.location.pathname} accent="fuchsia">
      <Inner />
    </AuthGuard>
  );
}

function Inner() {
  const [tab, setTab] = useState('queue');
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-fuchsia-950/10 to-slate-950 text-white">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 pt-24 pb-16 space-y-6">
        <Link to="/admin" className="flex items-center gap-2 text-white/60 hover:text-white text-sm w-fit">
          <ArrowLeft size={16} /> Admin
        </Link>
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-fuchsia-300 mb-1">
            <Megaphone size={14} /> Content Engine
          </div>
          <h1 className="font-display text-3xl font-black">Contenido post-torneo</h1>
          <p className="text-white/50 text-sm mt-1">
            Cada torneo finalizado genera su pack para 5 redes. Vos aprobás, la IA escribe.
          </p>
        </div>

        <div className="flex gap-2">
          {[
            { id: 'queue', icon: ListTodo, label: 'Cola' },
            { id: 'library', icon: Library, label: 'Biblioteca' },
            { id: 'analytics', icon: BarChart3, label: 'Analytics' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-medium border transition ${
                tab === t.id ? 'bg-fuchsia-500/25 border-fuchsia-400/50 text-fuchsia-100'
                             : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
              }`}>
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>

        {tab === 'queue' && <QueueTab />}
        {tab === 'library' && <LibraryTab />}
        {tab === 'analytics' && <AnalyticsTab />}
      </div>
    </div>
  );
}

// ═══════════════════ COLA ═══════════════════

function QueueTab() {
  const [jobs, setJobs] = useState([]);
  const [active, setActive] = useState(null);   // job con piezas
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const r = await api.get('/content/jobs?limit=20');
      setJobs(r.data || []);
      if (active) {
        const fresh = await api.get(`/content/jobs/${active.id}`);
        setActive(fresh.data);
      }
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, []);

  const openJob = async (id) => {
    const r = await api.get(`/content/jobs/${id}`);
    setActive(r.data);
  };

  const runNow = async (id) => {
    setBusy(true);
    try {
      const r = await api.post(`/content/jobs/${id}/run-now`);
      toast.success(`Job procesado: ${r.data.status}`);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
    finally { setBusy(false); }
  };

  if (loading) return <Center />;

  if (active) {
    return <JobDetail job={active} onBack={() => setActive(null)} onChanged={() => openJob(active.id)} />;
  }

  return (
    <div className="space-y-3">
      {jobs.map(j => (
        <motion.div key={j.id} layout
          className={`rounded-2xl glass p-4 flex items-center justify-between gap-3 ${
            j.status === 'READY' ? 'border border-fuchsia-400/40' : ''
          }`}>
          <div className="min-w-0">
            <div className="font-bold truncate">{j.event_name}</div>
            <div className="text-xs text-white/40">
              {new Date(j.created_at).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}
              {j.error && <span className="text-rose-300 ml-2">· {j.error.slice(0, 60)}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${
              j.status === 'READY' ? 'bg-fuchsia-500/30 text-fuchsia-200' :
              j.status === 'FAILED' ? 'bg-rose-500/30 text-rose-200' :
              'bg-white/10 text-white/50 animate-pulse'
            }`}>{j.status}</span>
            {(j.status === 'PENDING' || j.status === 'FAILED') && (
              <button onClick={() => runNow(j.id)} disabled={busy}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-fuchsia-500/30 text-xs disabled:opacity-40">
                ▶ Procesar ya
              </button>
            )}
            {j.status === 'READY' && (
              <button onClick={() => openJob(j.id)}
                className="px-3 py-1.5 rounded-lg bg-fuchsia-500 hover:bg-fuchsia-400 text-white text-xs font-bold">
                Revisar pack
              </button>
            )}
          </div>
        </motion.div>
      ))}
      {!jobs.length && (
        <div className="rounded-2xl glass p-10 text-center text-white/40 text-sm">
          Sin jobs. Se crean automáticamente al finalizar un torneo, o forzalos con
          POST /api/content/jobs/{'{event_id}'}/trigger.
        </div>
      )}
    </div>
  );
}

function JobDetail({ job, onBack, onChanged }) {
  const pieces = job.pieces || [];
  const [platform, setPlatform] = useState(pieces[0]?.platform || 'discord');
  const piece = pieces.find(p => p.platform === platform);

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm text-white/60 hover:text-white">← Volver a la cola</button>
      <h2 className="font-display text-2xl font-black">{job.event_name}</h2>

      <div className="flex gap-2 flex-wrap">
        {pieces.map(p => {
          const m = PLATFORM_META[p.platform];
          return (
            <button key={p.platform} onClick={() => setPlatform(p.platform)}
              className={`px-3 py-2 rounded-xl flex items-center gap-2 text-sm border transition ${
                platform === p.platform
                  ? `bg-${m.color}-500/25 border-${m.color}-400/50 text-white`
                  : 'bg-white/5 border-white/10 text-white/50'
              }`}>
              {m.emoji} {m.label}
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${STATUS_CHIP[p.status]}`}>
                {p.status}
              </span>
            </button>
          );
        })}
      </div>

      {piece && <PieceCard piece={piece} onChanged={onChanged} />}
    </div>
  );
}

function PieceCard({ piece, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [note, setNote] = useState('');
  const [showRegen, setShowRegen] = useState(false);
  const [pubUrl, setPubUrl] = useState('');

  const act = async (fn, ok) => {
    setBusy(true);
    try { await fn(); toast.success(ok); onChanged(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
    finally { setBusy(false); }
  };

  const copyAll = () => {
    navigator.clipboard.writeText(renderBodyText(piece.platform, piece.body));
    toast.success('Copiado — pegalo en la app');
  };

  if (piece.status === 'SKIPPED') {
    return <div className="rounded-2xl glass p-8 text-center text-white/40">
      Pieza salteada: {piece.body.skipped || 'sin material suficiente'}
    </div>;
  }

  return (
    <div className="rounded-2xl glass overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between flex-wrap gap-2">
        <span className="text-xs text-white/40 font-mono">
          v{piece.generation} · {piece.writer_model}{piece.was_edited && ' · editado'}
        </span>
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={copyAll} className="btn-xs bg-white/10 hover:bg-white/20 px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1">
            <Copy size={11} /> Copiar
          </button>
          <button onClick={() => { setEditing(!editing); setEditText(JSON.stringify(piece.body, null, 2)); }}
            className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs flex items-center gap-1">
            <Pencil size={11} /> Editar
          </button>
          <button onClick={() => setShowRegen(!showRegen)}
            className="px-2.5 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/30 text-cyan-200 text-xs flex items-center gap-1">
            <RefreshCw size={11} /> Regenerar
          </button>
          {piece.status === 'DRAFT' && (
            <>
              <button disabled={busy}
                onClick={() => act(() => api.post(`/content/pieces/${piece.id}/approve`), 'Aprobada ✓')}
                className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-200 text-xs font-bold flex items-center gap-1 disabled:opacity-40">
                <Check size={11} /> Aprobar
              </button>
              <button disabled={busy}
                onClick={() => act(() => api.post(`/content/pieces/${piece.id}/reject`, {}), 'Rechazada')}
                className="px-2.5 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 text-xs flex items-center gap-1 disabled:opacity-40">
                <X size={11} />
              </button>
            </>
          )}
          {piece.status === 'APPROVED' && piece.platform === 'discord' && (
            <button disabled={busy}
              onClick={() => act(() => api.post(`/content/pieces/${piece.id}/publish-discord`), 'Publicado en Discord 🚀')}
              className="px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-bold flex items-center gap-1 disabled:opacity-40">
              <Send size={11} /> Publicar ahora
            </button>
          )}
          {piece.status === 'APPROVED' && piece.platform !== 'discord' && (
            <span className="flex items-center gap-1">
              <input value={pubUrl} onChange={e => setPubUrl(e.target.value)} placeholder="URL publicada"
                className="px-2 py-1.5 rounded-lg bg-bg-surface border border-bg-border text-xs w-40" />
              <button disabled={busy}
                onClick={() => act(() => api.post(`/content/pieces/${piece.id}/mark-published`, { url: pubUrl || null }), 'Marcada publicada ✓')}
                className="px-2.5 py-1.5 rounded-lg bg-violet-500 hover:bg-violet-400 text-white text-xs font-bold disabled:opacity-40">
                Publicada
              </button>
            </span>
          )}
        </div>
      </div>

      {showRegen && (
        <div className="px-4 py-3 border-b border-white/10 bg-cyan-500/5 flex gap-2">
          <input value={note} onChange={e => setNote(e.target.value)}
            placeholder="Feedback para Fable: 'más corto', 'menos emojis', 'tono más serio'…"
            className="flex-1 px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-sm" />
          <button disabled={busy}
            onClick={() => act(() => api.post(`/content/pieces/${piece.id}/regenerate`, { note }), 'Nueva versión generada')}
            className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-bold text-sm disabled:opacity-40">
            Generar v{piece.generation + 1}
          </button>
        </div>
      )}

      {editing ? (
        <div className="p-4">
          <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={16}
            className="w-full bg-bg-surface rounded-lg border border-bg-border p-3 text-xs font-mono resize-none" />
          <button disabled={busy}
            onClick={() => {
              try {
                const body = JSON.parse(editText);
                act(() => api.patch(`/content/pieces/${piece.id}`, { body }), 'Guardado').then(() => setEditing(false));
              } catch { toast.error('JSON inválido'); }
            }}
            className="mt-2 px-4 py-2 rounded-lg bg-fuchsia-500 text-white font-bold text-sm disabled:opacity-40">
            Guardar edición
          </button>
        </div>
      ) : (
        <div className="p-5">
          <BodyPreview platform={piece.platform} body={piece.body} />
        </div>
      )}
    </div>
  );
}

function BodyPreview({ platform, body }) {
  if (platform === 'tiktok' || platform === 'youtube_shorts') {
    return (
      <div className="max-w-sm mx-auto rounded-3xl border-4 border-white/10 bg-black p-5 space-y-3">
        <div className="text-fuchsia-300 font-black text-lg">{body.hook_2s || body.titulo_seo}</div>
        {(body.guion || []).map((b, i) => (
          <div key={i} className="text-sm">
            <span className="text-white/30 font-mono text-xs mr-2">{b.t}</span>
            {b.texto_pantalla && <div className="font-bold">{b.texto_pantalla}</div>}
            <div className="text-white/70">{b.voz}</div>
          </div>
        ))}
        <div className="text-xs text-white/50 pt-2 border-t border-white/10">
          {body.caption || body.descripcion}
        </div>
        <div className="text-[10px] text-cyan-300">{(body.hashtags || body.tags || []).join(' ')}</div>
      </div>
    );
  }
  if (platform === 'instagram') {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(body.slides || []).map((s, i) => (
            <div key={i} className="aspect-square rounded-xl bg-gradient-to-br from-violet-900/50 to-fuchsia-900/30 border border-white/10 p-3 flex flex-col">
              <div className="text-[10px] text-white/30 mb-1">slide {i + 1}</div>
              <div className="font-bold text-sm leading-tight">{s.titulo}</div>
              <div className="text-[11px] text-white/60 mt-1 overflow-hidden">{s.cuerpo}</div>
            </div>
          ))}
        </div>
        <div className="rounded-xl bg-bg-surface p-3 text-sm whitespace-pre-wrap">{body.caption}</div>
        <div className="text-xs text-cyan-300">{(body.hashtags || []).join(' ')}</div>
      </div>
    );
  }
  if (platform === 'discord') {
    return (
      <div className="max-w-lg rounded-xl bg-[#313338] p-4 space-y-2 text-sm">
        <div>{body.mensaje_arriba}</div>
        <div className="border-l-4 border-fuchsia-500 bg-[#2b2d31] rounded p-3 space-y-2">
          <div className="font-bold">{body.embed_titulo}</div>
          <div className="text-white/80 whitespace-pre-wrap text-xs">{body.embed_descripcion_md}</div>
          {(body.campos || []).map((c, i) => (
            <div key={i} className="text-xs"><strong>{c.nombre}</strong>: {c.valor}</div>
          ))}
        </div>
      </div>
    );
  }
  // facebook
  return (
    <div className="max-w-lg rounded-xl bg-bg-surface border border-white/10 p-4 space-y-2">
      <div className="text-sm whitespace-pre-wrap">{body.post}</div>
      {body.foto_sugerida && <div className="text-xs text-white/40">📷 {body.foto_sugerida}</div>}
      <div className="text-xs text-cyan-300">{(body.hashtags || []).join(' ')}</div>
    </div>
  );
}

function renderBodyText(platform, body) {
  if (platform === 'facebook') return `${body.post}\n\n${(body.hashtags || []).join(' ')}`;
  if (platform === 'instagram') return `${body.caption}\n\n${(body.hashtags || []).join(' ')}\n\n--- SLIDES ---\n${(body.slides || []).map((s, i) => `${i + 1}. ${s.titulo}\n${s.cuerpo}`).join('\n\n')}`;
  if (platform === 'discord') return `${body.mensaje_arriba}\n\n${body.embed_titulo}\n${body.embed_descripcion_md}`;
  return JSON.stringify(body, null, 2);
}

// ═══════════════════ BIBLIOTECA ═══════════════════

function LibraryTab() {
  const [items, setItems] = useState([]);
  const [platform, setPlatform] = useState('');
  const [metricsFor, setMetricsFor] = useState(null);
  const [m, setM] = useState({ views: 0, likes: 0, comments: 0, shares: 0, saves: 0 });

  const load = async () => {
    const r = await api.get(`/content/library?limit=50${platform ? `&platform=${platform}` : ''}`);
    setItems(r.data || []);
  };
  useEffect(() => { load(); }, [platform]);

  const saveMetrics = async () => {
    try {
      const r = await api.post(`/content/pieces/${metricsFor}/metrics`, m);
      toast.success(`Métricas guardadas — SIS: ${r.data.impact_score ?? 'calibrando'}`);
      setMetricsFor(null);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setPlatform('')}
          className={`px-3 py-1.5 rounded-full text-xs font-bold border ${!platform ? 'bg-fuchsia-500/25 border-fuchsia-400/50' : 'bg-white/5 border-white/10 text-white/50'}`}>
          Todas
        </button>
        {Object.entries(PLATFORM_META).map(([k, v]) => (
          <button key={k} onClick={() => setPlatform(k)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border ${platform === k ? 'bg-fuchsia-500/25 border-fuchsia-400/50' : 'bg-white/5 border-white/10 text-white/50'}`}>
            {v.emoji} {v.label}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {items.map(p => (
          <div key={p.id} className="rounded-xl glass p-3 flex items-center gap-3">
            <span className="text-xl shrink-0">{PLATFORM_META[p.platform]?.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{p.event_name}</div>
              <div className="text-[10px] text-white/40">
                {new Date(p.created_at).toLocaleDateString('es-CL')} · v{p.generation}
                {p.published_url && (
                  <a href={p.published_url} target="_blank" rel="noopener noreferrer" className="text-cyan-300 ml-2">
                    <ExternalLink size={10} className="inline" /> ver
                  </a>
                )}
              </div>
            </div>
            <span className={`text-[9px] px-2 py-1 rounded-full font-bold shrink-0 ${STATUS_CHIP[p.status]}`}>{p.status}</span>
            {p.impact_score !== null && (
              <span className={`font-mono font-black text-sm shrink-0 ${
                p.impact_score >= 70 ? 'text-emerald-300' : p.impact_score >= 40 ? 'text-amber-300' : 'text-rose-300'
              }`}>SIS {p.impact_score}</span>
            )}
            {p.status === 'PUBLISHED' && (
              <button onClick={() => setMetricsFor(p.id)}
                className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs shrink-0">
                📊 Métricas
              </button>
            )}
          </div>
        ))}
        {!items.length && <div className="rounded-2xl glass p-10 text-center text-white/40 text-sm">Biblioteca vacía.</div>}
      </div>

      <AnimatePresence>
        {metricsFor && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-center p-4"
            onClick={() => setMetricsFor(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} onClick={e => e.stopPropagation()}
              className="bg-bg-elevated rounded-2xl border border-fuchsia-400/30 max-w-sm w-full p-5">
              <h3 className="font-bold mb-3">Cargar métricas</h3>
              {['views', 'likes', 'comments', 'shares', 'saves'].map(k => (
                <div key={k} className="flex items-center gap-2 mb-2">
                  <label className="text-xs text-white/50 w-20 capitalize">{k}</label>
                  <input type="number" min="0" value={m[k]}
                    onChange={e => setM({ ...m, [k]: parseInt(e.target.value, 10) || 0 })}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-bg-surface border border-bg-border text-sm font-mono" />
                </div>
              ))}
              <button onClick={saveMetrics}
                className="w-full mt-2 py-2 rounded-lg bg-fuchsia-500 text-white font-bold text-sm">
                Guardar snapshot
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═══════════════════ ANALYTICS ═══════════════════

function AnalyticsTab() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get('/content/analytics').then(r => setData(r.data)).catch(() => {}); }, []);
  if (!data) return <Center />;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {data.platforms.map(p => (
          <div key={p.platform} className="rounded-2xl glass p-4">
            <div className="text-xl">{PLATFORM_META[p.platform]?.emoji}</div>
            <div className="font-mono font-black text-2xl mt-1">{p.avg_sis}</div>
            <div className="text-[10px] uppercase text-white/40">SIS promedio · {p.pieces} piezas</div>
          </div>
        ))}
        {!data.platforms.length && (
          <div className="col-span-full rounded-2xl glass p-8 text-center text-white/40 text-sm">
            Sin piezas publicadas con métricas todavía — el SIS se calibra con las primeras 3 por plataforma.
          </div>
        )}
      </div>

      {data.winning_hooks.length > 0 && (
        <div className="rounded-2xl glass overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 text-xs uppercase tracking-wider text-emerald-300 font-bold flex items-center gap-2">
            <Sparkles size={12} /> Hooks ganadores (alimentan al analista)
          </div>
          <div className="divide-y divide-white/5">
            {data.winning_hooks.map((h, i) => (
              <div key={i} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                <span className="shrink-0">{PLATFORM_META[h.platform]?.emoji}</span>
                <span className="flex-1 truncate">"{h.hook}"</span>
                <span className="font-mono text-emerald-300 shrink-0">SIS {h.sis}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Center() {
  return <div className="grid place-items-center py-16"><Loader2 className="animate-spin text-fuchsia-300" /></div>;
}
