import { useEffect, useState } from 'react';
import { auth } from './auth';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.isAuthed()) {
      setLoading(false);
      return;
    }
    auth.me().then(setUser).catch(() => auth.clear()).finally(() => setLoading(false));
  }, []);

  return { user, loading, isAuthed: !!user, logout: auth.logout };
}
