import {
  CODIGOS_DE_PLANO,
  ROTULO_DO_CICLO,
  ehCodigoPlano,
  formatarDataCivil,
  formatarReais,
  hojeNoFuso,
  type CodigoPlano,
  type DataCivil,
} from '@gestao-ambiental/domain'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { opcoesDoCatalogo, useCatalogoComercial } from '@/app/plano/catalogo'
import { TOM_DA_SITUACAO_COMERCIAL, rotuloDaSituacao } from '@/app/plano/situacao'
import { Carregando, EstadoErro } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { CampoData } from '@/components/ui/campo-data'
import { CampoTexto } from '@/components/ui/campo-texto'
import { Dialogo } from '@/components/ui/dialogo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Selo } from '@/components/ui/selo'
import {
  ROTULO_DA_COBRANCA,
  ajustarDiasDeTeste,
  definirPlanoPorContrato,
  listarCobrancasNaCentral,
  listarHistoricoComercial,
  marcarContaInterna,
  obterPlanoNaCentral,
  simularAtraso,
  simularPagamento,
} from '@/lib/api/plano'
import { formatarInstanteComHora } from '@/lib/datas'
import { mensagemDoErro } from '@/lib/erros'

import { classeCabecalho, classeCelula } from './comum'

type Acao = 'dias' | 'interna' | 'contrato' | 'encerrar_contrato' | null

/** "escala até 2027-12-31" (histórico do banco) → "Escala até 31/12/2027". */
function textoDoContrato(valor: string, nomes: Partial<Record<CodigoPlano, string>>): string {
  if (valor === 'sem contrato') return 'sem contrato'
  const [codigo, ...resto] = valor.split(' ')
  const nome = ehCodigoPlano(codigo) ? (nomes[codigo] ?? codigo) : (codigo ?? '')
  const data = /(\d{4}-\d{2}-\d{2})$/.exec(valor)?.[1]
  return data ? `${nome} até ${formatarDataCivil(data as DataCivil)}` : `${nome} ${resto.join(' ')}`
}

/**
 * Plano e cobrança no detalhe da consultoria, na central (ADR-0026): situação, plano, uso contra o
 * limite, cobranças, dias de teste e conta interna (com motivo, no histórico). No protótipo, a
 * cobrança é simulada: "Simular atraso" e "Simular pagamento" demonstram a faixa e o só leitura.
 */
