/** Hook WebSocket con auto-reconnect, parseo JSON, heartbeat ping/pong.
 *
 * Uso:
 *   const { status, lastMessage, send } = useWebSocket(
 *     `/api/rt/ws/events/${eventId}?token=${token}`,
 *     { onMessage: (msg) => {...} }
 *   );
 *
 * status: 'connecting' | 'open' | 'closed' | 'error'
 * lastMessage: el último JSON recibido (útil si no querés callback)
 */
import { useEffect, useRef, useState, useCallback } from 'react';

export function useWebSocket(path, { onMessage, enabled = true, pingIntervalMs = 30000 } = {}) {
  const [status, setStatus] = useState('connecting');
  const [lastMessage, setLastMessage] = useState(null);
  const wsRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const pingTimerRef = useRef(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    if (!enabled || !path) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = path.startsWith('ws') ? path : `${proto}://${location.host}${path}`;
    setStatus('connecting');
    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => {
        setStatus('open');
        reconnectAttemptRef.current = 0;
        // Heartbeat
        pingTimerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, pingIntervalMs);
      };
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          setLastMessage(data);
          onMessageRef.current?.(data);
        } catch {
          /* ignore non-json */
        }
      };
      ws.onclose = () => {
        clearInterval(pingTimerRef.current);
        setStatus('closed');
        // Exponential backoff con cap.
        const attempt = ++reconnectAttemptRef.current;
        const delay = Math.min(1000 * 2 ** attempt, 15000);
        reconnectTimerRef.current = setTimeout(connect, delay);
      };
      ws.onerror = () => setStatus('error');
    } catch {
      setStatus('error');
    }
  }, [path, enabled, pingIntervalMs]);

  useEffect(() => {
    connect();
    return () => {
      clearInterval(pingTimerRef.current);
      clearTimeout(reconnectTimerRef.current);
      // Reset flag para que el onclose no reintente al desmontar.
      const ws = wsRef.current;
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [connect]);

  const send = useCallback((obj) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj));
      return true;
    }
    return false;
  }, []);

  return { status, lastMessage, send };
}
