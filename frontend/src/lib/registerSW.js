/** Registra el service worker y expone helpers para push notifications. */

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  if (import.meta.env.DEV) return null; // no registrar en dev para evitar cache aggressive
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    return reg;
  } catch (e) {
    console.warn('SW register failed', e);
    return null;
  }
}

export async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return await Notification.requestPermission();
}

export async function showLocalNotification(title, options = {}) {
  if (Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.getRegistration();
  if (reg) reg.showNotification(title, options);
  else new Notification(title, options);
  return true;
}
