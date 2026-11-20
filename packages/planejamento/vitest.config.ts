import { defineConfig } from 'vitest/config'

// O motor não usa Date nem relógio; a suíte roda em três fusos para provar isso.
const FUSOS = ['UTC', 'America/Sao_Paulo', 'Pacific/Kiritimati']

export default defineConfig({
  test: {
    projects: FUSOS.map((fuso) => ({
      test: {
        name: `planejamento TZ=${fuso}`,
        include: ['src/**/*.test.ts'],
        environment: 'node',
        env: { TZ: fuso },
      },
    })),
  },
})
