// Requisitos legais do empreendimento (ADR-0050, LEG-07 e LEG-08). Só aparece com o recurso
// 'legislacao' do plano (apresentação: quem barra é o banco). A situação de cada linha é calculada no
// domínio; a ação e a evidência ficam dentro da própria linha, sem tela nova.
import {
  ROTULO_DA_SITUACAO_DO_REQUISITO,
  formatarDataCivil,
  rotuloDoMotivo,
  situacaoDoRequisito,
  type SituacaoDoRequisito,
} from '@gestao-ambiental/domain'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { useRecursoLiberado } from '@/app/consultoria/recurso-liberado'
import { Carregando, EstadoErro } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { BotaoMais } from '@/components/ui/botao-mais'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Selo, type TomSelo } from '@/components/ui/selo'
import {
  TAMANHO_PAGINA_REQUISITOS,
  concluirAcaoLegal,
  decidirAplicabilidade,
  listarRequisitosDoEmpreendimento,
  sugerirRequisitos,
  type RequisitoLegal,
} from '@/lib/api/requisitos-legais'
import { mensagemDoErro } from '@/lib/erros'

import { TituloDoPainel, classePainel } from '../residuos/quadro'
import {
  DialogoAdicionarNorma,
  DialogoAvaliar,
  DialogoEvidencia,
  DialogoNaoSeAplica,
} from './DialogosDoRequisito'
import type { PropsDaSecao } from './secoes-do-empreendimento'

const TOM: Record<SituacaoDoRequisito, TomSelo> = {
  sugerido: 'padrao',
  nao_se_aplica: 'padrao',
  nao_avaliado: 'atencao',
  rever: 'revisao',
  acao_atrasada: 'perigoForte',
  nao_conforme: 'perigo',
  conforme: 'sucesso',
}

type Dialogo =
  | { tipo: 'avaliar' | 'nao_se_aplica' | 'evidencia'; requisito: RequisitoLegal }
  | { tipo: 'adicionar' }

function Apoio({ requisito }: { requisito: RequisitoLegal }) {
  const partes: string[] = []
  if (requisito.dispositivo) partes.push(requisito.dispositivo)
  if (requisito.motivo) partes.push(rotuloDoMotivo(requisito.motivo))
  if (requisito.avaliadaEm) {
    partes.push(
      `avaliado em ${formatarDataCivil(requisito.avaliadaEm)}${
        requisito.avaliadaPorNome ? ` por ${requisito.avaliadaPorNome}` : ''
      }`,
    )
  }
  if (requisito.evidencias > 0) {
    partes.push(
      `${String(requisito.evidencias)} ${requisito.evidencias === 1 ? 'evidência' : 'evidências'}${
        requisito.menorValidade ? ` · válida até ${formatarDataCivil(requisito.menorValidade)}` : ''
      }`,
    )
  }
  return (
    <>
      {partes.length > 0 ? <span className="rotulo numero">{partes.join(' · ')}</span> : null}
      {requisito.acao ? (
        <span className="rotulo numero">
          {[
            `Ação: ${requisito.acao.descricao}`,
            `até ${formatarDataCivil(requisito.acao.prazo)}`,
            requisito.acao.responsavelNome ?? 'sem responsável',
          ].join(' · ')}
        </span>
      ) : null}
      {requisito.aplicavel === false && requisito.justificativa ? (
        <span className="rotulo">{requisito.justificativa}</span>
      ) : null}
    </>
  )
}

