// "Registrar aprovação" (Protótipo 22; ADR-0029; FIN-01, FIN-03): aceite do cliente (quem, quando,
// referência e método) e o roteiro de tarefas da execução, uma por serviço, com o responsável, as
// horas e o fim do mês previsto escolhidos no orçamento. Tudo editável antes de confirmar. A RPC
// valida tudo antes de gravar (sem efeitos parciais) e não duplica tarefa de serviço que já tem.

import {
  METODOS_DE_ACEITE,
  ROTULO_DO_METODO_DE_ACEITE,
  errosDoAceite,
  errosDoRoteiro,
  formatarDuracao,
  hojeNoFuso,
  minutosDasHoras,
  roteiroInicial,
  type DataCivil,
  type MetodoDeAceite,
  type TarefaDoRoteiro,
} from '@gestao-ambiental/domain'
import { useQuery } from '@tanstack/react-query'
import { useId, useState } from 'react'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Botao } from '@/components/ui/botao'
import { BotaoIcone } from '@/components/ui/botao-icone'
import { CaixaSelecao } from '@/components/ui/caixa-selecao'
import { CampoData } from '@/components/ui/campo-data'
import { CampoTexto } from '@/components/ui/campo-texto'
import { Dialogo } from '@/components/ui/dialogo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import type { Orcamento } from '@/lib/api/orcamentos'
import { listarMembrosAtivos } from '@/lib/api/perfil'
import { CHAVE_TAREFAS, aprovarOrcamento, listarTarefasDeServico } from '@/lib/api/tarefas'
import { mensagemDoErro } from '@/lib/erros'

import { classeCampo } from './comum'

type OrcamentoParaAprovar = Pick<Orcamento, 'id' | 'rowVersion' | 'itens'>

interface Props {
  orcamento: OrcamentoParaAprovar
  aberto: boolean
  aoMudarAberto: (aberto: boolean) => void
  aoAprovar: () => void
}

/** Abre o diálogo já com o roteiro montado (os dados chegam antes de montar o formulário). */
export function DialogoAprovarOrcamento({ orcamento, aberto, aoMudarAberto, aoAprovar }: Props) {
  const { atual } = useConsultoria()
  const cid = atual.consultoriaId
  const membros = useQuery({
    queryKey: ['membros-ativos', cid],
    queryFn: () => listarMembrosAtivos(cid),
    enabled: aberto,
  })
  const existentes = useQuery({
    queryKey: [CHAVE_TAREFAS, cid, orcamento.id],
    queryFn: () => listarTarefasDeServico(cid, { orcamentoId: orcamento.id }),
    enabled: aberto,
  })
  const pronto = membros.isSuccess && existentes.isSuccess
  const falhaAoCarregar = membros.isError || existentes.isError

  return (
    <Dialogo
      aberto={aberto}
      aoMudar={aoMudarAberto}
      titulo="Registrar aprovação"
      descricao="Aceite do cliente e tarefas da execução."
      largura={880}
    >
      {falhaAoCarregar ? (
        <MensagemSecao role="alert" tom="perigo">
          Não foi possível carregar a equipe e as tarefas. Feche e tente de novo.
        </MensagemSecao>
      ) : !pronto ? (
        <p className="corpo text-(--tinta-2)" aria-busy="true">
          Carregando…
        </p>
      ) : (
        <FormularioDeAprovacao
          orcamento={orcamento}
          hoje={hojeNoFuso(new Date(), atual.fuso)}
          pessoas={membros.data.map((m) => ({ id: m.id, nome: m.nome }))}
          itensComTarefa={
            new Set(
              existentes.data
                .map((t) => t.orcamentoItemId)
                .filter((id): id is string => id !== null),
            )
          }
          aoCancelar={() => {
            aoMudarAberto(false)
          }}
          aoAprovar={aoAprovar}
        />
      )}
    </Dialogo>
  )
}

