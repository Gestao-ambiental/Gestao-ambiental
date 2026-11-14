// Roda os testes pgTAP de supabase/tests num Postgres em memória, quando o executor local existe.
// Sem ele (máquina sem ferramentas-locais/pg), avisa e deixa a checagem do banco para o CI.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const executor = join(raiz, 'ferramentas-locais', 'pg', 'rodar.mjs')

if (!existsSync(executor)) {
  console.warn(
    'Testes do banco: executor local não encontrado; o job "banco" do CI cobre esta parte.',
  )
  process.exit(0)
}

const resultado = spawnSync(process.execPath, [executor, raiz], { stdio: 'inherit' })
process.exit(resultado.status ?? 1)
