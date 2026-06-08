/** AR Elite ID — Stream de cámara + Elite ID Card 3D superpuesto que sigue
 * un punto fijo (tap to anchor). Snapshot exporta composición a PNG. */
import { Suspense, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Camera, RefreshCw, Download, AlertCircle, Sparkles } from 'lucide-react';
import * as THREE from 'three';

import { api } from '../lib/api';
import EliteIdCard3D from '../components/EliteIdCard3D';

export default function ArEliteId() {
  const videoRef = useRef(null);
  const canvasContainerRef = useRef(null);
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('init'); // init | running | denied | error
  const [facing, setFacing] = useState('environment');
  const [anchor, setAnchor] = useState({ x: 50, y: 60 }); // 0-100
  const [showHelp, setShowHelp] = useState(true);

  useEffect(() => {
    api.get('/auth/me').then(r => setUser(r.data)).catch(() => {});
  }, []);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStatus('running');
      }
    } catch (e) {
      setStatus('denied');
    }
  }

  useEffect(() => {
    startCamera();
    return () => {
      const s = videoRef.current?.srcObject;
      s?.getTracks?.().forEach(t => t.stop());
    };
  }, [facing]); // eslint-disable-line

  useEffect(() => {
    const t = setTimeout(() => setShowHelp(false), 4500);
    return () => clearTimeout(t);
  }, []);

  function tapAnchor(e) {
    const rect = canvasContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setAnchor({ x, y });
  }

  async function snapshot() {
    // Compose video frame + canvas
    const v = videoRef.current;
    if (!v) return;
    const w = v.videoWidth || 1280;
    const h = v.videoHeight || 720;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(v, 0, 0, w, h);

    // Overlay R3F canvas (best-effort)
    const r3f = canvasContainerRef.current?.querySelector('canvas');
    if (r3f) {
      try { ctx.drawImage(r3f, 0, 0, w, h); } catch {}
    }
    // Add watermark
    ctx.fillStyle = 'rgba(167,139,250,0.85)';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('ELITECARDS · AR ID', 20, h - 22);

    c.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `elite-id-ar-${Date.now()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }, 'image/png');
  }

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      {/* Video stream BG */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="absolute inset-0 w-full h-full object-cover"
        style={{ transform: facing === 'user' ? 'scaleX(-1)' : 'none' }}
      />
      {/* Vignette + scan grid */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-black/40 via-transparent to-black/70" />
      <div className="absolute inset-0 pointer-events-none opacity-20 mix-blend-overlay"
           style={{
             backgroundImage:
               'repeating-linear-gradient(0deg, rgba(255,255,255,0.07) 0px, rgba(255,255,255,0.07) 1px, transparent 1px, transparent 24px),' +
               'repeating-linear-gradient(90deg, rgba(255,255,255,0.07) 0px, rgba(255,255,255,0.07) 1px, transparent 1px, transparent 24px)',
           }} />

      {/* Canvas 3D overlay */}
      {status === 'running' && (
        <div
          ref={canvasContainerRef}
          onClick={tapAnchor}
          className="absolute inset-0 cursor-crosshair"
        >
          <div
            className="absolute"
            style={{
              left: `${anchor.x}%`,
              top: `${anchor.y}%`,
              width: '420px',
              height: '300px',
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
            }}
          >
            <EliteIdCard3D email={user?.email} mousePos={{ x: 0, y: 0 }} />
          </div>

          {/* Stats flotantes */}
          {user?.profile && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.6 }}
              className="absolute"
              style={{
                left: `${anchor.x + 22}%`,
                top: `${anchor.y - 8}%`,
                pointerEvents: 'none',
              }}
            >
              <div className="px-3 py-2 rounded-lg bg-black/70 backdrop-blur border border-violet-500/40 text-white">
                <div className="text-[9px] uppercase tracking-[0.3em] text-violet-300 font-bold">
                  {user.profile.player_class}
                </div>
                <div className="text-base font-black">{user.profile.alias}</div>
                <div className="text-[10px] font-mono text-violet-300/70 mt-1">
                  {user.profile.elite_id_code}
                </div>
              </div>
            </motion.div>
          )}

          {/* Scan corners visual */}
          <div className="absolute pointer-events-none"
               style={{ left: `${anchor.x}%`, top: `${anchor.y}%`, transform: 'translate(-50%, -50%)', width: 460, height: 320 }}>
            <ScanCorners />
          </div>
        </div>
      )}

      {/* Permission states */}
      {status === 'init' && (
        <div className="absolute inset-0 flex items-center justify-center text-violet-300 font-mono pointer-events-none">
          <div className="text-center">
            <Camera size={32} className="mx-auto mb-3 animate-pulse" />
            <p className="text-xs uppercase tracking-[0.4em]">Esperando permisos de cámara…</p>
          </div>
        </div>
      )}
      {status === 'denied' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-rose-300">
          <div className="text-center max-w-md px-6">
            <AlertCircle size={32} className="mx-auto mb-3" />
            <h2 className="text-xl font-bold mb-2">Cámara denegada</h2>
            <p className="text-xs text-rose-300/70 mb-4">
              Permití acceso a la cámara para usar AR. En el navegador: click en el ícono de
              cámara en la barra de URL → permitir.
            </p>
            <button onClick={startCamera}
                    className="px-4 py-2 rounded-lg bg-rose-500/20 border border-rose-400/40 hover:bg-rose-500/30 text-sm">
              Reintentar
            </button>
          </div>
        </div>
      )}

      {/* HUD top */}
      <div className="absolute top-0 left-0 right-0 p-4 z-20 flex items-start justify-between pointer-events-none">
        <Link to="/profile/premium" className="pointer-events-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur border border-white/10 text-xs text-white hover:bg-black/80">
          <ArrowLeft size={12} /> Volver
        </Link>
        <div className="px-3 py-1.5 rounded-full bg-black/60 backdrop-blur border border-violet-500/40">
          <div className="flex items-center gap-2">
            <Sparkles size={12} className="text-violet-300" />
            <span className="text-[10px] uppercase tracking-[0.4em] text-violet-300 font-bold">AR_ID.LIVE</span>
          </div>
        </div>
      </div>

      {/* HUD bottom controls */}
      {status === 'running' && (
        <div className="absolute bottom-0 left-0 right-0 p-4 z-20 flex justify-center pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-2 bg-black/70 backdrop-blur-xl rounded-full border border-white/10 px-3 py-2">
            <button onClick={() => setFacing(f => f === 'environment' ? 'user' : 'environment')}
                    className="p-2 rounded-full hover:bg-white/10 text-white">
              <RefreshCw size={14} />
            </button>
            <button onClick={snapshot}
                    className="px-4 py-2 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-xs font-bold uppercase tracking-widest flex items-center gap-1.5">
              <Camera size={14} /> Capturar
            </button>
            <div className="px-2 text-[10px] text-violet-300/70 uppercase tracking-widest">
              Tap para anclar
            </div>
          </div>
        </div>
      )}

      {/* Help tooltip */}
      <AnimatePresence>
        {status === 'running' && showHelp && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute top-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl bg-violet-500/20 backdrop-blur border border-violet-400/40 text-xs text-violet-100 font-mono"
          >
            Toca cualquier punto para anclar tu Elite ID
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ScanCorners() {
  return (
    <svg viewBox="0 0 460 320" className="w-full h-full">
      {[
        ['M 0 30 L 0 0 L 30 0', 'tl'],
        ['M 430 0 L 460 0 L 460 30', 'tr'],
        ['M 460 290 L 460 320 L 430 320', 'br'],
        ['M 30 320 L 0 320 L 0 290', 'bl'],
      ].map(([d, key]) => (
        <path key={key} d={d} stroke="#a78bfa" strokeWidth="3" fill="none"
              opacity="0.9" filter="drop-shadow(0 0 4px rgba(167,139,250,0.6))" />
      ))}
    </svg>
  );
}
