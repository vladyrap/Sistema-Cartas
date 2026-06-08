/** Hook que conecta a /api/rt/ws/presence/events/{id} para multiplexar cursors + reactions. */
import { useEffect, useRef, useState } from 'react';

export function usePresence({ eventId, alias, enabled = true }) {
  const [peers, setPeers] = useState({}); // id → {alias, hue, x, y}
  const [selfId, setSelfId] = useState(null);
  const [reactions, setReactions] = useState([]); // {id, presence_id, emoji, x, y}
  const wsRef = useRef(null);
  const lastSentRef = useRef(0);

  useEffect(() => {
    if (!enabled || !eventId) return;
    const token = localStorage.getItem('ec_access_token');
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    if (alias) params.set('alias', alias);
    const url = `${proto}://${location.host}/api/rt/ws/presence/events/${eventId}?${params}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.type === 'presence_snapshot') {
        setSelfId(msg.self_id);
        const initial = {};
        for (const p of msg.peers || []) initial[p.id] = p;
        setPeers(initial);
      } else if (msg.type === 'presence_join') {
        setPeers(prev => ({ ...prev, [msg.presence_id]: { alias: msg.alias, hue: msg.hue, x: 0, y: 0 } }));
      } else if (msg.type === 'presence_leave') {
        setPeers(prev => {
          const cp = { ...prev };
          delete cp[msg.presence_id];
          return cp;
        });
      } else if (msg.type === 'cursor') {
        setPeers(prev => {
          if (!prev[msg.presence_id]) return prev;
          return { ...prev, [msg.presence_id]: { ...prev[msg.presence_id], x: msg.x, y: msg.y } };
        });
      } else if (msg.type === 'reaction') {
        const r = { id: Math.random().toString(36).slice(2), ...msg };
        setReactions(prev => [...prev, r].slice(-30));
        setTimeout(() => {
          setReactions(prev => prev.filter(x => x.id !== r.id));
        }, 2400);
      }
    };

    return () => {
      try { ws.close(); } catch {}
    };
  }, [eventId, alias, enabled]);

  function sendCursor(x, y, scope = 'page') {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const now = performance.now();
    // Throttle 30ms
    if (now - lastSentRef.current < 30) return;
    lastSentRef.current = now;
    ws.send(JSON.stringify({ type: 'cursor', x, y, scope }));
  }

  function sendReaction(emoji) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    // Posición aleatoria en la parte inferior
    const x = 20 + Math.random() * 60;
    const y = 80 + Math.random() * 15;
    ws.send(JSON.stringify({ type: 'reaction', emoji, x, y }));
    // Mostrar local también
    setReactions(prev => [...prev, { id: Math.random().toString(36).slice(2), emoji, x, y, presence_id: selfId }].slice(-30));
  }

  return { peers, selfId, reactions, sendCursor, sendReaction };
}
