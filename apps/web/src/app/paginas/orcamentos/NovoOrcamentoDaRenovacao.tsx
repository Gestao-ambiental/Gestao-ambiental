import {
  ROTULO_DO_PORTE,
  formatarCentavos,
  lerReais,
  objetoDaRenovacao,
  taxaSugeridaDaRenovacao,
} from '@gestao-ambiental/domain'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'

import { usePrenderTarefa, useTarefas } from '@/app/consultoria/tempo-ativo'
import { Pagina } from '@/app/paginas/Pagina'
import { Carregando, EstadoErro, EstadoVazio } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { CampoTexto } from '@/components/ui/campo-texto'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { listarAtividadesDaLicenca } from '@/lib/api/atividades-da-licenca'
import { obterOrcamentoDaLicenca, obterPlano } from '@/lib/api/renovacoes'
import { mensagemDoErro } from '@/lib/erros'

import { reaisDigitados } from './comum'
import { CHAVE_DO_NOVO_ORCAMENTO, useCriarRascunho } from './criar-rascunho'
import { SeloSituacaoOrcamento } from './SeloSituacaoOrcamento'

const VOLTAR = { para: '/acompanhamentos', rotulo: 'Acompanhamentos' }

/** Um par rótulo/valor do resumo da renovação. */
function Dado({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-(--e-05)">
      <dt className="rotulo text-(--tinta-2)">{rotulo}</dt>
      <dd className="corpo-medio text-(--tinta)">{children}</dd>
    </div>
  )
}

/**
 * /orcamentos/novo?renovacao=<licença> (ADR-0044): o rascunho da renovação de uma LAO, sem diálogo.
 * Mostra licença, cliente e objeto, e a taxa do órgão sugerida (fase LAO, só no IMA), editável antes
 * de criar. "Criar rascunho" cria pelo banco e abre o editor; nada é enviado. Licença que já tem
 * orçamento vivo abre direto o editor dele.
 */
