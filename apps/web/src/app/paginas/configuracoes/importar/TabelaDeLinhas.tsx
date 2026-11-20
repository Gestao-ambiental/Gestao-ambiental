// Linhas de uma importação (ADR-0043): Linha, as colunas da entidade e o que a tela precisa dizer
// (problemas na conferência, motivo de ter ficado ao desfazer). Rola na própria região; no
// celular vira lista.
import {
  CAMPOS_DA_IMPORTACAO,
  mensagemDoProblema,
  type EntidadeDaImportacao,
} from '@gestao-ambiental/domain'

import { Botao } from '@/components/ui/botao'
import { Icone } from '@/components/ui/icone'
import type { LinhaDaImportacao } from '@/lib/api/importacao'
import { useCelular } from '@/lib/usar-celular'
import { cn } from '@/lib/utils'

import { ROTULO_DO_MOTIVO, valorDoCampo } from './pecas'

const classeCabecalho =
  'h-10 border-b px-(--e-3) text-left rotulo-maiusculo whitespace-nowrap text-(--tinta-2)'
const classeCelula = 'h-(--linha) border-b border-(--regra-leve) px-(--e-3) align-middle'

function Observacoes({
  linha,
  entidade,
  mostrar,
}: {
  linha: LinhaDaImportacao
  entidade: EntidadeDaImportacao
  mostrar: 'problemas' | 'motivo'
}) {
  if (mostrar === 'motivo') {
    return linha.motivoMantida ? <span>{ROTULO_DO_MOTIVO[linha.motivoMantida]}</span> : null
  }
  const problemas = [
    ...linha.erros.map((p) => ({ p, erro: true })),
    ...linha.avisos.map((p) => ({ p, erro: false })),
  ]
  if (problemas.length === 0) return null
  return (
    <ul className="flex flex-col gap-(--e-05)">
      {problemas.map(({ p, erro }) => (
        <li
          key={`${p.codigo}-${p.campo ?? ''}`}
          className={cn(
            'flex items-start gap-(--e-1)',
            erro ? 'text-(--atraso-texto)' : 'text-(--alerta-texto)',
          )}
        >
          {/* Erro e aviso também pela forma do ícone e pelo nome, nunca só pela cor. */}
          <Icone
            nome={erro ? 'circle-alert' : 'triangle-alert'}
            tamanho={14}
            rotulo={erro ? 'Erro' : 'Aviso'}
            className="mt-(--e-05)"
          />
          <span>{mensagemDoProblema(p, entidade)}</span>
        </li>
      ))}
    </ul>
  )
}

export function TabelaDeLinhas({
  entidade,
  linhas,
  mostrar,
  aoCorrigir,
}: {
  entidade: EntidadeDaImportacao
  linhas: readonly LinhaDaImportacao[]
  /** Na conferência, os problemas; depois de desfazer, o motivo de a linha ter ficado. */
  mostrar: 'problemas' | 'motivo'
  aoCorrigir?: (linha: LinhaDaImportacao) => void
}) {
  const celular = useCelular()
  const campos = CAMPOS_DA_IMPORTACAO[entidade]
  const tituloDaObservacao = mostrar === 'motivo' ? 'Motivo' : 'Problemas'

  if (celular) {
    return (
      <ul className="flex flex-col" aria-label="Linhas">
        {linhas.map((linha) => {
          const nome = valorDoCampo(linha.dados, 'empreendimento') || '—'
          return (
            <li
              key={linha.numeroLinha}
              className="flex flex-col gap-(--e-1) border-b border-(--regra-leve) px-(--e-4) py-(--e-3)"
            >
              <span className="flex items-baseline gap-(--e-2)">
                <span className="rotulo numero text-(--tinta-3)">Linha {linha.numeroLinha}</span>
                <span className="min-w-0 flex-1 truncate corpo-medio">{nome}</span>
              </span>
              <span className="truncate text-xs text-(--tinta-2)">
                {campos
                  .slice(1)
                  .map((c) => valorDoCampo(linha.dados, c.campo))
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              <Observacoes linha={linha} entidade={entidade} mostrar={mostrar} />
              {aoCorrigir ? (
                <Botao
                  tamanho="compacto"
                  className="self-start"
                  aria-label={`Corrigir a linha ${String(linha.numeroLinha)}`}
                  onClick={() => {
                    aoCorrigir(linha)
                  }}
                >
                  Corrigir
                </Botao>
              ) : null}
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <div className="max-h-[calc(100dvh-360px)] min-h-40 overflow-auto">
      <table className="w-full border-collapse corpo">
        <thead className="sticky top-0 z-10 bg-(--folha)">
          <tr>
            <th scope="col" className={cn(classeCabecalho, 'text-right')}>
              Linha
            </th>
            {campos.map((c) => (
              <th key={c.campo} scope="col" className={classeCabecalho}>
                {c.rotulo}
              </th>
            ))}
            <th scope="col" className={classeCabecalho}>
              {tituloDaObservacao}
            </th>
            {aoCorrigir ? (
              <th scope="col" className={classeCabecalho}>
                <span className="sr-only">Ações</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => (
            <tr key={linha.numeroLinha} className="transicao-estado hover:bg-(--toque)">
              <td className={cn(classeCelula, 'text-right numero text-(--tinta-2)')}>
                {linha.numeroLinha}
              </td>
              {campos.map((c) => {
                const valor = valorDoCampo(linha.dados, c.campo)
                return (
                  <td
                    key={c.campo}
                    className={cn(
                      classeCelula,
                      'max-w-[220px] truncate whitespace-nowrap',
                      (c.campo === 'cnpj' || c.campo === 'emitido_em' || c.campo === 'validade') &&
                        'numero',
                    )}
                    title={valor || undefined}
                  >
                    {valor || <span className="text-(--tinta-3)">—</span>}
                  </td>
                )
              })}
              <td className={cn(classeCelula, 'min-w-[220px] py-(--e-2)')}>
                <Observacoes linha={linha} entidade={entidade} mostrar={mostrar} />
              </td>
              {aoCorrigir ? (
                <td className={cn(classeCelula, 'text-right')}>
                  <Botao
                    tamanho="compacto"
                    aria-label={`Corrigir a linha ${String(linha.numeroLinha)}`}
                    onClick={() => {
                      aoCorrigir(linha)
                    }}
                  >
                    Corrigir
                  </Botao>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
