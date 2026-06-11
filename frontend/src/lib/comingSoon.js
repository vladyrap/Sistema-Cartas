/**
 * Coming Soon — fetcher con cache global.
 *
 * El backend devuelve una lista de páginas marcadas. La cacheamos en memoria
 * + sessionStorage para que el gate sea instantáneo entre navegaciones.
 *
 * Match: comparamos el pathname normalizado (case-insensitive, sin trailing /)
 * contra la ruta marcada. Si la ruta termina con un path-param (ej `/events/:id`),
 * convertimos a regex.
 */
import { api } from './api';

const CACHE_KEY = 'ec_coming_soon_v1';
const TTL_MS = 60_000;  // 1 min — cambios admin se ven en <1 min

let cache = null;        // { items, fetchedAt }
let pendingFetch = null;

function loadFromSession() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj?.fetchedAt || Date.now() - obj.fetchedAt > TTL_MS) return null;
    return obj;
  } catch { return null; }
}

function saveToSession(obj) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(obj)); } catch {}
}

export async function fetchComingSoon(force = false) {
  if (!force) {
    if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache.items;
    const persisted = loadFromSession();
    if (persisted) { cache = persisted; return cache.items; }
  }
  if (pendingFetch) return pendingFetch;
  pendingFetch = api.get('/api/coming-soon/list')
    .then(r => {
      cache = { items: r.data || [], fetchedAt: Date.now() };
      saveToSession(cache);
      return cache.items;
    })
    .catch(() => {
      cache = { items: [], fetchedAt: Date.now() };
      return [];
    })
    .finally(() => { pendingFetch = null; });
  return pendingFetch;
}

export function invalidateCache() {
  cache = null;
  try { sessionStorage.removeItem(CACHE_KEY); } catch {}
}

function normalizePath(p) {
  if (!p) return '';
  let x = p.toLowerCase();
  if (x.length > 1 && x.endsWith('/')) x = x.slice(0, -1);
  return x;
}

/**
 * Convierte una ruta marcada (puede tener :param) en regex.
 * /events/:id → ^/events/[^/]+$
 * /admin/events/:id/health → ^/admin/events/[^/]+/health$
 */
function routeToRegex(route) {
  const escaped = route
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/:[a-zA-Z_][\w]*/g, '[^/]+');
  return new RegExp(`^${escaped}$`, 'i');
}

/**
 * Dado el pathname actual, devuelve la entrada de Coming Soon que matchea, o null.
 */
export function matchComingSoon(currentPath, items) {
  if (!items?.length) return null;
  const path = normalizePath(currentPath);
  for (const it of items) {
    if (!it.is_enabled) continue;
    const routeNorm = normalizePath(it.route);
    if (routeNorm === path) return it;
    if (routeNorm.includes(':')) {
      try {
        if (routeToRegex(routeNorm).test(path)) return it;
      } catch {}
    }
  }
  return null;
}