export function PlanoNaCentral({ consultoriaId, fuso }: { consultoriaId: string; fuso: string }) {
  const queryClient = useQueryClient()
  const chave = ['central', 'plano', consultoriaId]
  const plano = useQuery({
    queryKey: chave,
    queryFn: () => obterPlanoNaCentral(consultoriaId, () => queryClient.query(opcoesDoCatalogo)),
  })
  const catalogo = useCatalogoComercial()
  const cobrancas = useQuery({
    queryKey: [...chave, 'cobrancas'],
    queryFn: () => listarCobrancasNaCentral(consultoriaId, 0),
  })
  const historico = useQuery({
    queryKey: [...chave, 'historico'],
    queryFn: () => listarHistoricoComercial(consultoriaId),
  })
  const [acao, setAcao] = useState<Acao>(null)
  const [dias, setDias] = useState('10')
  const [planoDoContrato, setPlanoDoContrato] = useState<CodigoPlano>('equipe')
  const [contratoAte, setContratoAte] = useState<DataCivil | null>(null)
  const [motivo, setMotivo] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)

  const atualizar = () => queryClient.invalidateQueries({ queryKey: ['central'] })

  const atraso = useMutation({
    mutationFn: () => simularAtraso(consultoriaId, 5),
    onSuccess: async () => {
      setAviso('Atraso simulado: cobrança vencida há 5 dias.')
      await atualizar()
    },
  })
  const pagamento = useMutation({
    mutationFn: () => simularPagamento(consultoriaId),
    onSuccess: async (total) => {
      setAviso(total === 1 ? '1 cobrança paga.' : `${String(total)} cobranças pagas.`)
      await atualizar()
    },
  })
  const salvar = useMutation({
    mutationFn: async () => {
      const versao = plano.data?.condicaoRowVersion ?? 0
      if (acao === 'dias') return ajustarDiasDeTeste(consultoriaId, Number(dias), motivo, versao)
      if (acao === 'contrato')
        return definirPlanoPorContrato(consultoriaId, planoDoContrato, contratoAte, motivo, versao)
      if (acao === 'encerrar_contrato')
        return definirPlanoPorContrato(consultoriaId, null, null, motivo, versao)
      return marcarContaInterna(consultoriaId, !plano.data?.dados?.interna, motivo, versao)
    },
    onSuccess: async () => {
      setAcao(null)
      setMotivo('')
      await atualizar()
    },
  })

  if (plano.isPending) return <Carregando rotulo="Carregando o plano" linhas={3} />
  if (plano.isError || !plano.data.dados)
    return (
      <EstadoErro
        titulo="Não foi possível carregar o plano."
        aoTentarDeNovo={() => void plano.refetch()}
      />
    )
  const d = plano.data.dados
  const s = d.situacao
  const nomes: Partial<Record<CodigoPlano, string>> = {}
  for (const c of CODIGOS_DE_PLANO) nomes[c] = catalogo.data?.planos[c].nome ?? c
  const hoje = hojeNoFuso(new Date(), fuso)
  const erro = atraso.error ?? pagamento.error

  return (
    <section aria-labelledby="central-plano" className="flex flex-col gap-(--e-3)">
      <h2 id="central-plano" className="titulo-secao text-(--tinta)">
        Plano e cobrança
      </h2>
      <div className="flex flex-col gap-(--e-3) rounded-(--raio-painel) border bg-(--folha) p-(--e-4) shadow-cartao">
        <div className="flex flex-wrap items-center gap-(--e-2)">
          <Selo tom={TOM_DA_SITUACAO_COMERCIAL[s.situacao]}>{rotuloDaSituacao(s)}</Selo>
          <span>
            {s.situacao === 'contrato' && s.planoVigente
              ? `${nomes[s.planoVigente] ?? s.planoVigente} por contrato · ${
                  d.contrato?.ate ? `até ${formatarDataCivil(d.contrato.ate)}` : 'sem prazo'
                } · sem cobrança pelo Grama`
              : s.planoVigente && s.cicloVigente && catalogo.data
                ? `${catalogo.data.planos[s.planoVigente].nome} · ${ROTULO_DO_CICLO[s.cicloVigente]}`
                : 'Sem plano'}
          </span>
        </div>
        <dl className="grid grid-cols-1 gap-(--e-2) sm:grid-cols-3">
          <div>
            <dt className="rotulo">Pessoas</dt>
            <dd className="tabular-nums">
              {s.limites
                ? `${String(d.uso.pessoas)} de ${String(s.limites.pessoas)}`
                : d.uso.pessoas}
            </dd>
          </div>
          <div>
            <dt className="rotulo">Empreendimentos ativos</dt>
            <dd className="tabular-nums">
              {s.limites
                ? `${String(d.uso.empreendimentos)} de ${String(s.limites.empreendimentos)}`
                : d.uso.empreendimentos}
            </dd>
          </div>
          <div>
            <dt className="rotulo">Teste</dt>
            <dd>
              {String(d.diasDeTeste)} dias úteis, até {formatarDataCivil(s.testeAte)}
            </dd>
          </div>
        </dl>

        <div className="flex flex-wrap gap-(--e-2)">
          <Botao
            onClick={() => {
              setDias(String(d.diasDeTeste))
              setAcao('dias')
            }}
          >
            Ajustar dias de teste
          </Botao>
          <Botao
            onClick={() => {
              setAcao('interna')
            }}
          >
            {d.interna ? 'Desmarcar conta interna' : 'Marcar como conta interna'}
          </Botao>
          <Botao
            onClick={() => {
              setPlanoDoContrato(d.contrato?.plano ?? 'equipe')
              setContratoAte(d.contrato?.ate ?? null)
              setAcao('contrato')
            }}
          >
            {d.contrato ? 'Mudar plano por contrato' : 'Definir plano por contrato'}
          </Botao>
          {d.contrato ? (
            <Botao
              onClick={() => {
                setAcao('encerrar_contrato')
              }}
            >
              Encerrar contrato
            </Botao>
          ) : null}
          {d.assinatura && !d.assinatura.validaAte ? (
            <>
              <Botao
                disabled={atraso.isPending}
                onClick={() => {
                  setAviso(null)
                  atraso.mutate()
                }}
              >
                Simular atraso
              </Botao>
              <Botao
                disabled={pagamento.isPending}
                onClick={() => {
                  setAviso(null)
                  pagamento.mutate()
                }}
              >
                Simular pagamento
              </Botao>
            </>
          ) : null}
        </div>
        {aviso ? (
          <MensagemSecao tom="sucesso" role="status">
            {aviso}
          </MensagemSecao>
        ) : null}
        {erro ? (
          <MensagemSecao tom="perigo" role="alert">
            {mensagemDoErro(erro)}
          </MensagemSecao>
        ) : null}

        {cobrancas.data && cobrancas.data.itens.length > 0 ? (
          <div
            role="region"
            aria-label="Cobranças da consultoria"
            className="overflow-x-auto rounded-(--raio) border"
          >
            <table className="w-full border-collapse corpo">
              <thead>
                <tr>
                  <th scope="col" className={classeCabecalho}>
                    Vencimento
                  </th>
                  <th scope="col" className={`${classeCabecalho} text-right`}>
                    Valor
                  </th>
                  <th scope="col" className={classeCabecalho}>
                    Situação
                  </th>
                </tr>
              </thead>
              <tbody>
                {cobrancas.data.itens.map((c) => (
                  <tr key={c.id} className="last:[&>td]:border-b-0">
                    <td className={classeCelula}>
                      {formatarDataCivil(c.vencimento as DataCivil)}
                      {c.tipo === 'adicionais' ? ' · Adicionais' : ''}
                    </td>
                    <td className={`${classeCelula} text-right tabular-nums`}>
                      {formatarReais(c.valorCentavos)}
                    </td>
                    <td className={classeCelula}>{ROTULO_DA_COBRANCA[c.situacao]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {historico.data && historico.data.length > 0 ? (
          <ul aria-label="Histórico comercial" className="flex flex-col gap-(--e-15)">
            {historico.data.map((h) => (
              <li key={h.id}>
                {formatarInstanteComHora(h.alteradaEm, fuso)} · {h.alteradaPorNome} ·{' '}
                {h.tipo === 'interna'
                  ? h.valorNovo === 'true'
                    ? 'Marcou conta interna'
                    : 'Desmarcou conta interna'
                  : h.tipo === 'plano_contrato'
                    ? `Plano por contrato: ${textoDoContrato(h.valorAnterior, nomes)} → ${textoDoContrato(h.valorNovo, nomes)}`
                    : `Dias de teste: ${h.valorAnterior} → ${h.valorNovo}`}{' '}
                · {h.motivo}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <Dialogo
        aberto={acao !== null}
        aoMudar={(aberto) => {
          if (!aberto && !salvar.isPending) {
            setAcao(null)
            salvar.reset()
          }
        }}
        titulo={
          acao === 'dias'
            ? 'Ajustar dias de teste'
            : acao === 'contrato'
              ? 'Plano por contrato'
              : acao === 'encerrar_contrato'
                ? 'Encerrar contrato'
                : d.interna
                  ? 'Desmarcar conta interna'
                  : 'Marcar como conta interna'
        }
        acoes={
          <>
            <Botao
              disabled={salvar.isPending}
              onClick={() => {
                setAcao(null)
              }}
            >
              Cancelar
            </Botao>
            <Botao
              aparencia="primario"
              disabled={salvar.isPending || motivo.trim() === ''}
              onClick={() => {
                salvar.mutate()
              }}
            >
              Salvar
            </Botao>
          </>
        }
      >
        {acao === 'contrato' ? (
          <>
            <label className="flex flex-col gap-(--e-1)">
              <span className="rotulo">Plano</span>
              <select
                className="h-(--controle) rounded-(--raio) border bg-(--folha) px-(--e-2)"
                value={planoDoContrato}
                onChange={(e) => {
                  if (ehCodigoPlano(e.target.value)) setPlanoDoContrato(e.target.value)
                }}
              >
                {CODIGOS_DE_PLANO.map((c) => (
                  <option key={c} value={c}>
                    {nomes[c]}
                  </option>
                ))}
              </select>
            </label>
            <CampoData
              rotulo="Vale até (vazio = sem prazo)"
              valor={contratoAte}
              aoMudar={setContratoAte}
              hoje={hoje}
              minimo={hoje}
              motivoDoLimite="O contrato não pode acabar no passado."
            />
          </>
        ) : null}
        {acao === 'dias' ? (
          <CampoTexto
            rotulo="Dias úteis de teste"
            inputMode="numeric"
            value={dias}
            onChange={(e) => {
              setDias(e.target.value.replace(/\D/g, '').slice(0, 3))
            }}
          />
        ) : null}
        <CampoTexto
          rotulo="Motivo"
          value={motivo}
          maxLength={500}
          onChange={(e) => {
            setMotivo(e.target.value)
          }}
        />
        {salvar.isError ? (
          <p role="alert" className="text-(--atraso-texto)">
            {mensagemDoErro(salvar.error)}
          </p>
        ) : null}
      </Dialogo>
    </section>
  )
}
