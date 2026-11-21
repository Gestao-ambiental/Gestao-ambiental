// Execução do orçamento aprovado (P7, ADR-0053): horas orçadas contra lançadas por serviço e, para
// quem tem a permissão financeira, as parcelas com o recebido. Recebimento é registrado à mão;
// estorno não apaga. Só a Gestão vê esta seção.
import {
  formatarDataCivil,
  formatarDuracao,
  formatarReais,
  formatarReaisDigitados,
  hojeNoFuso,
  horasDaExecucao,
  lerDuracao,
  lerReais,
  minutosDoLancamentoValidos,
  situacaoDaParcela,
  situacaoFinanceira,
  type DataCivil,
} from '@gestao-ambiental/domain'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Carregando, EstadoErro } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { CampoData } from '@/components/ui/campo-data'
import { CampoTexto } from '@/components/ui/campo-texto'
import { Dialogo } from '@/components/ui/dialogo'
import { classeSelecao } from '@/components/ui/estilos-campo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Selo } from '@/components/ui/selo'
import {
  estornarRecebimento,
  lancarHoras,
  obterExecucao,
  registrarRecebimento,
  removerApontamento,
  type ItemDaExecucao,
  type ParcelaComRecebimentos,
} from '@/lib/api/execucao'
import { mensagemDoErro } from '@/lib/erros'

export const CHAVE_EXECUCAO = 'execucao-do-orcamento'

const ROTULO_DA_PARCELA = {
  recebida: { texto: 'Recebida', tom: 'sucesso' },
  vencida: { texto: 'Vencida', tom: 'perigo' },
  a_receber: { texto: 'A receber', tom: 'padrao' },
} as const

function DialogoLancarHoras({
  orcamentoId,
  itens,
  hoje,
  aberto,
  aoMudar,
}: {
  orcamentoId: string
  itens: readonly ItemDaExecucao[]
  hoje: DataCivil
  aberto: boolean
  aoMudar: (aberto: boolean) => void
}) {
  const queryClient = useQueryClient()
  const idDoItem = useId()
  const [itemId, setItemId] = useState(itens[0]?.id ?? '')
  const [data, setData] = useState<DataCivil | null>(hoje)
  const [duracao, setDuracao] = useState('')
  const [nota, setNota] = useState('')
  const [tentou, setTentou] = useState(false)
  const minutos = lerDuracao(duracao)
  const duracaoValida = minutos !== null && minutosDoLancamentoValidos(minutos)

  const lancar = useMutation({
    mutationFn: () =>
      lancarHoras({
        id: crypto.randomUUID(),
        orcamentoId,
        itemId,
        data: data ?? hoje,
        minutos: minutos ?? 0,
        nota: nota.trim() || null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CHAVE_EXECUCAO, orcamentoId] })
      setDuracao('')
      setNota('')
      setTentou(false)
      aoMudar(false)
    },
  })

  return (
    <Dialogo
      aberto={aberto}
      aoMudar={(valor) => {
        if (!valor) lancar.reset()
        aoMudar(valor)
      }}
      titulo="Lançar horas"
      acoes={
        <>
          <Botao
            onClick={() => {
              aoMudar(false)
            }}
          >
            Cancelar
          </Botao>
          <Botao
            aparencia="primario"
            disabled={lancar.isPending}
            onClick={() => {
              setTentou(true)
              if (duracaoValida && data && itemId) lancar.mutate()
            }}
          >
            {lancar.isPending ? 'Lançando' : 'Lançar'}
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-(--e-1)">
        <label htmlFor={idDoItem} className="rotulo text-(--tinta)">
          Serviço
        </label>
        <select
          id={idDoItem}
          value={itemId}
          className={`${classeSelecao} max-w-full`}
          onChange={(evento) => {
            setItemId(evento.target.value)
          }}
        >
          {itens.map((item) => (
            <option key={item.id} value={item.id}>
              {item.descricao}
            </option>
          ))}
        </select>
      </div>
      <CampoData rotulo="Data" valor={data} aoMudar={setData} hoje={hoje} maximo={hoje} />
      <CampoTexto
        rotulo="Duração"
        inputMode="text"
        placeholder="1h30"
        value={duracao}
        erro={tentou && !duracaoValida ? 'Informe de 1 min a 24 h.' : undefined}
        onChange={(evento) => {
          setDuracao(evento.target.value)
        }}
      />
      <CampoTexto
        rotulo="Nota"
        maxLength={500}
        value={nota}
        onChange={(evento) => {
          setNota(evento.target.value)
        }}
      />
      {lancar.isError ? (
        <MensagemSecao tom="perigo" role="alert">
          {mensagemDoErro(lancar.error)}
        </MensagemSecao>
      ) : null}
    </Dialogo>
  )
}

