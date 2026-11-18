import type { CapacitorConfig } from '@capacitor/cli';

// The Android app wraps the same web build (`npm run build` → dist).
// Build it with `npm run android:sync`, or let the GitHub Actions workflow
// (.github/workflows/android.yml) build an installable APK on every push.
const config: CapacitorConfig = {
  appId: 'xyz.blusat.app',
  appName: 'Blusat',
  webDir: 'dist',
  android: {
    // relays and the index are wss://, so no cleartext traffic is needed
    allowMixedContent: false,
  },
  plugins: {
    SystemBars: {
      // pad the WebView for the status and navigation bars, and expose
      // --safe-area-inset-* CSS variables as well
      insetsHandling: 'css',
      style: 'LIGHT',
    },
  },
};

export default config;
