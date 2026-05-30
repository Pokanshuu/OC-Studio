import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.ocstudio.app',
  appName: 'OCStudio',
  webDir: 'out',
  android: {
    allowMixedContent: true,
  },
  ios: {
    scheme: 'capacitor',
  },
  plugins: {
    Keyboard: {
      resizeOnFullScreen: true,
    },
  },
}

export default config
