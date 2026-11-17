import {
  formatarDataCivil,
  rotuloDaSituacaoDoAlvara,
  situacaoDoAlvara,
  type DataCivil,
  type SituacaoDoAlvara,
} from '@gestao-ambiental/domain'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Carregando, EstadoErro } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Selo, type TomSelo } from '@/components/ui/selo'
import { excluirAlvara, listarAlvarasDoEmpreendimento, type Alvara } from '@/lib/api/alvaras'
import type { Unidade } from '@/lib/api/empreendimentos'
import { urlDoPdf } from '@/lib/api/licencas'
import { mensagemDoErro } from '@/lib/erros'

import { DialogoAlvara, type ModoDoAlvara } from './DialogoAlvara'

const TOM: Record<SituacaoDoAlvara, TomSelo> = {
  vigente: 'sucesso',
  vencido: 'perigo',
  renovado: 'padrao',
}

/**
 * Alvarás do empreendimento (ALV-01 e ALV-02). Todos ficam na lista, inclusive os renovados (com o
 * PDF), do mais novo para o mais antigo. Só a Gestão cadastra, renova, edita e exclui.
 */
export function SecaoAlvaras({
  empreendimentoId,
  unidades,
  hoje,
  ehGestao,
}: {
  empreendimentoId: string
  unidades: readonly Unidade[]
  hoje: DataCivil
  ehGestao: boolean
}) {
  const { atual } = useConsultoria()
  const queryClient = useQueryClient()
  const [modo, setModo] = useState<ModoDoAlvara | null>(null)

  const alvaras = useQuery({
    queryKey: ['alvaras', empreendimentoId],
    queryFn: () => listarAlvarasDoEmpreendimento(empreendimentoId),
  })

  async function atualizar() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['alvaras', empreendimentoId] }),
      queryClient.invalidateQueries({ queryKey: ['prazos'] }),
    ])
  }

  const abrirPdf = useMutation({
    mutationFn: urlDoPdf,
    onSuccess: (url) => {
      window.open(url, '_blank', 'noopener,noreferrer')
    },
  })
  const excluir = useMutation({ mutationFn: excluirAlvara, onSuccess: atualizar })
  const erro = abrirPdf.error ?? excluir.error

  function descricao(alvara: Alvara) {
    return alvara.numero ? `Alvará ${alvara.numero}` : 'Alvará sem número'
  }

  return (
    <section aria-labelledby="titulo-alvaras" className="flex flex-col gap-(--space-100)">
      <div className="flex items-center gap-(--space-100)">
        <h2 id="titulo-alvaras" className="titulo-secao flex-1 text-(--text)">
          Alvarás
        </h2>
        {ehGestao ? (
          <Botao
            iconeAntes="plus"
            disabled={unidades.length === 0}
            onClick={() => {
              setModo({ tipo: 'novo' })
            }}
          >
            Novo alvará
          </Botao>
        ) : null}
      </div>
      {erro ? (
        <MensagemSecao role="alert" tom="perigo">
          {mensagemDoErro(erro)}
        </MensagemSecao>
      ) : null}
      {alvaras.isPending ? (
        <Carregando rotulo="Carregando alvarás" linhas={2} />
      ) : alvaras.isError ? (
        <EstadoErro
          titulo="Não foi possível carregar os alvarás."
          aoTentarDeNovo={() => void alvaras.refetch()}
        />
      ) : alvaras.data.length === 0 ? (
        <p className="corpo text-(--text-subtle)">Nenhum alvará cadastrado.</p>
      ) : (
        <ul className="flex flex-col rounded-(--radius-large) border bg-(--surface) shadow-cartao">
          {alvaras.data.map((alvara) => {
            const situacao = situacaoDoAlvara(alvara, hoje)
            return (
              <li
                key={alvara.id}
                className="flex flex-wrap items-center gap-(--space-150) border-b px-(--space-150) py-(--space-100) last:border-b-0"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="corpo-medio text-(--text)">{descricao(alvara)}</span>
                  <span className="rotulo">
                    {[
                      alvara.unidadeNome,
                      alvara.orgao,
                      `válido até ${formatarDataCivil(alvara.validade)}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  {alvara.notas ? <span className="rotulo">{alvara.notas}</span> : null}
                </div>
                <Selo tom={TOM[situacao]}>{rotuloDaSituacaoDoAlvara(situacao)}</Selo>
                <div className="flex flex-wrap gap-(--space-050)">
                  {alvara.pdf ? (
                    <Botao
                      tamanho="compacto"
                      aparencia="sutil"
                      iconeAntes="file-text"
                      aria-label={`Abrir PDF do ${descricao(alvara)}`}
                      disabled={abrirPdf.isPending}
                      onClick={() => {
                        if (alvara.pdf) abrirPdf.mutate(alvara.pdf.caminho)
                      }}
                    >
                      PDF
                    </Botao>
                  ) : null}
                  {ehGestao && !alvara.renovado ? (
                    <>
                      <Botao
                        tamanho="compacto"
                        aria-label={`Renovar ${descricao(alvara)}`}
                        onClick={() => {
                          setModo({ tipo: 'renovar', anterior: alvara })
                        }}
                      >
                        Renovar
                      </Botao>
                      <Botao
                        tamanho="compacto"
                        aparencia="sutil"
                        aria-label={`Editar ${descricao(alvara)}`}
                        onClick={() => {
                          setModo({ tipo: 'editar', alvara })
                        }}
                      >
                        Editar
                      </Botao>
                      <Botao
                        tamanho="compacto"
                        aparencia="sutil"
                        aria-label={`Excluir ${descricao(alvara)}`}
                        disabled={excluir.isPending}
                        onClick={() => {
                          excluir.mutate(alvara)
                        }}
                      >
                        Excluir
                      </Botao>
                    </>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {modo ? (
        <DialogoAlvara
          modo={modo}
          consultoriaId={atual.consultoriaId}
          unidades={unidades}
          hoje={hoje}
          aoFechar={() => {
            setModo(null)
          }}
          aoSalvar={async () => {
            setModo(null)
            await atualizar()
          }}
        />
      ) : null}
    </section>
  )
}
