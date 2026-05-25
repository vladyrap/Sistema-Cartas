import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react';
import { api } from '../lib/api';

/**
 * Componente de upload de imagen con drag-and-drop.
 *
 * Props:
 *  - value: URL actual (string) o null/empty
 *  - onChange: (newUrl) => void   — llamado al terminar upload o al "Quitar"
 *  - category: "avatars" | "guild_logos" | "guild_banners" | "products"
 *  - aspect: "square" | "wide" — para preview (default square)
 *  - className: extra clases
 *
 * Backend: POST /api/uploads/image  (multipart, 5MB cap, jpg/png/webp/gif)
 */
const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';
const MAX_MB = 5;

export default function ImageUpload({
  value,
  onChange,
  category = 'avatars',
  aspect = 'square',
  className = '',
}) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  function pickFile() { fileInputRef.current?.click(); }

  async function uploadFile(file) {
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`Demasiado grande. Máximo ${MAX_MB}MB.`);
      return;
    }
    if (!ACCEPT.split(',').includes(file.type)) {
      toast.error('Tipo de archivo no permitido (jpg/png/webp/gif)');
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post(
        `/uploads/image?category=${encodeURIComponent(category)}`,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      onChange?.(data.url);
      toast.success('Imagen subida');
    } catch (e) {
      const detail = e.response?.data?.detail;
      if (e.response?.status === 413) {
        toast.error('Archivo demasiado grande');
      } else if (e.response?.status === 429) {
        toast.error('Demasiadas subidas, esperá un momento');
      } else {
        toast.error(detail || 'Error al subir');
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  }

  const aspectCls = aspect === 'wide'
    ? 'aspect-[16/5] w-full'
    : 'aspect-square w-32';

  return (
    <div className={className}>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => uploadFile(e.target.files?.[0])}
      />

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`relative ${aspectCls} rounded-xl border-2 border-dashed overflow-hidden transition cursor-pointer ${
          dragOver
            ? 'border-elite-violet bg-elite-violet/5'
            : value
              ? 'border-bg-border'
              : 'border-bg-border hover:border-elite-violet/40 bg-bg-elevated/40'
        }`}
        onClick={!uploading ? pickFile : undefined}
      >
        {value ? (
          <>
            <img src={value} alt="" className="w-full h-full object-cover" />
            {!uploading && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onChange?.(''); }}
                title="Quitar imagen"
                className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/60 text-white hover:bg-rose-600 transition"
              >
                <X size={12} />
              </button>
            )}
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-2 text-white/40">
            <ImageIcon size={aspect === 'wide' ? 28 : 22} className="mb-1.5" />
            <p className="text-[10px] sm:text-xs leading-tight">
              {dragOver ? 'Soltá la imagen aquí' : 'Arrastra o click'}
            </p>
            <p className="text-[9px] text-white/25 mt-0.5">JPG/PNG/WEBP · 5MB máx</p>
          </div>
        )}

        {uploading && (
          <div className="absolute inset-0 bg-bg/70 backdrop-blur-sm flex flex-col items-center justify-center">
            <Loader2 size={20} className="text-elite-violet animate-spin" />
            <p className="text-[10px] text-white/60 mt-1.5">Subiendo…</p>
          </div>
        )}
      </div>

      {value && !uploading && (
        <button
          type="button"
          onClick={pickFile}
          className="text-[10px] text-elite-violet hover:text-white inline-flex items-center gap-1 mt-1.5"
        >
          <Upload size={10} /> Cambiar
        </button>
      )}
    </div>
  );
}
