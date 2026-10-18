import {
  datasRenovacaoLao,
  ehLao,
  formatarDataCivil,
  type DataCivil,
} from '@gestao-ambiental/domain'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Botao } from '@/components/ui/botao'
import { CampoTexto } from '@/components/ui/campo-texto'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { listarUnidades } from '@/lib/api/empreendimentos'
import {
  criarTipo,
  listarOrgaos,
  listarTipos,
  salvarIdentificacao,
  type DadosIdentificacao,
  type Instrumento,
  type Marco,
} from '@/lib/api/licencas'
import { codigoDoErro, mensagemDoErro } from '@/lib/erros'

import { GuardaRascunho } from './GuardaCadastro'
import { MolduraCadastro, RodapeCadastro } from './MolduraCadastro'
import { PainelPdf } from './PainelPdf'
import { useSalvamento } from './usar-rascunho'

const NOVO_TIPO = '__novo'

type CampoDeData = 'emitidoEm' | 'assinadoEm' | 'publicadoEm' | 'recebidoEm'

const MARCOS: { chave: Marco; rotulo: string; campo: CampoDeData }[] = [
  { chave: 'emissao', rotulo: 'Emissão', campo: 'emitidoEm' },
  { chave: 'assinatura', rotulo: 'Assinatura', campo: 'assinadoEm' },
  { chave: 'publicacao', rotulo: 'Publicação', campo: 'publicadoEm' },
  { chave: 'recebimento', rotulo: 'Recebimento', campo: 'recebidoEm' },
]

const classeSelect =
  'h-(--size-control) w-full rounded-(--radius) border border-(--border-input) bg-(--surface-input) px-(--space-100) corpo text-(--text) outline-none focus:border-(--border-focus)'

function inicial(instrumento: Instrumento): DadosIdentificacao {
  return {
    unidadeId: instrumento.unidadeId,
    tipoId: instrumento.tipoId,
    numero: instrumento.numero ?? '',
    orgao: instrumento.orgao ?? '',
    emitidoEm: instrumento.emitidoEm,
    assinadoEm: instrumento.assinadoEm,
    publicadoEm: instrumento.publicadoEm,
    recebidoEm: instrumento.recebidoEm,
    marco: instrumento.marco,
    validade: instrumento.validade,
  }
}

/** Valor de <input type="date"> (já é AAAA-MM-DD, sem fuso) ou nulo. */
function dataDe(valor: string): DataCivil | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? (valor as DataCivil) : null
}

/** /licencas/:id/identificacao (Protótipo 11; LIC-01). Rascunho salva incompleto. */
export function PassoIdentificacao() {
  const { id = '' } = useParams()
  // Fora do formulário: o formulário remonta com a versão salva, o "salvo às" continua.
  const salvamento = useSalvamento(id)
  return (
    <GuardaRascunho id={id} passo="identificacao">
      {(instrumento) => (
        <Identificacao
          key={`${instrumento.id}:${String(instrumento.rowVersion)}`}
          instrumento={instrumento}
          salvamento={salvamento}
        />
      )}
    </GuardaRascunho>
  )
}