export function NovoOrcamentoDaRenovacao({
  consultoriaId,
  instrumentoId,
}: {
  consultoriaId: string
  instrumentoId: string
}) {
  const navegar = useNavigate()
  const queryClient = useQueryClient()
  const criar = useCriarRascunho(consultoriaId)
  const [taxaDigitada, setTaxaDigitada] = useState<string | null>(null)
  const [criando, setCriando] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)

  // Abrir o existente ou criar se decide pela resposta desta montagem, nunca pelo cache: o orçamento
  // visto antes pode ter sido recusado ou ido para a lixeira no editor, que não invalida esta chave.
  const existente = useQuery({
    queryKey: ['orcamento-da-licenca', instrumentoId],
    queryFn: () => obterOrcamentoDaLicenca(instrumentoId),
    staleTime: 0,
    refetchOnMount: 'always',
  })
  const conferido = existente.isFetchedAfterMount

  // Tempo ativo do orçamento (ADR-0027), como na tela Novo orçamento. Só começa quando a licença
  // não tem orçamento vivo: quem é levado ao editor de um existente não deixa um "novo" contando.
  const tarefas = useTarefas()
  usePrenderTarefa(CHAVE_DO_NOVO_ORCAMENTO)
  const semOrcamentoVivo = conferido && existente.isSuccess && existente.data === null
  useEffect(() => {
    if (semOrcamentoVivo) tarefas.iniciar(CHAVE_DO_NOVO_ORCAMENTO)
  }, [semOrcamentoVivo, tarefas])
  const plano = useQuery({
    queryKey: ['plano-renovacao', instrumentoId],
    queryFn: () => obterPlano(instrumentoId),
  })
  const atividades = useQuery({
    queryKey: ['atividades-da-licenca', instrumentoId],
    queryFn: () => listarAtividadesDaLicenca(instrumentoId),
  })

  const idExistente = conferido ? (existente.data?.id ?? null) : null
  useEffect(() => {
    if (idExistente) void navegar(`/orcamentos/${idExistente}`, { replace: true })
  }, [idExistente, navegar])

  const meta = <SeloSituacaoOrcamento situacao="rascunho" />

  if (!conferido || plano.isPending || atividades.isPending || idExistente) {
    return (
      <Pagina titulo="Novo orçamento" voltar={VOLTAR} meta={meta}>
        <Carregando rotulo="Carregando a licença" linhas={4} />
      </Pagina>
    )
  }
  if (existente.isError || plano.isError || atividades.isError) {
    return (
      <Pagina titulo="Novo orçamento" voltar={VOLTAR} meta={meta}>
        <EstadoErro
          titulo="Não foi possível carregar a licença."
          aoTentarDeNovo={() => {
            void existente.refetch()
            void plano.refetch()
            void atividades.refetch()
          }}
        />
      </Pagina>
    )
  }
  const dados = plano.data
  if (!dados) {
    return (
      <Pagina titulo="Novo orçamento" voltar={VOLTAR} meta={meta}>
        <EstadoVazio
          icone="file-text"
          titulo="Licença fora do radar de renovação"
          acaoPrincipal={
            <Botao aparencia="primario" asChild>
              <Link to="/acompanhamentos">Voltar para Acompanhamentos</Link>
            </Botao>
          }
        />
      </Pagina>
    )
  }

  const gravadas = atividades.data
  const sugerida = taxaSugeridaDaRenovacao(dados.orgao, gravadas)
  const taxaTexto = taxaDigitada ?? (sugerida === null ? '' : formatarCentavos(sugerida))
  const taxaCentavos = taxaTexto.trim() === '' ? null : lerReais(taxaTexto)
  const taxaValida = taxaTexto.trim() === '' || taxaCentavos !== null

  async function criarRascunho() {
    if (!dados || !taxaValida) return
    setFalha(null)
    setCriando(true)
    try {
      const { caminho } = await criar({
        paraQuem: { empreendimentoId: dados.empreendimentoId },
        renovacao: { instrumentoId, taxaCentavos },
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['orcamentos', consultoriaId] }),
        queryClient.invalidateQueries({ queryKey: ['renovacoes', consultoriaId] }),
        queryClient.invalidateQueries({ queryKey: ['orcamento-da-licenca', instrumentoId] }),
      ])
      void navegar(caminho, { replace: true })
    } catch (erro) {
      setFalha(mensagemDoErro(erro))
      setCriando(false)
    }
  }

  return (
    <Pagina
      titulo="Novo orçamento"
      voltar={VOLTAR}
      meta={meta}
      acao={
        <Botao
          aparencia="primario"
          disabled={criando || !taxaValida}
          onClick={() => {
            void criarRascunho()
          }}
        >
          {criando ? 'Criando…' : 'Criar rascunho'}
        </Botao>
      }
    >
      {falha ? (
        <MensagemSecao role="alert" tom="perigo">
          {falha}
        </MensagemSecao>
      ) : null}

      <section
        aria-label="Renovação"
        className="flex flex-col gap-(--e-5) rounded-(--raio-painel) border bg-(--folha) p-(--e-4) sm:p-(--e-5)"
      >
        <dl className="grid grid-cols-1 gap-x-(--e-6) gap-y-(--e-3) sm:grid-cols-3">
          <Dado rotulo="Licença">
            <Link to={`/renovacoes/${instrumentoId}`} className="text-(--tinta) numero">
              {dados.licenca}
            </Link>
            {dados.orgao ? <span className="text-(--tinta-2)"> · {dados.orgao}</span> : null}
          </Dado>
          <Dado rotulo="Cliente">{dados.empreendimentoNome}</Dado>
          <Dado rotulo="Objeto">{objetoDaRenovacao(dados.licenca)}</Dado>
        </dl>

        <CampoTexto
          rotulo="Taxa do órgão (R$)"
          inputMode="decimal"
          autoComplete="off"
          className="max-w-[240px]"
          value={taxaTexto}
          erro={taxaValida ? undefined : 'Informe a taxa em reais (0 ou mais).'}
          onChange={(evento) => {
            setTaxaDigitada(reaisDigitados(evento))
          }}
        />

        {gravadas.length > 0 ? (
          <ul aria-label="Atividades da licença" className="flex flex-col gap-(--e-1)">
            {gravadas.map((a) => (
              <li key={a.id} className="flex flex-wrap gap-x-(--e-2) corpo text-(--tinta)">
                <span className="corpo-medio numero">{a.codigo}</span>
                <span className="text-(--tinta-2)">
                  {ROTULO_DO_PORTE[a.porte]} · potencial {a.potencial}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </Pagina>
  )
}
