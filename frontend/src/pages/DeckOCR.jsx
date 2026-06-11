import { useState } from 'react';
import { Camera, Copy, Loader2, ScanText } from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';
import AuthGuard from '../components/AuthGuard';
import { api } from '../lib/api';

export default function DeckOCR() {
  return (
    <AuthGuard feature="el OCR de decklists" returnUrl={window.location.pathname} accent="violet">
      <Inner />
    </AuthGuard>
  );
}

function Inner() {
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);

  const onFile = async (file) => {
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setResult('');
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const r = await api.post('/growth/decks/ocr', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000,
      });
      if (r.data.mock) {
        toast(r.data.message, { icon: 'ℹ️', duration: 6000 });
      } else {
        setResult(r.data.list_text || '');
        toast.success(`${r.data.lines_count} líneas detectadas`);
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'OCR falló');
    } finally { setBusy(false); }
  };

  const copy = () => {
    navigator.clipboard.writeText(result);
    toast.success('Copiado — pegalo en tu Deck Builder');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-violet-950/10 to-slate-950 text-white">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 pt-24 pb-16 space-y-6">
        <header>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-violet-300 mb-1">
            <ScanText size={14} /> Deck OCR
          </div>
          <h1 className="font-display text-3xl font-black">Foto → Decklist</h1>
          <p className="text-white/50 text-sm mt-1">
            Sacale foto a tu lista manuscrita o screenshot de companion app. Claude la convierte a texto.
          </p>
        </header>

        <div className="grid md:grid-cols-2 gap-4">
          <label className="rounded-2xl glass border-2 border-dashed border-violet-400/40 hover:border-violet-400/70 p-8 grid place-items-center cursor-pointer min-h-[280px] transition">
            <input type="file" accept="image/*" capture="environment" className="hidden"
              onChange={e => onFile(e.target.files?.[0])} />
            {preview ? (
              <img src={preview} alt="preview" className="max-h-64 rounded-lg object-contain" />
            ) : (
              <div className="text-center">
                <Camera size={40} className="mx-auto text-violet-300 mb-3" />
                <div className="font-bold">Subir o sacar foto</div>
                <div className="text-xs text-white/40 mt-1">JPG/PNG · máx 8MB</div>
              </div>
            )}
          </label>

          <div className="rounded-2xl glass p-4 flex flex-col min-h-[280px]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase tracking-wider text-white/50 font-bold">Resultado</span>
              {result && (
                <button onClick={copy} className="px-2.5 py-1 rounded-lg bg-violet-500/20 hover:bg-violet-500/40 text-violet-200 text-xs font-bold flex items-center gap-1">
                  <Copy size={11} /> Copiar
                </button>
              )}
            </div>
            {busy ? (
              <div className="flex-1 grid place-items-center">
                <div className="text-center">
                  <Loader2 className="animate-spin mx-auto text-violet-300 mb-2" />
                  <div className="text-xs text-white/40">Leyendo cartas…</div>
                </div>
              </div>
            ) : (
              <textarea value={result} onChange={e => setResult(e.target.value)}
                placeholder="Acá aparece la lista parseada — editable antes de copiar."
                className="flex-1 bg-bg-surface rounded-lg border border-bg-border p-3 text-xs font-mono resize-none outline-none focus:border-violet-400/50" />
            )}
          </div>
        </div>
        <p className="text-[11px] text-white/40">
          Requiere ANTHROPIC_API_KEY en el backend. El texto resultante lo pegás directo en <strong>Mis Mazos → Builder</strong>.
        </p>
      </div>
    </div>
  );
}
