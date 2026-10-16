import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [vue(), {
    name: 'playtest-build-marker',
    generateBundle() {
      if (mode === 'playtest') this.emitFile({ type: 'asset', fileName: 'playtest-build.json', source: JSON.stringify({ criticalFaultPlaytest: true }) })
    },
  }],
  test: {
    environment: 'node',
  },
}))
