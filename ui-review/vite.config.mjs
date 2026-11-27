import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const reviewManifest = {
  name: 'review-manifest',
  generateBundle: {
    order: 'post',
    handler(_options, bundle) {
      const files = Object.values(bundle)
      const entry = files.find(file => file.type === 'chunk' && file.isEntry)
      const stylesheet = files.find(file => file.type === 'asset' && file.fileName.endsWith('.css'))
      if (!entry || !stylesheet) this.error('The review build must emit an entry and a stylesheet.')
      this.emitFile({
        type: 'asset',
        fileName: 'review-manifest.json',
        source: JSON.stringify({ entry: entry.fileName, stylesheet: stylesheet.fileName }),
      })
    },
  },
}

export default defineConfig({
  base: '/ui-assets/',
  plugins: [tailwindcss(), reviewManifest],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  esbuild: { jsx: 'automatic' },
  build: {
    outDir: '../static/ui-assets',
    emptyOutDir: true,
    cssCodeSplit: false,
    reportCompressedSize: false,
    rollupOptions: {
      input: fileURLToPath(new URL('./entry.ts', import.meta.url)),
      onwarn(warning, warn) {
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && warning.message.includes('"use client"')) return
        warn(warning)
      },
    },
  },
})
