import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import toast from 'react-hot-toast';
import { QrCode, Sparkles, User, X, RefreshCw } from 'lucide-react';
import { RANK_COLORS } from '../lib/progression';
import { api } from '../lib/api';

export default function EliteIdCard({ player }) {
  const rank = player?.current_rank || 'INICIADO';
  const colors = RANK_COLORS[rank];
  const avatar = player?.avatar_url;
  const [showQr, setShowQr] = useState(false);
  const [qrToken, setQrToken] = useState(null);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    if (!showQr || qrToken) return;
    api.get('/checkin/me/token').then((r) => setQrToken(r.data.token)).catch(() => {});
  }, [showQr, qrToken]);

  async function regenerate() {
    if (!confirm('¿Generar un QR nuevo? El anterior dejará de funcionar.')) return;
    setRegenerating(true);
    try {
      const r = await api.post('/checkin/me/token/regenerate');
      setQrToken(r.data.token);
      toast.success('QR regenerado');
    } catch {
      toast.error('Error');
    } finally { setRegenerating(false); }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, rotateY: -8 }}
      animate={{ opacity: 1, y: 0, rotateY: 0 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -4, rotateY: 4 }}
      className={`relative w-72 aspect-[5/7] rounded-2xl overflow-hidden border ${colors.border} bg-gradient-to-br from-bg-elevated via-bg-surface to-black shadow-2xl shadow-elite-violet/10`}
      style={{ perspective: 1000 }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_0%,rgba(124,92,255,0.18),transparent_60%)] pointer-events-none" />
      <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-elite-violet/30 via-transparent to-elite-blue/20 opacity-60 pointer-events-none" />

      <div className="relative p-5 flex flex-col h-full">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] tracking-[0.3em] uppercase text-white/40 font-display">Elite ID</p>
            <p className="font-mono text-xs text-white/70 mt-1">{player?.elite_id_code || 'EC-2026-000000'}</p>
          </div>
          <Sparkles size={16} className="text-elite-gold" />
        </div>

        <div className="flex flex-col items-center my-4 flex-grow justify-center">
          <div className={`relative w-24 h-24 rounded-full overflow-hidden border-2 ${colors.border} bg-bg-elevated`}>
            {avatar ? (
              <img src={avatar} alt={player?.alias || ''} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/30">
                <User size={36} />
              </div>
            )}
            <div className={`absolute -inset-0.5 rounded-full bg-gradient-to-br from-elite-violet/40 via-transparent to-elite-blue/40 -z-10 blur-sm`} />
          </div>
        </div>

        <div className="mt-auto">
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold ${colors.bg} ${colors.text} ${colors.border} border`}>
            {colors.label} · Nivel {player?.level || 1}
          </div>
          <h3 className="font-display text-2xl font-bold mt-3 truncate">{player?.alias || 'Player'}</h3>
          <p className="text-xs text-white/50 mt-0.5">{player?.player_class || 'DUELISTA'}</p>

          <div className="flex items-end justify-between mt-5 pt-4 border-t border-white/10">
            <div>
              <p className="text-[9px] tracking-widest uppercase text-white/40">Prestigio</p>
              <p className="font-mono text-lg font-semibold text-elite-gold">{player?.prestige || 0}</p>
            </div>
            <button
              onClick={() => setShowQr(true)}
              title="Mostrar QR de check-in"
              className="w-10 h-10 rounded-md bg-white/5 border border-white/10 flex items-center justify-center hover:bg-elite-violet/15 hover:border-elite-violet/40 transition"
            >
              <QrCode size={20} className="text-white/60" />
            </button>
          </div>
        </div>
      </div>

      {/* QR Modal */}
      {showQr && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setShowQr(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-bg-surface border border-bg-border rounded-2xl p-6 w-full max-w-sm"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-semibold">QR de check-in</h3>
              <button onClick={() => setShowQr(false)} className="text-white/40 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-white/60 mb-4 leading-snug">
              Mostrá este QR al admin del Gremio al llegar a un evento. Te marca asistencia automática.
            </p>
            <div className="bg-white p-4 rounded-xl flex justify-center mb-3">
              {qrToken ? (
                <QRCodeSVG value={qrToken} size={220} level="M" />
              ) : (
                <div className="w-[220px] h-[220px] flex items-center justify-center text-bg/50 text-sm">
                  Generando…
                </div>
              )}
            </div>
            <p className="text-[10px] font-mono text-center text-white/40 mb-3">
              {player?.elite_id_code}
            </p>
            <button
              onClick={regenerate}
              disabled={regenerating}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-[11px] text-white/70 disabled:opacity-50"
            >
              <RefreshCw size={11} className={regenerating ? 'animate-spin' : ''} />
              {regenerating ? 'Generando…' : 'Regenerar QR (si lo copiaron)'}
            </button>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
