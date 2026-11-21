// Painel do dono (P8, ADR-0054): três quadros abaixo do placar do mês. São "agora", não mês
// fechado: clientes em risco (mais grave primeiro), carga das próximas 2 semanas por pessoa e
// dinheiro por cliente (só com a permissão financeira). Só a Gestão chega aqui.
import {
  formatarDuracao,
  formatarReais,
  motivosDoRisco,
  ordenarClientesEmRisco,
} from '@gestao-ambiental/domain'
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { Carregando, EstadoErro } from '@/components/estados'
import { ehSemPermissao } from '@/lib/erros'
import {
  listarCarga,
  listarClientesEmRisco,
  listarDinheiroPorCliente,
} from '@/lib/api/painel-do-dono'

const classeQuadro =
  'flex min-w-0 flex-col overflow-hidden rounded-(--raio-painel) border bg-(--folha)'
const classeCabecalho =
  'h-10 border-b px-(--e-3) text-left whitespace-nowrap rotulo-maiusculo text-(--tinta-2)'
const classeCelula = 'h-(--linha) border-b border-(--regra-leve) px-(--e-3) align-middle'

function Quadro({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className={classeQuadro}>
      <h2 id={id} className="border-b px-(--e-4) py-(--e-3) titulo-secao text-(--tinta)">
        {titulo}
      </h2>
      {children}
    </section>
  )
}

function Vazio({ children }: { children: ReactNode }) {
  return <p className="px-(--e-4) py-(--e-4) corpo text-(--tinta-2)">{children}</p>
}

