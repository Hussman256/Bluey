import { Capacitor } from '@capacitor/core';

/**
 * True inside the Android (Capacitor) app, false in any browser.
 * Some things only work in a browser: the service worker, NIP-07 extensions,
 * and passkeys (they're tied to the web address, and the app has none).
 */
export const IS_NATIVE = Capacitor.isNativePlatform();

/**
 * Where public pages (/@name) live. In a browser that's this site; in the app
 * the page origin is a local one, so use the public web address instead.
 */
export const PUBLIC_ORIGIN = (
  (import.meta.env.VITE_PUBLIC_URL as string | undefined) || (IS_NATIVE ? 'https://blusat.vercel.app' : window.location.origin)
).replace(/\/$/, '');

/** Android back button: go back in the app, or leave it from the first screen. */
export async function setupNativeBackButton() {
  if (!IS_NATIVE) return;
  const { App } = await import('@capacitor/app');
  await App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else void App.exitApp();
  });
}
