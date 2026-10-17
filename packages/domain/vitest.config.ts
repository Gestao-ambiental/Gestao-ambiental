import { defineConfig } from 'vitest/config'

// A mesma suíte roda em fusos diferentes: nenhum cálculo de data pode depender do fuso da máquina
// (ADR-0009). Pacific/Kiritimati (UTC+14) pega quem assume "meio-dia UTC ainda é o mesmo dia".
const FUSOS = ['UTC', 'America/Sao_Paulo', 'Pacific/Kiritimati']

export default defineConfig({
  test: {
    projects: FUSOS.map((fuso) => ({
      test: {
        name: `domínio TZ=${fuso}`,
        include: ['src/**/*.test.ts'],
        environment: 'node',
        env: { TZ: fuso },
      },
    })),
  },
})
