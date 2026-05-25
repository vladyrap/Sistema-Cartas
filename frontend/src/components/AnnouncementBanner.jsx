import { useEffect, useState } from 'react';
import { Megaphone, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';
import { useGuild } from '../lib/useGuild';

const DISMISS_KEY_PREFIX = 'elitecards.dismissed_announcement_';

export default function AnnouncementBanner() {
  const { current } = useGuild();
  const [items, setItems] = useState([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!current) { setItems([]); return; }
    api.get('/announcements').then((r) => {
      const visible = r.data.filter((a) => {
        const k = DISMISS_KEY_PREFIX + a.id;
        return !localStorage.getItem(k);
      });
      setItems(visible);
      setIndex(0);
    }).catch(() => setItems([]));
  }, [current?.guild?.id]);

  if (items.length === 0) return null;

  const current_item = items[index];

  function dismiss() {
    localStorage.setItem(DISMISS_KEY_PREFIX + current_item.id, '1');
    const next = items.filter((_, i) => i !== index);
    setItems(next);
    setIndex(Math.max(0, Math.min(index, next.length - 1)));
  }

  return (
    <div className="bg-elite-violet/10 border-b border-elite-violet/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-center gap-3 text-sm">
        <Megaphone size={16} className="text-elite-violet flex-shrink-0" />
        <div className="flex-grow min-w-0">
          <p className="font-semibold text-elite-violet">{current_item.title}</p>
          {current_item.body && (
            <p className="text-xs text-white/70 truncate sm:whitespace-normal">{current_item.body}</p>
          )}
        </div>
        {items.length > 1 && (
          <div className="flex items-center gap-1 text-[10px] text-white/40 flex-shrink-0">
            <button onClick={() => setIndex((i) => (i - 1 + items.length) % items.length)} className="hover:text-white">
              <ChevronLeft size={14} />
            </button>
            <span className="font-mono">{index + 1}/{items.length}</span>
            <button onClick={() => setIndex((i) => (i + 1) % items.length)} className="hover:text-white">
              <ChevronRight size={14} />
            </button>
          </div>
        )}
        <button onClick={dismiss} className="text-white/40 hover:text-white flex-shrink-0" title="No mostrar más">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
