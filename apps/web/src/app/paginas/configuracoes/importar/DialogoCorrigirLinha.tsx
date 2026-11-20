// "Corrigir" uma linha da conferência (ADR-0043): os campos da linha num diálogo; salvar envia só
// esta linha (a mesma normalização da planilha, CPF apagado) e confere a importação de novo.
import {
  CAMPOS_DA_IMPORTACAO,
  formatarDataCivil,
  mensagemDoProblema,
  montarDadosDaLinha,
  validarLinha,
  type CampoDaImportacao,
  type DataCivil,
  type EntidadeDaImportacao,
  type MapeamentoDeColunas,
} from '@gestao-ambiental/domain'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { Botao } from '@/components/ui/botao'
import { CampoTexto } from '@/components/ui/campo-texto'
import { Dialogo } from '@/components/ui/dialogo'
import {
  conferirImportacao,
  enviarLinhasDaImportacao,
  type LinhaDaImportacao,
} from '@/lib/api/importacao'
import { mensagemDoErroDaImportacao } from '@/lib/erros'

import { valorDoCampo } from './pecas'

/** Os campos do diálogo, como uma planilha de uma linha só (cabeçalho = o próprio campo). */
function dadosDoFormulario(
  entidade: EntidadeDaImportacao,
  numeroLinha: number,
  valores: Partial<Record<CampoDaImportacao, string>>,
) {
  const campos = CAMPOS_DA_IMPORTACAO[entidade].map((c) => c.campo)
  const mapeamento = Object.fromEntries(campos.map((c) => [c, c])) as MapeamentoDeColunas
  return montarDadosDaLinha(entidade, mapeamento, campos, {
    numeroLinha,
    celulas: campos.map((c) => ({ valor: valores[c] ?? '', texto: valores[c] ?? '' })),
  })
}

export function DialogoCorrigirLinha({
  importacaoId,
  entidade,
  linha,
  hoje,
  aoFechar,
  aoSalvar,
}: {
  importacaoId: string
  entidade: EntidadeDaImportacao
  linha: LinhaDaImportacao
  hoje: DataCivil
  aoFechar: () => void
  aoSalvar: () => Promise<unknown>
}) {
  const campos = CAMPOS_DA_IMPORTACAO[entidade]
  const [valores, setValores] = useState<Partial<Record<CampoDaImportacao, string>>>(() =>
    Object.fromEntries(
      campos.map((c) => {
        // Data lida vai como dd/mm/aaaa (o texto original pode ser o número de série do Excel).
        const data =
          c.campo === 'emitido_em' || c.campo === 'validade' ? linha.dados[c.campo] : null
        return [c.campo, data ? formatarDataCivil(data) : valorDoCampo(linha.dados, c.campo)]
      }),
    ),
  )
  const dados = dadosDoFormulario(entidade, linha.numeroLinha, valores)
  // Só os erros de formato; os do banco (duplicidade, tipo, unidade) voltam ao conferir.
  const { erros } = validarLinha(entidade, dados, hoje)
  const erroDo = (campo: CampoDaImportacao) => {
    const problema = erros.find((e) => e.campo === campo)
    return problema ? mensagemDoProblema(problema, entidade) : undefined
  }

  const salvar = useMutation({
    mutationFn: async () => {
      await enviarLinhasDaImportacao(importacaoId, [{ numeroLinha: linha.numeroLinha, dados }])
      await conferirImportacao(importacaoId)
    },
    onSuccess: async () => {
      await aoSalvar()
      aoFechar()
    },
  })

  return (
    <Dialogo
      aberto
      aoMudar={(aberto) => {
        if (!aberto && !salvar.isPending) aoFechar()
      }}
      titulo={`Corrigir a linha ${String(linha.numeroLinha)}`}
      largura={560}
      acoes={
        <>
          <Botao disabled={salvar.isPending} onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            aparencia="primario"
            disabled={salvar.isPending}
            onClick={() => {
              salvar.mutate()
            }}
          >
            Salvar e conferir
          </Botao>
        </>
      }
    >
      <div className="grid gap-(--e-3) sm:grid-cols-2">
        {campos.map(({ campo, rotulo }) => (
          <CampoTexto
            key={campo}
            rotulo={rotulo}
            value={valores[campo] ?? ''}
            erro={erroDo(campo)}
            onChange={(evento) => {
              const valor = evento.target.value
              setValores((atuais) => ({ ...atuais, [campo]: valor }))
            }}
          />
        ))}
      </div>
      {salvar.isError ? (
        <p role="alert" className="text-(--atraso-texto)">
          {mensagemDoErroDaImportacao(salvar.error)}
        </p>
      ) : null}
    </Dialogo>
  )
}
