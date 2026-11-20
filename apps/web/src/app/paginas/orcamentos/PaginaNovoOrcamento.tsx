import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { usePrenderTarefa, useTarefas } from '@/app/consultoria/tempo-ativo'
import { NovoEmpreendimento } from '@/app/paginas/licenca/EmpreendimentoDaLicenca'
import { Pagina } from '@/app/paginas/Pagina'
import { Carregando, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Trilha } from '@/components/ui/trilha'
import type { ParaQuem } from '@/lib/api/orcamentos'
import { mensagemDoErro } from '@/lib/erros'

import { BuscaDoCliente, type EscolhaDoCliente } from './BuscaDoCliente'
import { ETAPAS } from './comum'
import { CHAVE_DO_NOVO_ORCAMENTO, useCriarRascunho } from './criar-rascunho'
import { SeloSituacaoOrcamento } from './SeloSituacaoOrcamento'

/**
 * /orcamentos/novo (pedido do Eduardo, 20/11/2026): sem diálogo, direto no editor. O cliente vem
 * numa linha só, no topo; escolhido, o rascunho nasce e a tela vira o editor dele. Com
 * ?empreendimento=<id> (menu do empreendimento), o rascunho nasce na hora para ele.
 */
export function PaginaNovoOrcamento() {
  const { atual } = useConsultoria()
  if (atual.papel !== 'gestao') {
    return (
      <Pagina titulo="Novo orçamento">
        <SemPermissao descricao="Orçamentos têm custo e margem: por enquanto, só a gestão acessa." />
      </Pagina>
    )
  }
  return <CriacaoDoOrcamento consultoriaId={atual.consultoriaId} />
}

function CriacaoDoOrcamento({ consultoriaId }: { consultoriaId: string }) {
  const [parametros] = useSearchParams()
  const doEmpreendimento = parametros.get('empreendimento')
  const navegar = useNavigate()
  const queryClient = useQueryClient()
  const criar = useCriarRascunho(consultoriaId)
  const [cadastrar, setCadastrar] = useState<string | null>(null)
  const [criando, setCriando] = useState(Boolean(doEmpreendimento))
  const [falha, setFalha] = useState<string | null>(null)
  const [ultimoPedido, setUltimoPedido] = useState<ParaQuem | null>(null)

  // Tempo ativo do orçamento (ADR-0027): começa aqui e segue com o id do orçamento criado.
  const tarefas = useTarefas()
  usePrenderTarefa(CHAVE_DO_NOVO_ORCAMENTO)
  useEffect(() => {
    tarefas.iniciar(CHAVE_DO_NOVO_ORCAMENTO)
  }, [tarefas])

  async function criarPara(paraQuem: ParaQuem) {
    setUltimoPedido(paraQuem)
    setFalha(null)
    setCriando(true)
    try {
      const id = await criar({ paraQuem })
      await queryClient.invalidateQueries({ queryKey: ['orcamentos', consultoriaId] })
      void navegar(`/orcamentos/${id}`, { replace: true })
    } catch (erro) {
      setFalha(mensagemDoErro(erro))
      setCriando(false)
    }
  }

  // Cadastro completo aberto: o foco vai para o primeiro campo vazio (o nome já veio da busca).
  const areaDoCadastro = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (cadastrar === null) return
    const campos = areaDoCadastro.current?.querySelectorAll('input') ?? []
    const vazio = Array.from(campos).find((campo) => campo.value === '')
    ;(vazio ?? campos[0])?.focus()
  }, [cadastrar])

  // Do menu do empreendimento: cria uma vez, já para ele.
  const pedidoDaUrl = useRef(false)
  useEffect(() => {
    if (!doEmpreendimento || pedidoDaUrl.current) return
    pedidoDaUrl.current = true
    void criarPara({ empreendimentoId: doEmpreendimento })
    // criarPara muda a cada render; o pedido da URL vale uma vez só.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doEmpreendimento])

  function escolher(escolha: EscolhaDoCliente) {
    if (escolha.tipo === 'empreendimento') {
      void criarPara({ empreendimentoId: escolha.id })
    } else if (escolha.tipo === 'prospecto') {
      void criarPara({
        prospecto: { nome: escolha.nome, cnpj: null, contato: null, email: null, telefone: null },
      })
    } else {
      setCadastrar(escolha.nome)
    }
  }

  return (
    <Pagina
      titulo="Novo orçamento"
      voltar={{ para: '/orcamentos', rotulo: 'Orçamentos' }}
      meta={<SeloSituacaoOrcamento situacao="rascunho" />}
    >
      {falha ? (
        <MensagemSecao role="alert" tom="perigo">
          <span className="flex flex-wrap items-center gap-(--e-3)">
            <span>{falha}</span>
            {ultimoPedido ? (
              <Botao
                tamanho="compacto"
                onClick={() => {
                  void criarPara(ultimoPedido)
                }}
              >
                Tentar de novo
              </Botao>
            ) : null}
          </span>
        </MensagemSecao>
      ) : null}

      <div className="flex flex-col gap-(--e-4)">
        <section
          aria-label="Cliente do orçamento"
          className="rounded-(--raio-painel) border bg-(--folha) p-(--e-4)"
        >
          {criando ? (
            <Carregando rotulo="Criando o orçamento" linhas={1} className="border-0" />
          ) : (
            <BuscaDoCliente
              consultoriaId={consultoriaId}
              focar={cadastrar === null}
              desabilitado={cadastrar !== null}
              aoEscolher={escolher}
            />
          )}
        </section>

        {cadastrar !== null && !criando ? (
          <div ref={areaDoCadastro}>
            <NovoEmpreendimento
              consultoriaId={consultoriaId}
              inicial={{ nome: cadastrar, cnpj: '', unidade: 'Matriz', endereco: '' }}
              aoCadastrar={(empreendimentoId) => {
                setCadastrar(null)
                void criarPara({ empreendimentoId })
              }}
              aoCancelar={() => {
                setCadastrar(null)
              }}
            />
          </div>
        ) : null}

        <Trilha
          compactaNoCelular
          rotulo="Etapas do orçamento"
          atual={0}
          podeEscolher={() => false}
          passos={ETAPAS.map((e) => ({ id: e.id, titulo: e.titulo }))}
        />
        <section
          aria-label="Serviços"
          className="flex flex-wrap items-center justify-between gap-(--e-3) rounded-(--raio-painel) border bg-(--folha) p-(--e-4)"
        >
          <h2 className="titulo-secao text-(--tinta-2)">Serviços</h2>
          <div className="flex flex-wrap gap-(--e-2)">
            <Botao tamanho="compacto" iconeAntes="list" disabled>
              Escolher modelo
            </Botao>
            <Botao tamanho="compacto" iconeAntes="plus" disabled>
              Adicionar item
            </Botao>
          </div>
        </section>
      </div>
    </Pagina>
  )
}
