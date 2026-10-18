import { hojeNoFuso, formatarDataCivil } from '@gestao-ambiental/domain'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { useSessao, usuarioDaSessao } from '@/app/sessao/contexto-sessao'
import { Carregando, EstadoErro, EstadoVazio } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { Dialogo } from '@/components/ui/dialogo'
import { Icone } from '@/components/ui/icone'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Selo } from '@/components/ui/selo'
import {
  ativarPlano,
  atribuirATodos,
  definirResponsavel,
  listarMembrosAtivos,
  type Condicionante,
  type Instrumento,
} from '@/lib/api/licencas'
import { mensagemDoErro } from '@/lib/erros'

import { GuardaRascunho } from './GuardaCadastro'
import { MolduraCadastro, RodapeCadastro } from './MolduraCadastro'
import { useCondicionantes, useSalvamento } from './usar-rascunho'

const SEM_RESPONSAVEL = ''
const classeCabecalho =
  'h-10 border-b px-(--space-100) text-left rotulo whitespace-nowrap first:pl-(--space-150)'
const classeCelula = 'h-10 border-b px-(--space-100) align-middle first:pl-(--space-150)'

/** Responsável mais frequente: o "geral"; quem difere dele é exceção (Protótipo 14). */
function responsavelGeral(itens: readonly Condicionante[]): string | null {
  const contagem = new Map<string, number>()
  for (const item of itens) {
    if (item.responsavelId)
      contagem.set(item.responsavelId, (contagem.get(item.responsavelId) ?? 0) + 1)
  }
  let geral: string | null = null
  let maior = 0
  for (const [id, total] of contagem) {
    if (total > maior) {
      geral = id
      maior = total
    }
  }
  return geral
}

interface Ativado {
  total: number
  instante: Date
}

function Sucesso({ instrumento, ativado }: { instrumento: Instrumento; ativado: Ativado }) {
  const { sessao } = useSessao()
  const { atual } = useConsultoria()
  const nome = sessao ? usuarioDaSessao(sessao).nome : ''
  const identificacao = [instrumento.tipoSigla, instrumento.numero].filter(Boolean).join(' ')
  return (
    <div
      role="status"
      className="flex flex-col items-center gap-(--space-150) py-(--space-800) text-center"
    >
      <Icone nome="circle-check" tamanho={24} className="text-(--text-link)" />
      <h2 className="titulo-tela">
        Plano ativado.{' '}
        {ativado.total === 1
          ? '1 ocorrência criada.'
          : `${String(ativado.total)} ocorrências criadas.`}
      </h2>
      <p className="max-w-[480px] corpo text-pretty text-(--text-subtle)">
        {identificacao} · {instrumento.empreendimentoNome} · {instrumento.unidadeNome}. Ativado por{' '}
        {nome} em {formatarDataCivil(hojeNoFuso(ativado.instante, atual.fuso))} às{' '}
        {ativado.instante.toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: atual.fuso,
        })}
        .
      </p>
      <div className="flex flex-wrap justify-center gap-(--space-100)">
        <Botao aparencia="primario" asChild>
          <Link to="/">Ver na visão da equipe</Link>
        </Botao>
        <Botao iconeAntes="plus" asChild>
          <Link
            to={`/licencas/nova?empreendimento=${instrumento.empreendimentoId}&unidade=${instrumento.unidadeId}`}
          >
            Cadastrar outra licença
          </Link>
        </Botao>
      </div>
    </div>
  )
}

/** /licencas/:id/responsaveis (Protótipo 14; LIC-04, LIC-05). Salvar ativa o plano. */
export function PassoResponsaveis() {
  const { id = '' } = useParams()
  const salvamento = useSalvamento(id)
  const [ativado, setAtivado] = useState<{ instrumento: Instrumento; resultado: Ativado } | null>(
    null,
  )

  // Depois de ativar, o rascunho vira ativo e a guarda bloquearia: a tela de sucesso vem antes.
  if (ativado) {
    return (
      <MolduraCadastro
        passo="responsaveis"
        identificacao={[ativado.instrumento.tipoSigla, ativado.instrumento.numero]
          .filter(Boolean)
          .join(' ')}
        contexto={`${ativado.instrumento.empreendimentoNome} · ${ativado.instrumento.unidadeNome}`}
        sairPara={`/empreendimentos/${ativado.instrumento.empreendimentoId}`}
        salvoEm={salvamento.salvoEm}
      >
        <Sucesso instrumento={ativado.instrumento} ativado={ativado.resultado} />
      </MolduraCadastro>
    )
  }

  return (
    <GuardaRascunho id={id} passo="responsaveis">
      {(instrumento) => (
        <Responsaveis
          instrumento={instrumento}
          salvamento={salvamento}
          aoAtivar={(resultado) => {
            setAtivado({ instrumento, resultado })
          }}
        />
      )}
    </GuardaRascunho>
  )
}