function DialogoRecebimento({
  orcamentoId,
  parcela,
  hoje,
  aoMudar,
}: {
  orcamentoId: string
  parcela: ParcelaComRecebimentos | null
  hoje: DataCivil
  aoMudar: (aberto: boolean) => void
}) {
  const queryClient = useQueryClient()
  const saldo = parcela ? Math.max(0, parcela.valorCentavos - parcela.recebidoCentavos) : 0
  const [valor, setValor] = useState(() => (saldo > 0 ? formatarReais(saldo) : ''))
  const [data, setData] = useState<DataCivil | null>(hoje)
  const [nota, setNota] = useState('')
  const [tentou, setTentou] = useState(false)
  const centavos = lerReais(valor)
  const valorValido = centavos !== null && centavos > 0

  const registrar = useMutation({
    mutationFn: () =>
      registrarRecebimento({
        id: crypto.randomUUID(),
        parcelaId: parcela?.id ?? '',
        valorCentavos: centavos ?? 0,
        recebidoEm: data ?? hoje,
        nota: nota.trim() || null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CHAVE_EXECUCAO, orcamentoId] })
      void queryClient.invalidateQueries({ queryKey: ['a-receber'] })
      aoMudar(false)
    },
  })

  return (
    <Dialogo
      aberto={parcela !== null}
      aoMudar={aoMudar}
      titulo={parcela ? `Recebimento: ${parcela.descricao}` : 'Recebimento'}
      acoes={
        <>
          <Botao
            onClick={() => {
              aoMudar(false)
            }}
          >
            Cancelar
          </Botao>
          <Botao
            aparencia="primario"
            disabled={registrar.isPending}
            onClick={() => {
              setTentou(true)
              if (valorValido && data) registrar.mutate()
            }}
          >
            {registrar.isPending ? 'Registrando' : 'Registrar'}
          </Botao>
        </>
      }
    >
      <CampoTexto
        rotulo="Valor recebido"
        inputMode="decimal"
        value={valor}
        erro={tentou && !valorValido ? 'Informe o valor recebido.' : undefined}
        onChange={(evento) => {
          setValor(formatarReaisDigitados(evento.target.value))
        }}
      />
      <CampoData rotulo="Recebido em" valor={data} aoMudar={setData} hoje={hoje} maximo={hoje} />
      <CampoTexto
        rotulo="Nota"
        maxLength={500}
        value={nota}
        onChange={(evento) => {
          setNota(evento.target.value)
        }}
      />
      {registrar.isError ? (
        <MensagemSecao tom="perigo" role="alert">
          {mensagemDoErro(registrar.error)}
        </MensagemSecao>
      ) : null}
    </Dialogo>
  )
}

