import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Html5Qrcode } from 'html5-qrcode';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Check, X, ScanLine, AlertCircle, User } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import { api } from '../../lib/api';
import { useGuild } from '../../lib/useGuild';

const SCANNER_ID = 'qr-scanner-container';

export default function AdminCheckin() {
  const { current } = useGuild();
  const [events, setEvents] = useState([]);
  const [eventId, setEventId] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [history, setHistory] = useState([]);
  const scannerRef = useRef(null);
  const recentTokensRef = useRef(new Map()); // anti-doble-scan dentro de 3s

  // Cargar eventos del Gremio (estados OPEN/CLOSED)
  useEffect(() => {
    api.get('/admin/events').then((r) => {
      setEvents(r.data.filter((e) => ['OPEN', 'CLOSED'].includes(e.status)));
    }).catch(() => {});
  }, [current?.guild?.id]);

  // Cleanup del scanner al desmontar
  useEffect(() => {
    return () => stopScanner();
  }, []);

  async function startScanner() {
    if (!eventId) {
      toast.error('Elige un evento primero');
      return;
    }
    try {
      const html5 = new Html5Qrcode(SCANNER_ID);
      scannerRef.current = html5;
      await html5.start(
        { facingMode: 'environment' },
        { fps: 8, qrbox: { width: 240, height: 240 } },
        onScan,
        () => { /* ignore decode errors */ },
      );
      setScanning(true);
    } catch (e) {
      toast.error('No se pudo activar la cámara. Permitelá en el browser.');
      scannerRef.current = null;
    }
  }

  async function stopScanner() {
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); } catch {}
      try { scannerRef.current.clear(); } catch {}
      scannerRef.current = null;
    }
    setScanning(false);
  }

  async function onScan(decodedText) {
    // Debounce: ignorar misma lectura dentro de 3s
    const now = Date.now();
    const last = recentTokensRef.current.get(decodedText) || 0;
    if (now - last < 3000) return;
    recentTokensRef.current.set(decodedText, now);

    try {
      const { data } = await api.post(`/checkin/event/${eventId}`, { token: decodedText });
      const result = {
        ...data,
        timestamp: now,
        eventId,
        ok: true,
      };
      setLastResult(result);
      setHistory((h) => [result, ...h.slice(0, 9)]);
      const msg = {
        'already_attended': `${data.alias} ya estaba marcado`,
        'marked': `${data.alias} marcado attended ✓`,
        'registered_and_marked': `${data.alias} inscrito + marcado ✓`,
      }[data.action] || 'OK';
      toast.success(msg);
      // Beep audible
      try {
        const a = new AudioContext();
        const o = a.createOscillator(); const g = a.createGain();
        o.connect(g); g.connect(a.destination);
        o.frequency.value = 880; g.gain.value = 0.05;
        o.start(); o.stop(a.currentTime + 0.12);
      } catch {}
    } catch (e) {
      const detail = e.response?.data?.detail || 'Error';
      const result = { ok: false, error: detail, timestamp: now };
      setLastResult(result);
      setHistory((h) => [result, ...h.slice(0, 9)]);
      toast.error(detail);
    }
  }

  return (
    <AdminLayout title="Check-in por QR" subtitle="Marca asistencia escaneando el Elite ID de cada jugador.">
      <div className="grid md:grid-cols-[1fr_auto] gap-6">
        <div>
          {/* Selector evento */}
          <div className="mb-4">
            <label className="block text-xs uppercase tracking-widest text-white/40 mb-1.5">Evento</label>
            <select
              value={eventId || ''}
              onChange={(e) => { stopScanner(); setEventId(Number(e.target.value) || null); }}
              className="w-full px-3 py-2.5 rounded-lg bg-bg-elevated border border-bg-border text-sm focus:outline-none focus:border-elite-violet/60"
            >
              <option value="">Elige un evento…</option>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} · {e.event_type} · {e.registered_count}/{e.slots} inscritos
                </option>
              ))}
            </select>
          </div>

          {/* Scanner viewport */}
          <div className="relative aspect-square max-w-md mx-auto rounded-2xl overflow-hidden bg-black border border-bg-border">
            <div id={SCANNER_ID} className="w-full h-full" />
            {!scanning && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white/40 bg-bg-elevated/40">
                <Camera size={48} className="mb-3" />
                <p className="text-sm">Cámara apagada</p>
                <p className="text-xs text-white/30 mt-1">Elige un evento y dale a "Iniciar"</p>
              </div>
            )}
            {scanning && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-60 h-60 border-2 border-elite-violet rounded-2xl shadow-glow-violet" />
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex gap-2 mt-4 justify-center">
            {!scanning ? (
              <button
                onClick={startScanner}
                disabled={!eventId}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-elite-violet to-elite-blue text-white font-medium hover:shadow-glow-violet transition disabled:opacity-40"
              >
                <ScanLine size={14} /> Iniciar escaneo
              </button>
            ) : (
              <button
                onClick={stopScanner}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium transition"
              >
                <X size={14} /> Detener
              </button>
            )}
          </div>
        </div>

        {/* Right panel: último resultado + historial */}
        <div className="w-full md:w-80">
          <AnimatePresence mode="wait">
            {lastResult && (
              <motion.div
                key={lastResult.timestamp}
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className={`p-5 rounded-2xl border mb-4 ${
                  lastResult.ok
                    ? 'bg-emerald-500/10 border-emerald-500/40'
                    : 'bg-rose-500/10 border-rose-500/40'
                }`}
              >
                {lastResult.ok ? (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <Check size={18} className="text-emerald-300" />
                      <span className="text-xs uppercase tracking-widest text-emerald-300">
                        {lastResult.action.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="font-display text-xl font-bold">{lastResult.alias}</p>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle size={18} className="text-rose-300" />
                      <span className="text-xs uppercase tracking-widest text-rose-300">Error</span>
                    </div>
                    <p className="text-sm text-white/80">{lastResult.error}</p>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <h3 className="text-xs uppercase tracking-widest text-white/40 mb-2">Historial (10 últimos)</h3>
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {history.length === 0 ? (
              <p className="text-xs text-white/30">Aún sin escaneos.</p>
            ) : history.map((h, i) => (
              <div key={`${h.timestamp}-${i}`}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs ${
                  h.ok ? 'bg-emerald-500/5' : 'bg-rose-500/5'
                }`}>
                {h.ok ? (
                  <>
                    <Check size={11} className="text-emerald-400" />
                    <span className="font-semibold">{h.alias}</span>
                    <span className="text-white/40 text-[10px] ml-auto">{h.action}</span>
                  </>
                ) : (
                  <>
                    <X size={11} className="text-rose-400" />
                    <span className="text-white/60 truncate">{h.error}</span>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
