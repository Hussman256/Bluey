import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: {
      ...minimal2023Preset.maskable,
      resizeOptions: { background: '#f3f6fa' },
    },
    apple: {
      ...minimal2023Preset.apple,
      resizeOptions: { background: '#f3f6fa' },
    },
  },
  images: ['public/logo.svg'],
})
