import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sparnutrition.app',
  appName: 'SPAR Nutrition',
  webDir: 'dist/public',
  ios: {
    // HealthKit requires these capabilities in Xcode
    // Background modes for periodic health data sync
    contentInset: 'automatic',
  },
  plugins: {
    App: {
      // Listen for app state changes to trigger HealthKit sync
    },
  },
};

export default config;
