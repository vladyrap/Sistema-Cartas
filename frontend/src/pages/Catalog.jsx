import { useEffect, useState } from 'react';
import { Package, Filter } from 'lucide-react';
import Layout from '../components/Layout';
import ProductCard from '../components/ProductCard';
import ReservationModal from '../components/ReservationModal';
import { useAuth } from '../lib/useAuth';
import { api } from '../lib/api';

const ACCESS_TABS = [
  { value: null, label: 'Todos' },
  { value: 'NORMAL', label: 'Normal' },
  { value: 'ELITE_ACCESS', label: 'Elite Access' },
  { value: 'ELITE_PRO', label: 'Elite Pro' },
];

export default function Catalog() {
  const { isAuthed, loading: authLoading } = useAuth();
  const [items, setItems] = useState([]);
  const [eligibility, setEligibility] = useState(new Map());
  const [games, setGames] = useState([]);
  const [filter, setFilter] = useState({ access: null, game_id: null, preorder: null });
  const [loading, setLoading] = useState(true);
  const [modalProduct, setModalProduct] = useState(null);

  async function fetchData() {
    setLoading(true);
    try {
      const params = {};
      if (filter.access) params.access = filter.access;
      if (filter.game_id) params.game_id = filter.game_id;
      if (filter.preorder !== null) params.preorder = filter.preorder;

      const [products, gamesRes] = await Promise.all([
        api.get('/catalog', { params }),
        api.get('/games'),
      ]);
      setItems(products.data);
      setGames(gamesRes.data);

      if (isAuthed) {
        try {
          const elig = await api.get('/catalog/eligibility', { params });
          setEligibility(new Map(elig.data.map((e) => [e.product.id, e])));
        } catch { /* sin auth o sin perfil */ }
      } else {
        setEligibility(new Map());
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!authLoading) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAuthed, filter.access, filter.game_id, filter.preorder]);

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-6 py-10">
        <header className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-elite-violet/10 border border-elite-violet/30 mb-3">
            <Package size={12} className="text-elite-violet" />
            <span className="text-[10px] tracking-widest uppercase text-elite-violet">Catálogo</span>
          </div>
          <h1 className="font-display text-3xl font-bold">Productos y preventas</h1>
          <p className="text-white/50 mt-1 text-sm">
            Normal, Elite Access (N15+), Elite Pro (N25+). Reserva manual con aprobación admin.
          </p>
        </header>

        {/* Filtros */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-2 text-xs text-white/40">
            <Filter size={12} /> Filtros:
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ACCESS_TABS.map((tab) => (
              <button
                key={tab.label}
                onClick={() => setFilter((f) => ({ ...f, access: tab.value }))}
                className={`px-3 py-1.5 rounded-md text-xs border transition ${
                  filter.access === tab.value
                    ? 'bg-elite-violet/15 text-elite-violet border-elite-violet/40'
                    : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <select
            value={filter.game_id ?? ''}
            onChange={(e) => setFilter((f) => ({ ...f, game_id: e.target.value ? parseInt(e.target.value) : null }))}
            className="px-3 py-1.5 rounded-md bg-white/5 border border-white/10 text-xs text-white"
          >
            <option value="">Todos los juegos</option>
            {games.map((g) => <option key={g.id} value={g.id}>{g.short_name || g.name}</option>)}
          </select>
          <button
            onClick={() => setFilter((f) => ({ ...f, preorder: f.preorder === true ? null : true }))}
            className={`px-3 py-1.5 rounded-md text-xs border transition ${
              filter.preorder === true
                ? 'bg-elite-gold/15 text-elite-gold border-elite-gold/40'
                : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'
            }`}
          >
            Solo preventas
          </button>
        </div>

        {loading ? (
          <p className="text-white/40">Cargando catálogo…</p>
        ) : items.length === 0 ? (
          <p className="text-white/40">No hay productos con esos filtros.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {items.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                eligibility={eligibility.get(p.id)}
                onReserve={(prod) => {
                  if (!isAuthed) {
                    window.location.href = '/login';
                    return;
                  }
                  setModalProduct(prod);
                }}
              />
            ))}
          </div>
        )}
      </div>

      <ReservationModal
        product={modalProduct}
        onClose={() => setModalProduct(null)}
        onCreated={() => { fetchData(); }}
      />
    </Layout>
  );
}
