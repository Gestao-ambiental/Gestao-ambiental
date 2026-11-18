import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const worker = readFileSync(new URL('./campo-sw.js', import.meta.url), 'utf8')

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'grama-campo-offline',
      apply: 'build',
      enforce: 'post',
      generateBundle(_, bundle) {
        // Só código e recursos do build. Dados e fotos ficam no IndexedDB, por vínculo.
        const arquivos = [
          '/index.html',
          '/tema-inicial.js',
          ...Object.keys(bundle)
            .filter((nome) => nome.startsWith('assets/') && !nome.startsWith('assets/pdf.worker'))
            .map((nome) => '/' + nome),
        ].sort()
        const versao = createHash('sha256')
          .update(worker)
          .update(JSON.stringify(arquivos))
          .update(readFileSync(new URL('./index.html', import.meta.url)))
          .digest('hex')
          .slice(0, 16)
        this.emitFile({
          type: 'asset',
          fileName: 'campo-sw.js',
          source: worker
            .replace('__VERSAO__', versao)
            .replace("['__ARQUIVOS__']", JSON.stringify(arquivos)),
        })
      },
    },
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
  },
})
