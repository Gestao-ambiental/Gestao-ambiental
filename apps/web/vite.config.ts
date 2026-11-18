import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const worker = readFileSync(new URL('./grama-sw.js', import.meta.url), 'utf8')

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'grama-instalavel',
      apply: 'build',
      enforce: 'post',
      generateBundle(_, bundle) {
        // Só o shell estático: API, respostas autenticadas e URLs assinadas ficam fora do cache.
        const arquivos = [
          '/index.html',
          '/tema-inicial.js',
          ...Object.keys(bundle)
            .filter(
              (nome) => nome.startsWith('assets/') && !/^assets\/pdf(?:-|\.worker)/.test(nome),
            )
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
          fileName: 'grama-sw.js',
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
