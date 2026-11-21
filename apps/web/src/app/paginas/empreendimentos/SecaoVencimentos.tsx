// Seção "Vencimentos" do empreendimento (ADR-0046): alvará, ART, CTF IBAMA, outorga, AVCB, certidão.
// Quadro com o vigente de cada série primeiro (validade mais próxima em cima) e os renovados embaixo,
// guardados com o PDF. Só a Gestão renova, edita, troca o PDF e exclui; "Novo vencimento" fica no
// "…" do empreendimento. Sem vencimento, a seção some (como Relatórios e Resíduos).
import {
  diasParaVencer,
  formatarDataCivil,
  rotuloDaSituacaoDoVencimento,
  situacaoDoVencimento,
  type DataCivil,
  type SituacaoDoVencimento,
} from '@gestao-ambiental/domain'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { Contagem } from '@/app/paginas/visao/Contagem'
import { Carregando, EstadoErro } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { BotaoIcone } from '@/components/ui/botao-icone'
import { BotaoMais } from '@/components/ui/botao-mais'
import { Dialogo } from '@/components/ui/dialogo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Selo, type TomSelo } from '@/components/ui/selo'
import type { Unidade } from '@/lib/api/empreendimentos'
import { urlDoPdf } from '@/lib/api/licencas'
import {
  excluirVencimento,
  listarVencimentosDoEmpreendimento,
  type Vencimento,
} from '@/lib/api/vencimentos'
import { mensagemDoErro, mensagemDoErroDoVencimento } from '@/lib/erros'
import { cn } from '@/lib/utils'

import {
  TituloDoPainel,
  classeCabecalho,
  classeCelula,
  classeItemCelular,
  classeLinha,
  classePainel,
  classeRegiao,
} from '../residuos/quadro'
import { DialogoVencimento, type ModoDoVencimento } from './DialogoVencimento'
import {
  chavesDosVencimentos,
  descricaoDoVencimento,
  ordenarVencimentos,
} from './vencimentos-do-empreendimento'

const TOM: Record<SituacaoDoVencimento, TomSelo> = {
  vigente: 'sucesso',
  a_vencer: 'atencao',
  vencido: 'perigo',
  renovado: 'padrao',
}