function Responsaveis({
  instrumento,
  salvamento: { salvoEm, registrar },
  aoAtivar,
}: {
  instrumento: Instrumento
  salvamento: ReturnType<typeof useSalvamento>
  aoAtivar: (resultado: Ativado) => void
}) {
  const { atual } = useConsultoria()
  const queryClient = useQueryClient()
  const consulta = useCondicionantes(instrumento.id)
  const membros = useQuery({
    queryKey: ['membros-ativos', atual.consultoriaId],
    queryFn: () => listarMembrosAtivos(atual.consultoriaId),
  })
  const [chave] = useState(() => crypto.randomUUID())
  const [confirmarTodos, setConfirmarTodos] = useState(false)
  const [escolhidoTodos, setEscolhidoTodos] = useState('')

  const itens = (consulta.data ?? []).filter(
    (i) => i.revisao !== 'descartada' && i.natureza !== 'agrupador',
  )
  const geral = responsavelGeral(itens)
  const semResponsavel = itens.filter((i) => !i.responsavelId).length
  const excecoes = geral
    ? itens.filter((i) => i.responsavelId && i.responsavelId !== geral).length
    : 0
  const nomeDe = (id: string | null) => membros.data?.find((m) => m.id === id)?.nome

  const definir = useMutation({
    mutationFn: ({
      condicionanteId,
      membroId,
    }: {
      condicionanteId: string
      membroId: string | null
    }) => definirResponsavel(condicionanteId, membroId),
    onSuccess: registrar,
  })
  const todos = useMutation({
    mutationFn: (membroId: string) => atribuirATodos(instrumento.id, membroId),
    onSuccess: async () => {
      setConfirmarTodos(false)
      await registrar()
    },
  })
  const ativacao = useMutation({
    mutationFn: () => ativarPlano(instrumento.id, instrumento.rowVersion, chave),
    onSuccess: async (total) => {
      aoAtivar({ total, instante: new Date() })
      await queryClient.invalidateQueries({ queryKey: ['empreendimentos'] })
      await queryClient.invalidateQueries({ queryKey: ['licencas', instrumento.empreendimentoId] })
    },
  })

  const erro = definir.error ?? todos.error ?? ativacao.error

  return (
    <MolduraCadastro
      passo="responsaveis"
      instrumentoId={instrumento.id}
      identificacao={
        instrumento.tipoSigla && instrumento.numero
          ? `${instrumento.tipoSigla} ${instrumento.numero}`
          : null
      }
      contexto={`${instrumento.empreendimentoNome} · ${instrumento.unidadeNome}`}
      sairPara={`/empreendimentos/${instrumento.empreendimentoId}`}
      salvoEm={salvoEm}
      rodape={
        <RodapeCadastro
          aviso={
            semResponsavel === 0
              ? 'Todas as condicionantes têm responsável. Salvar ativa o plano.'
              : `${String(semResponsavel)} sem responsável: aparecem com “Atribuir” na visão da equipe. Salvar ativa o plano.`
          }
          voltarPara={`/licencas/${instrumento.id}/prazos`}
          aoContinuar={() => {
            ativacao.mutate()
          }}
          rotuloContinuar="Salvar"
          podeContinuar={
            consulta.isSuccess && itens.length > 0 && !definir.isPending && !todos.isPending
          }
          continuando={ativacao.isPending}
        />
      }
    >
      <div className="flex flex-col gap-(--space-150)">
        {erro ? (
          <MensagemSecao role="alert" tom="perigo">
            {mensagemDoErro(erro)}
          </MensagemSecao>
        ) : null}
        <div className="flex items-baseline gap-(--space-100)">
          <h2 className="titulo-secao">Condicionantes</h2>
          <span className="text-xs text-(--text-subtle)">
            {itens.length === 1 ? '1 condicionante' : `${String(itens.length)} condicionantes`}
          </span>
          {excecoes > 0 ? (
            <span className="ml-auto text-xs text-(--text-subtle)">
              {excecoes === 1 ? '1 exceção' : `${String(excecoes)} exceções`}
            </span>
          ) : null}
        </div>
        {consulta.isPending || membros.isPending ? (
          <Carregando rotulo="Carregando responsáveis" linhas={5} />
        ) : consulta.isError || membros.isError ? (
          <EstadoErro
            aoTentarDeNovo={() => {
              void consulta.refetch()
              void membros.refetch()
            }}
          />
        ) : itens.length === 0 ? (
          <EstadoVazio
            icone="users"
            titulo="Nenhuma condicionante"
            descricao="Volte ao passo 3 para cadastrar."
          />
        ) : (
          <div className="overflow-x-auto rounded-(--radius) border bg-(--surface)">
            <table className="w-full border-collapse corpo">
              <thead>
                <tr>
                  <th scope="col" className={classeCabecalho}>
                    Código
                  </th>
                  <th scope="col" className={classeCabecalho}>
                    Condicionante
                  </th>
                  <th scope="col" className={classeCabecalho}>
                    <span className="flex items-center gap-(--space-100)">
                      Responsável
                      <Botao
                        tamanho="compacto"
                        aparencia="sutil"
                        iconeAntes="users"
                        onClick={() => {
                          setEscolhidoTodos(geral ?? '')
                          setConfirmarTodos(true)
                        }}
                      >
                        Atribuir a todos
                      </Botao>
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {itens.map((item) => {
                  const excecao = Boolean(
                    geral && item.responsavelId && item.responsavelId !== geral,
                  )
                  return (
                    <tr key={item.id}>
                      <td className={`${classeCelula} font-mono text-xs text-(--text-subtle)`}>
                        {item.codigo}
                      </td>
                      <td className={classeCelula}>{item.titulo}</td>
                      <td className={`${classeCelula} w-[320px]`}>
                        <span className="flex items-center gap-(--space-100)">
                          <select
                            aria-label={`Responsável por ${item.codigo || item.titulo}`}
                            value={item.responsavelId ?? SEM_RESPONSAVEL}
                            disabled={definir.isPending || todos.isPending}
                            onChange={(evento) => {
                              definir.mutate({
                                condicionanteId: item.id,
                                membroId: evento.target.value || null,
                              })
                            }}
                            className="h-(--size-control) min-w-0 flex-1 rounded-(--radius) border border-(--border-input) bg-(--surface-input) px-(--space-100) corpo"
                          >
                            <option value={SEM_RESPONSAVEL}>Atribuir</option>
                            {membros.data.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.nome}
                              </option>
                            ))}
                          </select>
                          {excecao ? <Selo>Exceção</Selo> : null}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialogo
        aberto={confirmarTodos}
        aoMudar={setConfirmarTodos}
        titulo="Atribuir a todos"
        descricao="A pessoa escolhida fica responsável por todas as condicionantes desta licença. As exceções que você tiver feito são substituídas."
        acoes={
          <>
            <Botao
              onClick={() => {
                setConfirmarTodos(false)
              }}
            >
              Cancelar
            </Botao>
            <Botao
              aparencia="primario"
              disabled={!escolhidoTodos || todos.isPending}
              onClick={() => {
                todos.mutate(escolhidoTodos)
              }}
            >
              {escolhidoTodos ? `Atribuir a ${nomeDe(escolhidoTodos) ?? ''}` : 'Atribuir'}
            </Botao>
          </>
        }
      >
        <label className="flex flex-col gap-(--space-050)">
          <span className="rotulo">Responsável</span>
          <select
            value={escolhidoTodos}
            onChange={(evento) => {
              setEscolhidoTodos(evento.target.value)
            }}
            className="h-(--size-control) rounded-(--radius) border border-(--border-input) bg-(--surface-input) px-(--space-100) corpo"
          >
            <option value="">Escolha a pessoa</option>
            {(membros.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
        </label>
      </Dialogo>
    </MolduraCadastro>
  )
}