export function SecaoRequisitosLegais({ empreendimento, hoje, ehGestao }: PropsDaSecao) {
  const { atual } = useConsultoria()
  const cid = atual.consultoriaId
  const queryClient = useQueryClient()
  const recurso = useRecursoLiberado('legislacao')
  const [pagina, setPagina] = useState(0)
  const [dialogo, setDialogo] = useState<Dialogo | null>(null)
  const chave = ['requisitos-legais', cid, empreendimento.id, pagina]

  const requisitos = useQuery({
    queryKey: chave,
    queryFn: () => listarRequisitosDoEmpreendimento(cid, empreendimento.id, pagina),
    enabled: recurso.data === true,
    placeholderData: keepPreviousData,
  })

  async function atualizar() {
    setDialogo(null)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['requisitos-legais', cid, empreendimento.id] }),
      queryClient.invalidateQueries({ queryKey: ['prazos'] }),
    ])
  }

  const sugerir = useMutation({
    mutationFn: () => sugerirRequisitos(cid, empreendimento.id),
    onSuccess: atualizar,
  })
  const seAplica = useMutation({
    mutationFn: (r: RequisitoLegal) => decidirAplicabilidade(cid, r, true, null),
    onSuccess: atualizar,
  })
  const concluir = useMutation({
    mutationFn: (acao: { id: string; rowVersion: number }) => concluirAcaoLegal(cid, acao),
    onSuccess: atualizar,
  })
  const erro = sugerir.error ?? seAplica.error ?? concluir.error

  // Fora do plano (ou enquanto a resposta não chega) a seção não aparece.
  if (recurso.data !== true) return null

  const total = requisitos.data?.total ?? 0
  const paginas = Math.max(1, Math.ceil(total / TAMANHO_PAGINA_REQUISITOS))

  return (
    <section
      id="requisitos-legais"
      aria-labelledby="titulo-requisitos-legais"
      className={classePainel}
    >
      <TituloDoPainel
        id="titulo-requisitos-legais"
        acoes={
          <div className="flex flex-wrap gap-(--e-1)">
            <Botao
              tamanho="compacto"
              iconeAntes="sparkles"
              disabled={sugerir.isPending}
              onClick={() => {
                sugerir.mutate()
              }}
            >
              {sugerir.isPending ? 'Sugerindo…' : 'Sugerir pela triagem'}
            </Botao>
            <Botao
              tamanho="compacto"
              iconeAntes="plus"
              onClick={() => {
                setDialogo({ tipo: 'adicionar' })
              }}
            >
              Adicionar norma
            </Botao>
          </div>
        }
      >
        Requisitos legais
      </TituloDoPainel>
      {erro ? (
        <MensagemSecao role="alert" tom="perigo" className="m-(--e-3)">
          {mensagemDoErro(erro)}
        </MensagemSecao>
      ) : null}
      {sugerir.isSuccess ? (
        <p role="status" className="px-(--e-4) pt-(--e-2) rotulo">
          {sugerir.data === 0
            ? 'Nenhum requisito novo'
            : `${String(sugerir.data)} ${sugerir.data === 1 ? 'requisito sugerido' : 'requisitos sugeridos'}`}
        </p>
      ) : null}
      {requisitos.isPending ? (
        <Carregando rotulo="Carregando requisitos legais" linhas={2} className="border-0" />
      ) : requisitos.isError ? (
        <EstadoErro
          titulo="Não foi possível carregar os requisitos legais."
          aoTentarDeNovo={() => void requisitos.refetch()}
          className="m-(--e-3)"
        />
      ) : requisitos.data.itens.length === 0 ? (
        <p className="px-(--e-4) py-(--e-3) corpo text-(--tinta-2)">Nenhum requisito legal.</p>
      ) : (
        <ul aria-label="Requisitos legais do empreendimento" className="flex flex-col">
          {requisitos.data.itens.map((requisito) => {
            const situacao = situacaoDoRequisito(
              { ...requisito, acaoPrazo: requisito.acao?.prazo ?? null },
              hoje,
            )
            return (
              <li
                key={requisito.id}
                className="flex min-h-(--linha) flex-wrap items-center gap-x-(--e-4) gap-y-(--e-2) border-b border-(--regra-leve) px-(--e-4) py-(--e-2) last:border-b-0"
              >
                <div className="flex min-w-0 flex-1 basis-56 flex-col">
                  <Link
                    to={`/normas/${requisito.normaId}`}
                    className="corpo-medio text-(--tinta) hover:underline"
                  >
                    {requisito.normaTitulo}
                    {requisito.normaRevogada ? (
                      <span className="font-normal text-(--tinta-2)"> · revogada</span>
                    ) : null}
                  </Link>
                  <Apoio requisito={requisito} />
                </div>
                <Selo tom={TOM[situacao]}>{ROTULO_DA_SITUACAO_DO_REQUISITO[situacao]}</Selo>
                <BotaoMais
                  rotulo={`Ações de ${requisito.normaTitulo}`}
                  itens={[
                    {
                      rotulo: 'Avaliar',
                      oculto: requisito.aplicavel === false,
                      aoEscolher: () => {
                        setDialogo({ tipo: 'avaliar', requisito })
                      },
                    },
                    {
                      rotulo: 'Se aplica',
                      oculto: requisito.aplicavel !== null,
                      aoEscolher: () => {
                        seAplica.mutate(requisito)
                      },
                    },
                    {
                      rotulo: 'Não se aplica',
                      oculto: !ehGestao || requisito.aplicavel === false,
                      aoEscolher: () => {
                        setDialogo({ tipo: 'nao_se_aplica', requisito })
                      },
                    },
                    {
                      rotulo: 'Anexar evidência',
                      oculto: requisito.aplicavel === false,
                      aoEscolher: () => {
                        setDialogo({ tipo: 'evidencia', requisito })
                      },
                    },
                    {
                      rotulo: 'Concluir ação',
                      oculto: requisito.acao === null,
                      aoEscolher: () => {
                        if (requisito.acao) concluir.mutate(requisito.acao)
                      },
                    },
                    {
                      rotulo: 'Ver norma',
                      separadoAntes: true,
                      para: `/normas/${requisito.normaId}`,
                    },
                  ]}
                />
              </li>
            )
          })}
        </ul>
      )}
      {paginas > 1 ? (
        <nav
          aria-label="Páginas dos requisitos legais"
          className="flex items-center justify-end gap-(--e-2) px-(--e-4) py-(--e-2)"
        >
          <Botao
            tamanho="compacto"
            disabled={pagina === 0}
            onClick={() => {
              setPagina((p) => p - 1)
            }}
          >
            Anterior
          </Botao>
          <span className="rotulo numero">
            {pagina + 1} de {paginas}
          </span>
          <Botao
            tamanho="compacto"
            disabled={pagina + 1 >= paginas}
            onClick={() => {
              setPagina((p) => p + 1)
            }}
          >
            Próxima
          </Botao>
        </nav>
      ) : null}
      {dialogo?.tipo === 'avaliar' ? (
        <DialogoAvaliar
          consultoriaId={cid}
          requisito={dialogo.requisito}
          hoje={hoje}
          aoFechar={() => {
            setDialogo(null)
          }}
          aoSalvar={atualizar}
        />
      ) : dialogo?.tipo === 'nao_se_aplica' ? (
        <DialogoNaoSeAplica
          consultoriaId={cid}
          requisito={dialogo.requisito}
          aoFechar={() => {
            setDialogo(null)
          }}
          aoSalvar={atualizar}
        />
      ) : dialogo?.tipo === 'evidencia' ? (
        <DialogoEvidencia
          consultoriaId={cid}
          requisito={dialogo.requisito}
          hoje={hoje}
          aoFechar={() => {
            setDialogo(null)
          }}
          aoSalvar={atualizar}
        />
      ) : dialogo?.tipo === 'adicionar' ? (
        <DialogoAdicionarNorma
          consultoriaId={cid}
          empreendimentoId={empreendimento.id}
          aoFechar={() => {
            setDialogo(null)
          }}
          aoSalvar={atualizar}
        />
      ) : null}
    </section>
  )
}
