import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Heart } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/useAuth';

// Cache global del wishlist del usuario actual para no refetch por tarjeta.
let _cachePromise = null;
let _cacheData = null;

async function fetchWishlistIds(force = false) {
  if (force) { _cachePromise = null; _cacheData = null; }
  if (_cacheData) return _cacheData;
  if (_cachePromise) return _cachePromise;
  _cachePromise = api.get('/wishlist').then((r) => {
    _cacheData = new Set(r.data.map((w) => w.product_id));
    return _cacheData;
  }).catch(() => new Set());
  return _cachePromise;
}

export default function WishlistButton({ productId, size = 16 }) {
  const { isAuthed } = useAuth();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isAuthed) return;
    fetchWishlistIds().then((ids) => setSaved(ids.has(productId)));
  }, [isAuthed, productId]);

  if (!isAuthed) return null;

  async function toggle(e) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      if (saved) {
        await api.delete(`/wishlist/${productId}`);
        _cacheData?.delete(productId);
        setSaved(false);
      } else {
        await api.post(`/wishlist/${productId}`);
        _cacheData?.add(productId);
        setSaved(true);
        toast.success('Agregado a tu wishlist');
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    } finally { setBusy(false); }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      title={saved ? 'Quitar de wishlist' : 'Guardar en wishlist'}
      className={`p-1.5 rounded-full transition disabled:opacity-50 ${
        saved
          ? 'bg-rose-500/15 text-rose-400 hover:bg-rose-500/25'
          : 'bg-white/5 text-white/40 hover:text-rose-300 hover:bg-rose-500/10'
      }`}
    >
      <Heart size={size} fill={saved ? 'currentColor' : 'none'} />
    </button>
  );
}
