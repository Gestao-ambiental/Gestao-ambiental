import { formatarDataCivil, type SituacaoExibida } from '@gestao-ambiental/domain'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { Botao } from '@/components/ui/botao'
import { CarrosselImagens, type ImagemDoCarrossel } from '@/components/ui/carrossel-imagens'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { cancelarEnvio, type Evidencia, type Ocorrencia } from '@/lib/api/ocorrencias'
import { mensagemDoErro } from '@/lib/erros'

import { diaEHora, envioParaRetomar, janelaDaOcorrencia } from './apoio'
import { ehImagem } from './dados'
import { FormularioDeEnvio } from './FormularioDeEnvio'
import { ListaAnexos } from './ListaAnexos'

/** Aviso da devolução no topo da seção: quem devolveu, quando e o motivo. */
export function AvisoDevolucao({ evidencia, fuso }: { evidencia: Evidencia; fuso: string }) {
  const conferencia = evidencia.conferencia
  if (conferencia?.decisao !== 'devolvida') return null
  return (
    <MensagemSecao
      tom="atencao"
      titulo={`Devolvida por ${conferencia.conferenteNome} · ${diaEHora(conferencia.em, fuso)}`}
    >
      {conferencia.motivo}
    </MensagemSecao>
  )
}

/**
 * Evidência (Tela 16 v2, seções 5 a 7). A fazer e Devolvida: formulário de envio. Em conferência
 * e Aprovada: leitura, com "Cancelar envio" para quem enviou enquanto ninguém conferiu.
 */
export function SecaoEvidencia({
  ocorrencia,
  exibida,
  ultima,
  membroId,
  fuso,
  urls,
  aoMudar,
}: {
  ocorrencia: Ocorrencia
  exibida: SituacaoExibida
  ultima: Evidencia | undefined
  membroId: string
  fuso: string
  urls: ReadonlyMap<string, string>
  aoMudar: () => Promise<void>
}) {
  const emLeitura = exibida === 'em_conferencia' || exibida === 'aprovada'
  const devolvida = exibida === 'devolvida'

  return (
    <section aria-labelledby="titulo-evidencia" className="flex flex-col gap-(--space-200)">
      {devolvida && ultima ? <AvisoDevolucao evidencia={ultima} fuso={fuso} /> : null}
      {emLeitura && ultima ? (
        <EnvioEmLeitura
          evidencia={ultima}
          podeCancelar={
            exibida === 'em_conferencia' &&
            ultima.situacao === 'em_conferencia' &&
            ultima.enviadaPorId === membroId
          }
          fuso={fuso}
          urls={urls}
          aoMudar={aoMudar}
        />
      ) : (
        <>
          <h2 id="titulo-evidencia" className="titulo-secao">
            Evidência
          </h2>
          <FormularioDeEnvio
            key={ultima?.id ?? 'primeiro'}
            ocorrencia={ocorrencia}
            janela={janelaDaOcorrencia(ocorrencia)}
            anterior={envioParaRetomar(ultima)}
            rotuloBotao={devolvida ? 'Reenviar para conferência' : 'Enviar para conferência'}
            urls={urls}
            aoEnviar={aoMudar}
          />
        </>
      )}
    </section>
  )
}

function EnvioEmLeitura({
  evidencia,
  podeCancelar,
  fuso,
  urls,
  aoMudar,
}: {
  evidencia: Evidencia
  podeCancelar: boolean
  fuso: string
  urls: ReadonlyMap<string, string>
  aoMudar: () => Promise<void>
}) {
  const [carrossel, setCarrossel] = useState<number | null>(null)
  const cancelar = useMutation({
    mutationFn: () => cancelarEnvio(evidencia.id),
    onSuccess: aoMudar,
  })
  const imagens: ImagemDoCarrossel[] = evidencia.arquivos.flatMap((a) => {
    const url = ehImagem(a.mime) ? urls.get(a.caminho) : undefined
    return url ? [{ id: a.versaoId, nome: a.nome, url }] : []
  })

  return (
    <>
      <div className="flex flex-wrap items-center gap-(--space-150)">
        <h2 id="titulo-evidencia" className="flex-1 titulo-secao">
          Evidência
        </h2>
        <span className="text-xs text-(--text-subtle)">
          Enviada em {diaEHora(evidencia.enviadaEm, fuso)}
        </span>
        {podeCancelar ? (
          <Botao
            tamanho="compacto"
            aria-busy={cancelar.isPending || undefined}
            onClick={() => {
              if (!cancelar.isPending) cancelar.mutate()
            }}
          >
            Cancelar envio
          </Botao>
        ) : null}
      </div>
      {cancelar.isError ? (
        <MensagemSecao role="alert" tom="perigo">
          {mensagemDoErro(cancelar.error)}
        </MensagemSecao>
      ) : null}
      <ListaAnexos
        rotulo="Arquivos enviados"
        itens={evidencia.arquivos.map((a) => ({
          chave: a.versaoId,
          nome: a.nome,
          tamanho: a.tamanho,
          miniaturaUrl: ehImagem(a.mime) ? (urls.get(a.caminho) ?? null) : null,
          caminho: a.caminho,
        }))}
        aoAbrirImagem={(chave) => {
          setCarrossel(imagens.findIndex((imagem) => imagem.id === chave))
        }}
      />
      <dl className="grid grid-cols-[132px_minmax(0,1fr)] gap-x-(--space-200) gap-y-(--space-100) corpo max-md:grid-cols-1 max-md:gap-y-(--space-025)">
        <dt className="text-(--text-subtle)">Data de execução</dt>
        <dd>{formatarDataCivil(evidencia.dataExecucao)}</dd>
        <dt className="text-(--text-subtle)">Observações</dt>
        <dd className="whitespace-pre-line">{evidencia.observacoes ?? '—'}</dd>
      </dl>
      <CarrosselImagens imagens={imagens} indice={carrossel} aoMudarIndice={setCarrossel} />
    </>
  )
}
