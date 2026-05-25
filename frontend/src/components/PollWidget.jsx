import { useEffect, useState } from 'react';
import { Vote, Check } from 'lucide-react';
import { api } from '../lib/api';
import { useGuild } from '../lib/useGuild';

export default function PollWidget() {
  const { current } = useGuild();
  const [polls, setPolls] = useState([]);
  const [voting, setVoting] = useState(null);

  useEffect(() => {
    if (!current) return;
    api.get('/polls').then((r) => {
      setPolls(r.data.filter((p) => p.is_active));
    }).catch(() => {});
  }, [current?.guild?.id]);

  if (!current || polls.length === 0) return null;

  async function vote(pollId, optionId) {
    setVoting(`${pollId}:${optionId}`);
    try {
      const r = await api.post(`/polls/${pollId}/vote/${optionId}`);
      setPolls((all) => all.map((p) => p.id === pollId ? r.data : p));
    } catch { /* silent */ } finally { setVoting(null); }
  }

  return (
    <div className="p-4 rounded-2xl bg-elite-violet/5 border border-elite-violet/30">
      <div className="flex items-center gap-2 mb-3">
        <Vote size={14} className="text-elite-violet" />
        <p className="text-[10px] tracking-widest uppercase text-white/40">Encuestas activas</p>
      </div>
      <div className="space-y-4">
        {polls.map((p) => {
          const total = p.options.reduce((s, o) => s + o.vote_count, 0);
          const voted = p.my_vote_option_id !== null;
          return (
            <div key={p.id}>
              <p className="text-sm font-semibold mb-2">{p.question}</p>
              <div className="space-y-1">
                {p.options.map((o) => {
                  const pct = total > 0 ? (o.vote_count / total) * 100 : 0;
                  const isMine = o.id === p.my_vote_option_id;
                  return (
                    <button
                      key={o.id}
                      onClick={() => vote(p.id, o.id)}
                      disabled={voting !== null}
                      className={`w-full relative rounded-md text-xs px-3 py-1.5 text-left border transition ${
                        isMine
                          ? 'border-elite-violet/60 bg-elite-violet/15'
                          : 'border-bg-border bg-bg-surface hover:border-elite-violet/40'
                      } disabled:opacity-60`}
                    >
                      <div className="flex items-center justify-between relative z-10">
                        <span className="flex items-center gap-1.5">
                          {isMine && <Check size={11} className="text-elite-violet" />}
                          {o.text}
                        </span>
                        {voted && (
                          <span className="font-mono text-white/60">{o.vote_count} · {pct.toFixed(0)}%</span>
                        )}
                      </div>
                      {voted && (
                        <div className="absolute inset-0 rounded-md bg-elite-violet/10" style={{ clipPath: `polygon(0 0, ${pct}% 0, ${pct}% 100%, 0 100%)` }} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
