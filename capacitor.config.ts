import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.ocstudio.app',
  appName: 'OC Studio',
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