export function ExecucaoDoOrcamento({ orcamentoId }: { orcamentoId: string }) {
  const { atual } = useConsultoria()
  const queryClient = useQueryClient()
  const hoje = hojeNoFuso(new Date(), atual.fuso)
  const [lancando, setLancando] = useState(false)
  const [recebendo, setRecebendo] = useState<ParcelaComRecebimentos | null>(null)

  const execucao = useQuery({
    queryKey: [CHAVE_EXECUCAO, orcamentoId],
    queryFn: () => obterExecucao(orcamentoId),
  })
  const atualizar = () => {
    void queryClient.invalidateQueries({ queryKey: [CHAVE_EXECUCAO, orcamentoId] })
    void queryClient.invalidateQueries({ queryKey: ['a-receber'] })
  }
  const remover = useMutation({ mutationFn: removerApontamento, onSuccess: atualizar })
  const estornar = useMutation({
    mutationFn: (r: { id: string; rowVersion: number }) => estornarRecebimento(r.id, r.rowVersion),
    onSuccess: atualizar,
  })

  if (execucao.isPending) return <Carregando rotulo="Carregando a execução" linhas={3} />
  if (execucao.isError)
    return (
      <EstadoErro
        titulo="Não foi possível carregar a execução."
        aoTentarDeNovo={() => void execucao.refetch()}
      />
    )

  const { itens, apontamentos, parcelas } = execucao.data
  const horas = horasDaExecucao(itens)
  const dinheiro = parcelas ? situacaoFinanceira(parcelas, hoje) : null
  const erro = remover.error ?? estornar.error

  return (
    <section
      aria-labelledby="titulo-execucao"
      className="flex flex-col gap-(--e-4) rounded-(--raio-painel) border bg-(--folha) p-(--e-4)"
    >
      <div className="flex flex-wrap items-center justify-between gap-(--e-2)">
        <h2 id="titulo-execucao" className="titulo-secao">
          Execução
        </h2>
        <Botao
          tamanho="compacto"
          iconeAntes="clock"
          disabled={itens.length === 0}
          onClick={() => {
            setLancando(true)
          }}
        >
          Lançar horas
        </Botao>
      </div>

      {erro ? (
        <MensagemSecao tom="perigo" role="alert">
          {mensagemDoErro(erro)}
        </MensagemSecao>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] corpo">
          <caption className="sr-only">Horas por serviço</caption>
          <thead>
            <tr className="text-left text-xs text-(--tinta-2)">
              <th scope="col" className="py-(--e-1) font-[650]">
                Serviço
              </th>
              <th scope="col" className="py-(--e-1) text-right font-[650]">
                Orçado
              </th>
              <th scope="col" className="py-(--e-1) text-right font-[650]">
                Lançado
              </th>
              <th scope="col" className="py-(--e-1) text-right font-[650]">
                Diferença
              </th>
            </tr>
          </thead>
          <tbody>
            {itens.map((item) => {
              const diferenca = item.orcadoMinutos - item.lancadoMinutos
              return (
                <tr key={item.id} className="border-t">
                  <th scope="row" className="py-(--e-2) text-left font-normal">
                    {item.descricao}
                  </th>
                  <td className="py-(--e-2) text-right numero">
                    {formatarDuracao(item.orcadoMinutos)}
                  </td>
                  <td className="py-(--e-2) text-right numero">
                    {formatarDuracao(item.lancadoMinutos)}
                  </td>
                  <td
                    className={
                      diferenca < 0
                        ? 'py-(--e-2) text-right numero text-(--atraso-texto)'
                        : 'py-(--e-2) text-right numero'
                    }
                  >
                    {diferenca < 0
                      ? `Estouro ${formatarDuracao(-diferenca)}`
                      : formatarDuracao(diferenca)}
                  </td>
                </tr>
              )
            })}
            <tr className="border-t font-[650]">
              <th scope="row" className="py-(--e-2) text-left">
                Total
              </th>
              <td className="py-(--e-2) text-right numero">
                {formatarDuracao(horas.orcadoMinutos)}
              </td>
              <td className="py-(--e-2) text-right numero">
                {formatarDuracao(horas.lancadoMinutos)}
              </td>
              <td className="py-(--e-2) text-right numero">
                {horas.diferencaMinutos < 0
                  ? `Estouro ${formatarDuracao(-horas.diferencaMinutos)}`
                  : formatarDuracao(horas.diferencaMinutos)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {apontamentos.length > 0 ? (
        <ul aria-label="Horas lançadas" className="flex flex-col divide-y">
          {apontamentos.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-(--e-2) py-(--e-15)"
            >
              <span className="corpo numero">
                {formatarDataCivil(a.data)} · {a.membroNome} · {formatarDuracao(a.minutos)}
                {a.nota ? ` · ${a.nota}` : ''}
              </span>
              <Botao
                tamanho="compacto"
                aparencia="sutil"
                aria-label={`Remover ${formatarDuracao(a.minutos)} de ${a.membroNome} em ${formatarDataCivil(a.data)}`}
                disabled={remover.isPending}
                onClick={() => {
                  remover.mutate(a.id)
                }}
              >
                Remover
              </Botao>
            </li>
          ))}
        </ul>
      ) : null}

      {parcelas && dinheiro ? (
        <div className="flex flex-col gap-(--e-2)">
          <h3 className="corpo-forte">Recebimentos</h3>
          <p className="corpo numero">
            Recebido {formatarReais(dinheiro.recebidoCentavos)} · A receber{' '}
            {formatarReais(dinheiro.aReceberCentavos)}
            {dinheiro.vencidoCentavos > 0
              ? ` · Vencido ${formatarReais(dinheiro.vencidoCentavos)}`
              : ''}
          </p>
          <ul aria-label="Parcelas" className="flex flex-col divide-y">
            {parcelas.map((p) => {
              const situacao = ROTULO_DA_PARCELA[situacaoDaParcela(p, hoje)]
              return (
                <li key={p.id} className="flex flex-col gap-(--e-1) py-(--e-2)">
                  <div className="flex flex-wrap items-center justify-between gap-(--e-2)">
                    <span className="flex flex-wrap items-center gap-(--e-2)">
                      <span className="corpo">{p.descricao}</span>
                      <Selo tom={situacao.tom}>{situacao.texto}</Selo>
                    </span>
                    <span className="flex flex-wrap items-center gap-(--e-2)">
                      <span className="corpo numero text-(--tinta-2)">
                        {formatarReais(p.recebidoCentavos)} de {formatarReais(p.valorCentavos)}
                        {p.venceEm ? ` · vence ${formatarDataCivil(p.venceEm)}` : ''}
                      </span>
                      <Botao
                        tamanho="compacto"
                        aria-label={`Registrar recebimento: ${p.descricao}`}
                        onClick={() => {
                          setRecebendo(p)
                        }}
                      >
                        Registrar
                      </Botao>
                    </span>
                  </div>
                  {p.recebimentos.map((r) => (
                    <div
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-(--e-2) pl-(--e-3)"
                    >
                      <span
                        className={
                          r.estornado
                            ? 'text-xs numero text-(--tinta-3) line-through'
                            : 'text-xs numero text-(--tinta-2)'
                        }
                      >
                        {formatarDataCivil(r.recebidoEm)} · {formatarReais(r.valorCentavos)}
                        {r.nota ? ` · ${r.nota}` : ''}
                      </span>
                      {r.estornado ? (
                        <span className="text-xs text-(--tinta-3)">Estornado</span>
                      ) : (
                        <Botao
                          tamanho="compacto"
                          aparencia="sutil"
                          aria-label={`Estornar ${formatarReais(r.valorCentavos)} de ${formatarDataCivil(r.recebidoEm)}`}
                          disabled={estornar.isPending}
                          onClick={() => {
                            estornar.mutate({ id: r.id, rowVersion: r.rowVersion })
                          }}
                        >
                          Estornar
                        </Botao>
                      )}
                    </div>
                  ))}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      {lancando ? (
        <DialogoLancarHoras
          orcamentoId={orcamentoId}
          itens={itens}
          hoje={hoje}
          aberto={lancando}
          aoMudar={setLancando}
        />
      ) : null}
      {recebendo ? (
        <DialogoRecebimento
          key={recebendo.id}
          orcamentoId={orcamentoId}
          parcela={recebendo}
          hoje={hoje}
          aoMudar={(aberto) => {
            if (!aberto) setRecebendo(null)
          }}
        />
      ) : null}
    </section>
  )
}