export function SecaoVencimentos({
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
  const queryClient = useQueryClient()
  const [modo, setModo] = useState<ModoDoVencimento | null>(null)
  const [excluindo, setExcluindo] = useState<Vencimento | null>(null)

  const vencimentos = useQuery({
    queryKey: ['vencimentos', empreendimentoId],
    queryFn: () => listarVencimentosDoEmpreendimento(empreendimentoId),
  })

  async function atualizar() {
    await Promise.all(
      chavesDosVencimentos(empreendimentoId).map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    )
  }

  const abrirPdf = useMutation({
    mutationFn: urlDoPdf,
    onSuccess: (url) => {
      window.open(url, '_blank', 'noopener,noreferrer')
    },
  })
  const excluir = useMutation({
    mutationFn: excluirVencimento,
    onSuccess: async () => {
      setExcluindo(null)
      await atualizar()
    },
  })

  if (vencimentos.isSuccess && vencimentos.data.length === 0) return null

  function acoes(v: Vencimento) {
    const descricao = descricaoDoVencimento(v)
    return (
      <span className="flex shrink-0 items-center justify-end gap-(--e-05)">
        {v.pdf ? (
          <BotaoIcone
            icone="file-text"
            rotulo={`Abrir PDF de ${descricao}`}
            disabled={abrirPdf.isPending}
            onClick={() => {
              if (v.pdf) abrirPdf.mutate(v.pdf.caminho)
            }}
          />
        ) : null}
        {ehGestao ? (
          <BotaoMais
            de={descricao}
            itens={[
              {
                rotulo: 'Renovar',
                icone: 'refresh-cw',
                oculto: v.renovado,
                aoEscolher: () => {
                  setModo({ tipo: 'renovar', anterior: v })
                },
              },
              {
                rotulo: 'Editar',
                icone: 'pencil',
                aoEscolher: () => {
                  setModo({ tipo: 'editar', vencimento: v })
                },
              },
              {
                rotulo: 'Trocar PDF',
                icone: 'paperclip',
                aoEscolher: () => {
                  setModo({ tipo: 'pdf', vencimento: v })
                },
              },
              {
                rotulo: 'Excluir',
                icone: 'trash-2',
                perigo: true,
                separadoAntes: true,
                // Já renovado: excluir o novo primeiro (o banco também recusa).
                oculto: v.renovado,
                aoEscolher: () => {
                  excluir.reset()
                  setExcluindo(v)
                },
              },
            ]}
          />
        ) : null}
      </span>
    )
  }

  function situacao(v: Vencimento) {
    const s = situacaoDoVencimento(v, hoje)
    return <Selo tom={TOM[s]}>{rotuloDaSituacaoDoVencimento(s)}</Selo>
  }

  function faltam(v: Vencimento, indice: number) {
    return v.renovado ? null : <Contagem dias={diasParaVencer(v.validoAte, hoje)} ordem={indice} />
  }

  let conteudo
  if (vencimentos.isPending) {
    conteudo = <Carregando rotulo="Carregando vencimentos" linhas={2} className="border-0" />
  } else if (vencimentos.isError) {
    conteudo = (
      <EstadoErro
        titulo="Não foi possível carregar os vencimentos."
        aoTentarDeNovo={() => void vencimentos.refetch()}
        className="m-(--e-3)"
      />
    )
  } else {
    const lista = ordenarVencimentos(vencimentos.data)
    conteudo = (
      <>
        <div className={cn(classeRegiao, 'hidden md:block')}>
          <table className="w-full border-collapse corpo">
            <caption className="sr-only">Vencimentos do empreendimento</caption>
            <thead className="sticky top-0 z-10 bg-(--folha)">
              <tr>
                <th scope="col" className={cn(classeCabecalho, 'w-[88px]')}>
                  Faltam
                </th>
                <th scope="col" className={classeCabecalho}>
                  Tipo e número
                </th>
                <th scope="col" className={classeCabecalho}>
                  Unidade
                </th>
                <th scope="col" className={classeCabecalho}>
                  Validade
                </th>
                <th scope="col" className={classeCabecalho}>
                  Situação
                </th>
                <th scope="col" className={classeCabecalho}>
                  <span className="sr-only">PDF e ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lista.map((v, indice) => (
                <tr key={v.id} className={classeLinha}>
                  <td className={classeCelula}>{faltam(v, indice)}</td>
                  <td className={classeCelula}>
                    <span
                      className={cn(
                        'block corpo-medio numero',
                        v.renovado ? 'text-(--tinta-2)' : 'text-(--tinta)',
                      )}
                    >
                      {descricaoDoVencimento(v)}
                    </span>
                    {v.licenca || v.orgao ? (
                      <span className="block rotulo numero text-(--tinta-2)">
                        {[v.licenca, v.orgao].filter(Boolean).join(' · ')}
                      </span>
                    ) : null}
                  </td>
                  <td className={cn(classeCelula, 'text-(--tinta-2)')}>{v.unidadeNome ?? ''}</td>
                  <td className={cn(classeCelula, 'whitespace-nowrap numero')}>
                    {formatarDataCivil(v.validoAte)}
                  </td>
                  <td className={classeCelula}>{situacao(v)}</td>
                  <td className={cn(classeCelula, 'w-px whitespace-nowrap')}>{acoes(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul aria-label="Vencimentos do empreendimento" className="flex flex-col md:hidden">
          {lista.map((v, indice) => (
            <li key={v.id} className={cn(classeItemCelular, 'flex-row items-start gap-(--e-3)')}>
              <span className="w-[56px] shrink-0">{faltam(v, indice)}</span>
              <span className="flex min-w-0 flex-1 flex-col gap-(--e-1)">
                <span
                  className={cn(
                    'corpo-medio numero',
                    v.renovado ? 'text-(--tinta-2)' : 'text-(--tinta)',
                  )}
                >
                  {descricaoDoVencimento(v)}
                </span>
                <span className="rotulo numero text-(--tinta-2)">
                  {[v.unidadeNome, v.licenca, formatarDataCivil(v.validoAte)]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {situacao(v)}
              </span>
              {acoes(v)}
            </li>
          ))}
        </ul>
      </>
    )
  }

  const erro = abrirPdf.error

  return (
    <section aria-labelledby="titulo-vencimentos" className={classePainel}>
      <TituloDoPainel
        id="titulo-vencimentos"
        contagem={vencimentos.isSuccess ? vencimentos.data.length : null}
      >
        Vencimentos
      </TituloDoPainel>
      {erro ? (
        <MensagemSecao role="alert" tom="perigo" className="m-(--e-3)">
          {mensagemDoErro(erro)}
        </MensagemSecao>
      ) : null}
      {conteudo}

      {modo ? (
        <DialogoVencimento
          modo={modo}
          empreendimentoId={empreendimentoId}
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
      {excluindo ? (
        <Dialogo
          aberto
          aoMudar={(abrir) => {
            if (!abrir) setExcluindo(null)
          }}
          titulo={`Excluir ${descricaoDoVencimento(excluindo)}?`}
          acoes={
            <>
              <Botao
                onClick={() => {
                  setExcluindo(null)
                }}
              >
                Cancelar
              </Botao>
              <Botao
                aparencia="perigo"
                disabled={excluir.isPending}
                onClick={() => {
                  excluir.mutate(excluindo)
                }}
              >
                {excluir.isPending ? 'Excluindo…' : 'Excluir vencimento'}
              </Botao>
            </>
          }
        >
          {excluir.isError ? (
            <MensagemSecao role="alert" tom="perigo">
              {mensagemDoErroDoVencimento(excluir.error)}
            </MensagemSecao>
          ) : (
            <p className="numero">
              {[excluindo.unidadeNome, `Validade ${formatarDataCivil(excluindo.validoAte)}`]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
        </Dialogo>
      ) : null}
    </section>
  )
}