function ClientesEmRisco({ consultoriaId }: { consultoriaId: string }) {
  const consulta = useQuery({
    queryKey: ['painel-risco', consultoriaId],
    queryFn: () => listarClientesEmRisco(consultoriaId),
  })
  return (
    <Quadro id="quadro-risco" titulo="Clientes em risco">
      {consulta.isPending ? (
        <Carregando rotulo="Carregando os clientes em risco" linhas={3} />
      ) : consulta.isError ? (
        <EstadoErro
          titulo="Não foi possível carregar os clientes em risco."
          aoTentarDeNovo={() => void consulta.refetch()}
        />
      ) : (
        (() => {
          const lista = ordenarClientesEmRisco(consulta.data)
          if (lista.length === 0) return <Vazio>Nenhum cliente em risco.</Vazio>
          return (
            <ol aria-label="Clientes em risco, do mais grave" className="flex flex-col">
              {lista.map((c) => (
                <li
                  key={c.chave}
                  className="flex flex-col gap-(--e-05) border-b border-(--regra-leve) px-(--e-4) py-(--e-3) last:border-b-0"
                >
                  <span className="corpo-forte text-(--tinta)">{c.nome}</span>
                  <span className="text-xs text-(--atraso-texto)">
                    {motivosDoRisco(c, formatarReais(c.receberVencidoCentavos)).join(' · ')}
                  </span>
                  {c.aprovadoCentavos > 0 ? (
                    <span className="text-xs numero text-(--tinta-2)">
                      Aprovado {formatarReais(c.aprovadoCentavos)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          )
        })()
      )}
    </Quadro>
  )
}

function CargaDasDuasSemanas({ consultoriaId }: { consultoriaId: string }) {
  const consulta = useQuery({
    queryKey: ['painel-carga', consultoriaId],
    queryFn: () => listarCarga(consultoriaId),
  })
  return (
    <Quadro id="quadro-carga" titulo="Carga das próximas 2 semanas">
      {consulta.isPending ? (
        <Carregando rotulo="Carregando a carga" linhas={3} />
      ) : consulta.isError ? (
        <EstadoErro
          titulo="Não foi possível carregar a carga."
          aoTentarDeNovo={() => void consulta.refetch()}
        />
      ) : consulta.data.length === 0 ? (
        <Vazio>Ninguém com prazo nas próximas 2 semanas.</Vazio>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] corpo">
            <caption className="sr-only">Carga por pessoa nas próximas 2 semanas</caption>
            <thead>
              <tr>
                <th scope="col" className={classeCabecalho}>
                  Pessoa
                </th>
                <th scope="col" className={`${classeCabecalho} text-right`}>
                  Prazos
                </th>
                <th scope="col" className={`${classeCabecalho} text-right`}>
                  Atrasados
                </th>
                <th scope="col" className={`${classeCabecalho} text-right`}>
                  Tarefas
                </th>
              </tr>
            </thead>
            <tbody>
              {[...consulta.data]
                .sort(
                  (a, b) =>
                    b.atrasados - a.atrasados ||
                    b.prazos - a.prazos ||
                    b.minutosTarefas - a.minutosTarefas,
                )
                .map((p) => (
                  <tr key={p.membroId ?? 'sem-responsavel'}>
                    <th scope="row" className={`${classeCelula} text-left font-normal`}>
                      {p.nome ?? 'Sem responsável'}
                    </th>
                    <td className={`${classeCelula} text-right numero`}>{p.prazos}</td>
                    <td
                      className={`${classeCelula} text-right numero ${p.atrasados > 0 ? 'font-[700] text-(--atraso-texto)' : ''}`}
                    >
                      {p.atrasados}
                    </td>
                    <td className={`${classeCelula} text-right numero`}>
                      {p.minutosTarefas > 0 ? formatarDuracao(p.minutosTarefas) : '—'}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </Quadro>
  )
}

function DinheiroPorCliente({ consultoriaId }: { consultoriaId: string }) {
  const consulta = useQuery({
    queryKey: ['painel-dinheiro', consultoriaId],
    queryFn: () => listarDinheiroPorCliente(consultoriaId),
    retry: false,
  })
  // Sem a permissão financeira o quadro não aparece.
  if (consulta.isError && ehSemPermissao(consulta.error)) return null
  return (
    <Quadro id="quadro-dinheiro" titulo="Dinheiro por cliente">
      {consulta.isPending ? (
        <Carregando rotulo="Carregando o dinheiro por cliente" linhas={3} />
      ) : consulta.isError ? (
        <EstadoErro
          titulo="Não foi possível carregar o dinheiro por cliente."
          aoTentarDeNovo={() => void consulta.refetch()}
        />
      ) : consulta.data.length === 0 ? (
        <Vazio>Nenhum orçamento aprovado com parcelas.</Vazio>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] corpo">
            <caption className="sr-only">Dinheiro por cliente</caption>
            <thead>
              <tr>
                <th scope="col" className={classeCabecalho}>
                  Cliente
                </th>
                <th scope="col" className={`${classeCabecalho} text-right`}>
                  Aprovado
                </th>
                <th scope="col" className={`${classeCabecalho} text-right`}>
                  Recebido
                </th>
                <th scope="col" className={`${classeCabecalho} text-right`}>
                  A receber
                </th>
              </tr>
            </thead>
            <tbody>
              {consulta.data.map((c) => (
                <tr key={c.chave}>
                  <th scope="row" className={`${classeCelula} text-left font-normal`}>
                    {c.nome}
                  </th>
                  <td className={`${classeCelula} text-right numero`}>
                    {formatarReais(c.aprovadoCentavos)}
                  </td>
                  <td className={`${classeCelula} text-right numero`}>
                    {formatarReais(c.recebidoCentavos)}
                  </td>
                  <td className={`${classeCelula} text-right numero`}>
                    {formatarReais(c.aReceberCentavos)}
                    {c.vencidoCentavos > 0 ? (
                      <span className="block text-xs text-(--atraso-texto)">
                        Vencido {formatarReais(c.vencidoCentavos)}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Quadro>
  )
}

export function QuadrosDoDono({ consultoriaId }: { consultoriaId: string }) {
  return (
    <div className="grid gap-(--e-4) xl:grid-cols-2">
      <ClientesEmRisco consultoriaId={consultoriaId} />
      <CargaDasDuasSemanas consultoriaId={consultoriaId} />
      <div className="xl:col-span-2">
        <DinheiroPorCliente consultoriaId={consultoriaId} />
      </div>
    </div>
  )
}