function FormularioDeAprovacao({
  orcamento,
  hoje,
  pessoas,
  itensComTarefa,
  aoCancelar,
  aoAprovar,
}: {
  orcamento: OrcamentoParaAprovar
  hoje: DataCivil
  pessoas: { id: string; nome: string }[]
  itensComTarefa: ReadonlySet<string>
  aoCancelar: () => void
  aoAprovar: () => void
}) {
  const idMetodo = useId()
  const [aprovadoPor, setAprovadoPor] = useState('')
  const [dataAceite, setDataAceite] = useState<DataCivil | null>(hoje)
  const [referencia, setReferencia] = useState('')
  const [metodo, setMetodo] = useState<MetodoDeAceite | ''>('')
  const [gerar, setGerar] = useState(true)
  const [roteiro, setRoteiro] = useState<TarefaDoRoteiro[]>(() =>
    roteiroInicial(orcamento.itens, itensComTarefa),
  )
  const [tentou, setTentou] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const errosAceite = errosDoAceite({ aprovadoPor, dataAceite: dataAceite ?? '', referencia }, hoje)
  const errosTarefas = gerar ? errosDoRoteiro(roteiro) : {}
  const temErro = Object.keys(errosAceite).length > 0 || Object.keys(errosTarefas).length > 0
  const minutosTotais = roteiro.reduce((soma, t) => soma + (minutosDasHoras(t.horas) ?? 0), 0)
  const semHoras = roteiro.filter((t) => minutosDasHoras(t.horas) === null).length

  function mudarTarefa(chave: string, mudanca: Partial<TarefaDoRoteiro>) {
    setRoteiro((lista) => lista.map((t) => (t.chave === chave ? { ...t, ...mudanca } : t)))
  }

  async function confirmar() {
    setTentou(true)
    setFalha(null)
    if (temErro || dataAceite === null) return
    setEnviando(true)
    try {
      await aprovarOrcamento(
        orcamento.id,
        orcamento.rowVersion,
        { aprovadoPor, dataAceite, referencia, metodo: metodo === '' ? null : metodo },
        gerar,
        roteiro,
      )
      aoAprovar()
    } catch (erro) {
      setFalha(mensagemDoErro(erro))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex flex-col gap-(--e-4)">
      <section aria-label="Registro do aceite" className="flex flex-col gap-(--e-3)">
        <h3 className="titulo-secao">Registro do aceite</h3>
        <div className="grid gap-(--e-3) sm:grid-cols-2">
          <CampoTexto
            rotulo="Quem aprovou"
            value={aprovadoPor}
            maxLength={200}
            erro={tentou ? errosAceite.aprovadoPor : undefined}
            onChange={(e) => {
              setAprovadoPor(e.target.value)
            }}
          />
          <CampoData
            rotulo="Data do aceite"
            valor={dataAceite}
            aoMudar={setDataAceite}
            hoje={hoje}
            maximo={hoje}
            motivoDoLimite="O aceite não pode ter data futura."
            erro={tentou ? errosAceite.dataAceite : undefined}
          />
          <CampoTexto
            rotulo="Referência"
            placeholder="Ex.: e-mail de 12/11, pedido 4521"
            value={referencia}
            maxLength={300}
            erro={tentou ? errosAceite.referencia : undefined}
            onChange={(e) => {
              setReferencia(e.target.value)
            }}
          />
          <label htmlFor={idMetodo} className="flex flex-col gap-(--e-1)">
            <span className="rotulo">Como aprovou (opcional)</span>
            <select
              id={idMetodo}
              className={classeCampo}
              value={metodo}
              onChange={(e) => {
                setMetodo(e.target.value as MetodoDeAceite | '')
              }}
            >
              <option value="">Não informado</option>
              {METODOS_DE_ACEITE.map((m) => (
                <option key={m} value={m}>
                  {ROTULO_DO_METODO_DE_ACEITE[m]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section aria-label="Tarefas da execução" className="flex flex-col gap-(--e-3)">
        <div className="flex flex-wrap items-center justify-between gap-(--e-2)">
          <h3 className="titulo-secao">Tarefas da execução</h3>
          <CaixaSelecao
            rotulo="Gerar tarefas com a aprovação"
            checked={gerar}
            onChange={(e) => {
              setGerar(e.target.checked)
            }}
          />
        </div>
        {gerar ? (
          <>
            <ol className="flex flex-col gap-(--e-2)" aria-label="Roteiro de tarefas">
              {roteiro.map((t, indice) => {
                const erros = tentou ? errosTarefas[t.chave] : undefined
                const n = String(indice + 1)
                return (
                  <li
                    key={t.chave}
                    className="grid items-end gap-(--e-2) rounded-(--raio) border p-(--e-2) sm:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_88px_minmax(0,1.2fr)_auto]"
                  >
                    <CampoTexto
                      rotulo={`Tarefa ${n}`}
                      value={t.titulo}
                      maxLength={200}
                      erro={erros?.titulo}
                      onChange={(e) => {
                        mudarTarefa(t.chave, { titulo: e.target.value })
                      }}
                    />
                    <label className="flex flex-col gap-(--e-1)">
                      <span className="rotulo">Responsável</span>
                      <select
                        className={classeCampo}
                        value={t.responsavelId ?? ''}
                        onChange={(e) => {
                          mudarTarefa(t.chave, { responsavelId: e.target.value || null })
                        }}
                      >
                        <option value="">Sem responsável</option>
                        {pessoas.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nome}
                          </option>
                        ))}
                      </select>
                    </label>
                    <CampoTexto
                      rotulo="Horas"
                      inputMode="decimal"
                      placeholder="—"
                      value={t.horas}
                      erro={erros?.horas}
                      onChange={(e) => {
                        mudarTarefa(t.chave, { horas: e.target.value })
                      }}
                    />
                    <CampoData
                      rotulo="Prazo interno"
                      valor={t.prazoInterno === '' ? null : t.prazoInterno}
                      aoMudar={(data) => {
                        mudarTarefa(t.chave, { prazoInterno: data ?? '' })
                      }}
                      hoje={hoje}
                    />
                    <BotaoIcone
                      icone="x"
                      rotulo={`Remover a tarefa ${n}`}
                      onClick={() => {
                        setRoteiro((lista) => lista.filter((x) => x.chave !== t.chave))
                      }}
                    />
                  </li>
                )
              })}
            </ol>
            <div className="flex flex-wrap items-center justify-between gap-(--e-2)">
              <Botao
                tamanho="compacto"
                onClick={() => {
                  setRoteiro((lista) => [
                    ...lista,
                    {
                      chave: crypto.randomUUID(),
                      itemId: null,
                      titulo: '',
                      responsavelId: null,
                      horas: '',
                      prazoInterno: '',
                    },
                  ])
                }}
              >
                Adicionar tarefa
              </Botao>
              <p className="corpo tabular-nums" aria-live="polite">
                {roteiro.length} {roteiro.length === 1 ? 'tarefa' : 'tarefas'} ·{' '}
                {formatarDuracao(minutosTotais)} estimadas
                {semHoras > 0 ? ` · ${String(semHoras)} sem horas` : ''}
              </p>
            </div>
          </>
        ) : null}
      </section>

      {falha ? (
        <MensagemSecao role="alert" tom="perigo">
          {falha}
        </MensagemSecao>
      ) : tentou && temErro ? (
        <MensagemSecao role="alert" tom="perigo">
          Confira os campos marcados.
        </MensagemSecao>
      ) : null}

      <div className="flex flex-wrap justify-end gap-(--e-2)">
        <Botao onClick={aoCancelar}>Cancelar</Botao>
        <Botao
          aparencia="primario"
          disabled={enviando}
          aria-busy={enviando || undefined}
          onClick={() => void confirmar()}
        >
          {enviando ? 'Aprovando…' : 'Confirmar aprovação'}
        </Botao>
      </div>
    </div>
  )
}
