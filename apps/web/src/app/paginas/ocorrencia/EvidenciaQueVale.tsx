import { formatarDataCivil } from '@gestao-ambiental/domain'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { Botao } from '@/components/ui/botao'
import { BotaoIcone } from '@/components/ui/botao-icone'
import { Icone } from '@/components/ui/icone'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Selo } from '@/components/ui/selo'
import {
  conferirArquivo,
  obterEvidenciaAprovada,
  urlDoArquivo,
  type EvidenciaAprovada,
} from '@/lib/api/ocorrencias'
import { formatarInstanteComHora } from '@/lib/datas'
import { mensagemDoErro } from '@/lib/erros'

/** SHA-256 abreviado: 8 primeiros e 4 últimos caracteres. */
function hashAbreviado(sha256: string): string {
  return sha256.length > 12 ? `${sha256.slice(0, 8)}…${sha256.slice(-4)}` : sha256
}

function SeloDoArquivo({ confere }: { confere: boolean | null }) {
  if (confere === true) return <Selo tom="sucesso">Arquivo conferido</Selo>
  if (confere === false) return <Selo tom="perigo">Arquivo diverge do enviado</Selo>
  return <Selo tom="revisao">Arquivo não conferido</Selo>
}

function Hash({ sha256 }: { sha256: string }) {
  const [copia, setCopia] = useState<'copiado' | 'falhou' | null>(null)
  async function copiar() {
    try {
      await navigator.clipboard.writeText(sha256)
      setCopia('copiado')
    } catch {
      setCopia('falhou')
    }
  }
  return (
    <span className="flex items-center gap-(--e-1)">
      <span className="text-xs text-(--tinta-2)">SHA-256</span>
      <code className="text-xs text-(--tinta) numero" title={sha256}>
        {hashAbreviado(sha256)}
      </code>
      <BotaoIcone
        icone={copia === 'copiado' ? 'check' : 'copy'}
        rotulo="Copiar SHA-256"
        tamanho="compacto"
        onClick={() => void copiar()}
      />
      <span role="status" className="text-xs text-(--tinta-2)">
        {copia === 'copiado' ? 'Copiado' : copia === 'falhou' ? 'Não foi possível copiar' : ''}
      </span>
    </span>
  )
}

function Destaque({
  evidencia,
  fuso,
  aoMudar,
}: {
  evidencia: EvidenciaAprovada
  fuso: string
  aoMudar: () => Promise<void>
}) {
  const baixar = useMutation({
    mutationFn: () => urlDoArquivo(evidencia.caminho),
    onSuccess: (url) => {
      window.open(url, '_blank', 'noopener,noreferrer')
    },
  })
  const conferir = useMutation({
    mutationFn: () => conferirArquivo(evidencia.versaoId),
    onSuccess: aoMudar,
  })
  const erro = baixar.error ?? conferir.error

  return (
    <section
      aria-labelledby="titulo-evidencia-aprovada"
      className="flex flex-col gap-(--e-2) rounded-(--raio-painel) border border-(--regra-forte) bg-(--folha) p-(--e-4)"
    >
      <h2
        id="titulo-evidencia-aprovada"
        className="flex flex-wrap items-center gap-(--e-2) corpo-medio text-(--tinta)"
      >
        <Icone nome="file-check" className="text-(--icone-2)" />
        <span className="numero">Aprovada: v{evidencia.numero}</span>
      </h2>
      <p className="corpo text-(--tinta) numero">
        Enviada por {evidencia.enviadaPorNome} em{' '}
        {formatarInstanteComHora(evidencia.enviadaEm, fuso)}
        {evidencia.conferenteNome && evidencia.conferidaEm ? (
          <>
            {' '}
            · conferida por {evidencia.conferenteNome} em{' '}
            {formatarInstanteComHora(evidencia.conferidaEm, fuso)}
          </>
        ) : null}{' '}
        · execução {formatarDataCivil(evidencia.dataExecucao)}
      </p>
      {evidencia.concluidaPorNome && evidencia.concluidaEm ? (
        <p className="corpo text-(--tinta) numero">
          Concluída por {evidencia.concluidaPorNome} em{' '}
          {formatarInstanteComHora(evidencia.concluidaEm, fuso)}, com esta versão
        </p>
      ) : null}
      {erro ? (
        <MensagemSecao role="alert" tom="perigo">
          {mensagemDoErro(erro)}
        </MensagemSecao>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-(--e-3) gap-y-(--e-2)">
        <Botao
          tamanho="compacto"
          iconeAntes="download"
          disabled={baixar.isPending}
          onClick={() => {
            baixar.mutate()
          }}
        >
          Baixar {evidencia.nomeOriginal}
        </Botao>
        <SeloDoArquivo confere={evidencia.arquivoConfere} />
        {evidencia.arquivoConfere === null ? (
          <Botao
            tamanho="compacto"
            aparencia="sutil"
            disabled={conferir.isPending}
            onClick={() => {
              conferir.mutate()
            }}
          >
            {conferir.isPending ? 'Conferindo…' : 'Conferir arquivo'}
          </Botao>
        ) : null}
        <Hash sha256={evidencia.sha256} />
      </div>
    </section>
  )
}

/**
 * Destaque no topo da ocorrência: qual versão da evidência vale, quem enviou, quem conferiu, quem
 * concluiu, o arquivo para baixar e o hash conferido no servidor. Some enquanto não há aprovada.
 */
export function EvidenciaQueVale({ ocorrenciaId, fuso }: { ocorrenciaId: string; fuso: string }) {
  const queryClient = useQueryClient()
  const aprovada = useQuery({
    queryKey: ['ocorrencia', ocorrenciaId, 'evidencia-aprovada'],
    queryFn: () => obterEvidenciaAprovada(ocorrenciaId),
  })

  if (aprovada.isError) {
    return (
      <MensagemSecao role="alert" tom="perigo">
        Não foi possível carregar a evidência aprovada.{' '}
        <Botao aparencia="link" onClick={() => void aprovada.refetch()}>
          Tentar de novo
        </Botao>
      </MensagemSecao>
    )
  }
  if (!aprovada.data) return null
  return (
    <Destaque
      evidencia={aprovada.data}
      fuso={fuso}
      aoMudar={() => queryClient.invalidateQueries({ queryKey: ['ocorrencia', ocorrenciaId] })}
    />
  )
}