function Identificacao({
  instrumento,
  salvamento: { salvoEm, registrar },
}: {
  instrumento: Instrumento
  salvamento: ReturnType<typeof useSalvamento>
}) {
  const { atual } = useConsultoria()
  const cid = atual.consultoriaId
  const navegar = useNavigate()
  const queryClient = useQueryClient()
  const [dados, setDados] = useState(() => inicial(instrumento))
  const [novoTipo, setNovoTipo] = useState({ sigla: '', nome: '' })
  const [criandoTipo, setCriandoTipo] = useState(false)

  const tipos = useQuery({ queryKey: ['tipos', cid], queryFn: () => listarTipos(cid) })
  const orgaos = useQuery({ queryKey: ['orgaos', cid], queryFn: () => listarOrgaos(cid) })
  const unidades = useQuery({
    queryKey: ['unidades', instrumento.empreendimentoId],
    queryFn: () => listarUnidades(instrumento.empreendimentoId),
  })

  const tipo = tipos.data?.find((t) => t.id === dados.tipoId)
  const marcosPreenchidos = MARCOS.filter((m) => dados[m.campo])
  const completa = Boolean(dados.tipoId && dados.marco && dados.validade)

  function mudar<K extends keyof DadosIdentificacao>(campo: K, valor: DadosIdentificacao[K]) {
    setDados((anterior) => {
      const proximo = { ...anterior, [campo]: valor }
      // Marco sem a data correspondente deixa de valer (o banco também recusa).
      const marco = MARCOS.find((m) => m.chave === proximo.marco)
      if (marco && !proximo[marco.campo]) proximo.marco = null
      return proximo
    })
  }

  const salvar = useMutation({
    mutationFn: () => salvarIdentificacao(instrumento.id, instrumento.rowVersion, dados),
  })
  const adicionarTipo = useMutation({
    mutationFn: () => criarTipo(cid, novoTipo.sigla, novoTipo.nome),
    onSuccess: async (tipoId) => {
      await queryClient.invalidateQueries({ queryKey: ['tipos', cid] })
      mudar('tipoId', tipoId)
      setCriandoTipo(false)
      setNovoTipo({ sigla: '', nome: '' })
    },
  })

  async function gravar(depois?: string) {
    try {
      await salvar.mutateAsync()
      if (depois) await navegar(depois)
      await registrar()
    } catch {
      // a mensagem aparece pela mutation
    }
  }

  const conflito = codigoDoErro(salvar.error) === 'conflito_de_versao'
  const limite =
    dados.validade && ehLao(tipo?.sigla)
      ? formatarDataCivil(datasRenovacaoLao(dados.validade).limiteProtocolo)
      : null

  return (
    <MolduraCadastro
      passo="identificacao"
      instrumentoId={instrumento.id}
      identificacao={tipo && dados.numero ? `${tipo.sigla} ${dados.numero}` : null}
      contexto={`${instrumento.empreendimentoNome} · ${instrumento.unidadeNome}`}
      sairPara={`/empreendimentos/${instrumento.empreendimentoId}`}
      salvoEm={salvoEm}
      larga
      rodape={
        <RodapeCadastro
          aoSalvar={() => void gravar()}
          salvando={salvar.isPending}
          aviso={
            completa ? undefined : 'Continuar exige tipo, marco dos prazos e validade confirmada.'
          }
          voltarPara={`/licencas/${instrumento.id}/documento`}
          aoContinuar={() => void gravar(`/licencas/${instrumento.id}/condicionantes`)}
          podeContinuar={completa}
          continuando={salvar.isPending}
        />
      }
    >
      <div className="grid h-full min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <form
          noValidate
          aria-label="Identificação da licença"
          onSubmit={(evento) => {
            evento.preventDefault()
          }}
          className="flex min-h-0 flex-col gap-(--space-300) overflow-auto p-(--space-200) md:p-(--space-300)"
        >
          {salvar.isError ? (
            <MensagemSecao
              role="alert"
              tom="perigo"
              acoes={
                conflito ? (
                  <Botao
                    onClick={() =>
                      void queryClient.invalidateQueries({
                        queryKey: ['instrumento', instrumento.id],
                      })
                    }
                  >
                    Recarregar
                  </Botao>
                ) : undefined
              }
            >
              {mensagemDoErro(salvar.error)}
            </MensagemSecao>
          ) : null}

          <fieldset className="grid gap-(--space-150) sm:grid-cols-2">
            <legend className="mb-(--space-100) titulo-secao">Licença</legend>
            <label className="flex flex-col gap-(--space-050)">
              <span className="rotulo">Tipo de instrumento *</span>
              <select
                className={classeSelect}
                value={criandoTipo ? NOVO_TIPO : (dados.tipoId ?? '')}
                onChange={(evento) => {
                  if (evento.target.value === NOVO_TIPO) {
                    setCriandoTipo(true)
                    return
                  }
                  setCriandoTipo(false)
                  mudar('tipoId', evento.target.value || null)
                }}
              >
                <option value="">Selecione o tipo</option>
                {(tipos.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.sigla} — {t.nome}
                  </option>
                ))}
                <option value={NOVO_TIPO}>Outro tipo…</option>
              </select>
            </label>
            <CampoTexto
              rotulo="Número"
              placeholder="0000/0000"
              value={dados.numero}
              onChange={(evento) => {
                mudar('numero', evento.target.value)
              }}
            />
            {criandoTipo ? (
              <div className="flex flex-col gap-(--space-100) rounded-(--radius) border p-(--space-150) sm:col-span-2">
                <div className="grid gap-(--space-150) sm:grid-cols-[120px_1fr]">
                  <CampoTexto
                    rotulo="Sigla"
                    value={novoTipo.sigla}
                    onChange={(evento) => {
                      setNovoTipo((t) => ({ ...t, sigla: evento.target.value }))
                    }}
                  />
                  <CampoTexto
                    rotulo="Nome do tipo"
                    value={novoTipo.nome}
                    onChange={(evento) => {
                      setNovoTipo((t) => ({ ...t, nome: evento.target.value }))
                    }}
                  />
                </div>
                {adicionarTipo.isError ? (
                  <MensagemSecao role="alert" tom="perigo">
                    {mensagemDoErro(adicionarTipo.error)}
                  </MensagemSecao>
                ) : null}
                <div className="flex justify-end gap-(--space-100)">
                  <Botao
                    tamanho="compacto"
                    onClick={() => {
                      setCriandoTipo(false)
                    }}
                  >
                    Cancelar
                  </Botao>
                  <Botao
                    tamanho="compacto"
                    aparencia="primario"
                    disabled={!novoTipo.sigla.trim() || adicionarTipo.isPending}
                    onClick={() => {
                      adicionarTipo.mutate()
                    }}
                  >
                    Adicionar tipo
                  </Botao>
                </div>
              </div>
            ) : null}
            <CampoTexto
              rotulo="Órgão licenciador"
              list="orgaos-usados"
              placeholder="IMA, SAMA Joinville…"
              value={dados.orgao}
              onChange={(evento) => {
                mudar('orgao', evento.target.value)
              }}
            />
            <datalist id="orgaos-usados">
              {(orgaos.data ?? []).map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
            <label className="flex flex-col gap-(--space-050)">
              <span className="rotulo">Unidade</span>
              <select
                className={classeSelect}
                value={dados.unidadeId}
                onChange={(evento) => {
                  mudar('unidadeId', evento.target.value)
                }}
              >
                {(
                  unidades.data ?? [{ id: instrumento.unidadeId, nome: instrumento.unidadeNome }]
                ).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>

          <fieldset className="flex flex-col gap-(--space-150)">
            <legend className="mb-(--space-100) titulo-secao">Dados do documento</legend>
            <div className="grid gap-(--space-150) sm:grid-cols-2">
              {MARCOS.map((m) => (
                <CampoTexto
                  key={m.chave}
                  rotulo={m.rotulo}
                  type="date"
                  value={dados[m.campo] ?? ''}
                  onChange={(evento) => {
                    mudar(m.campo, dataDe(evento.target.value))
                  }}
                />
              ))}
            </div>
            <fieldset className="flex flex-col gap-(--space-100) rounded-(--radius) border p-(--space-150)">
              <legend className="px-(--space-050) rotulo">Marco usado para os prazos *</legend>
              {marcosPreenchidos.length === 0 ? (
                <p className="text-xs text-(--text-subtle)">
                  Preencha ao menos uma data para escolher.
                </p>
              ) : (
                <div className="flex flex-wrap gap-(--space-200)">
                  {marcosPreenchidos.map((m) => (
                    <label
                      key={m.chave}
                      className="inline-flex cursor-pointer items-center gap-(--space-100) corpo"
                    >
                      <input
                        type="radio"
                        name="marco"
                        checked={dados.marco === m.chave}
                        onChange={() => {
                          mudar('marco', m.chave)
                        }}
                        className="size-4 accent-(--brand)"
                      />
                      {m.rotulo} · {formatarDataCivil(dados[m.campo])}
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          </fieldset>

          <fieldset className="grid gap-(--space-150) sm:grid-cols-2">
            <legend className="mb-(--space-100) titulo-secao">Validade</legend>
            <CampoTexto
              rotulo="Validade confirmada *"
              type="date"
              value={dados.validade ?? ''}
              onChange={(evento) => {
                mudar('validade', dataDe(evento.target.value))
              }}
            />
            <div className="flex flex-col gap-(--space-050)">
              <span className="rotulo">Limite de protocolo</span>
              <span className="corpo">
                {limite ??
                  (!dados.validade
                    ? 'Depende da validade'
                    : tipo
                      ? 'Sem regra de renovação para este tipo'
                      : 'Depende do tipo')}
              </span>
            </div>
          </fieldset>
        </form>
        <PainelPdf instrumento={instrumento} className="hidden min-h-[480px] lg:flex" />
      </div>
    </MolduraCadastro>
  )
}
