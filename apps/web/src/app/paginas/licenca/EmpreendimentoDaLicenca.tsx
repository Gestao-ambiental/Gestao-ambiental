import {
  formatarCnpj,
  mascararCnpj,
  nomeDaUnidadeSugerido,
  situacaoDoCnpj,
  titularEncontrado,
  type TitularDaLicenca,
} from '@gestao-ambiental/domain'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { Carregando, EstadoErro } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { CampoTexto } from '@/components/ui/campo-texto'
import { classeCampo } from '@/components/ui/estilos-campo'
import { Icone } from '@/components/ui/icone'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import {
  buscarParecidos,
  cadastrarEmpreendimentoComUnidade,
  type EmpreendimentoNaLista,
  type Unidade,
} from '@/lib/api/empreendimentos'
import { mensagemDoErro } from '@/lib/erros'

/** O que a leitura do PDF achou (feita no navegador, antes do rascunho). */
export type LeituraDoTitular =
  | { situacao: 'sem_pdf' }
  | { situacao: 'lendo' }
  | { situacao: 'pronta'; titular: TitularDaLicenca }
  | { situacao: 'falhou' }

export interface RascunhoDoEmpreendimento {
  nome: string
  cnpj: string
  unidade: string
  endereco: string
}

function rascunhoDoTitular(titular: TitularDaLicenca | null): RascunhoDoEmpreendimento {
  return {
    nome: titular?.razaoSocial ?? '',
    cnpj: titular?.cnpj ? mascararCnpj(titular.cnpj) : '',
    unidade: titular ? nomeDaUnidadeSugerido(titular) : 'Matriz',
    endereco: titular?.endereco ?? '',
  }
}

/**
 * Cadastro do empreendimento e da unidade sem sair da tela (uma transação no banco). Usado na
 * licença e no orçamento.
 */
export function NovoEmpreendimento({
  consultoriaId,
  inicial,
  aoCadastrar,
  aoCancelar,
}: {
  consultoriaId: string
  inicial: RascunhoDoEmpreendimento
  aoCadastrar: (empreendimentoId: string, unidadeId: string, nome: string) => void
  aoCancelar: () => void
}) {
  const queryClient = useQueryClient()
  const [ids] = useState(() => ({
    empreendimento: crypto.randomUUID(),
    unidade: crypto.randomUUID(),
  }))
  const [dados, setDados] = useState(inicial)
  const [tentou, setTentou] = useState(false)
  const cadastrar = useMutation({
    mutationFn: () =>
      cadastrarEmpreendimentoComUnidade(consultoriaId, {
        empreendimentoId: ids.empreendimento,
        unidadeId: ids.unidade,
        nome: dados.nome,
        cnpj: dados.cnpj,
        unidadeNome: dados.unidade,
        unidadeEndereco: dados.endereco,
      }),
    onSuccess: async (unidadeId) => {
      await queryClient.invalidateQueries({ queryKey: ['empreendimentos', consultoriaId] })
      aoCadastrar(ids.empreendimento, unidadeId, dados.nome.trim())
    },
  })

  const erroNome = tentou && !dados.nome.trim() ? 'Informe o nome' : undefined
  const erroUnidade = tentou && !dados.unidade.trim() ? 'Informe a unidade' : undefined
  const erroCnpj = situacaoDoCnpj(dados.cnpj) === 'incompleto' ? 'CNPJ incompleto' : undefined

  function enviar() {
    setTentou(true)
    if (!dados.nome.trim() || !dados.unidade.trim() || erroCnpj) return
    cadastrar.mutate()
  }

  return (
    <form
      aria-label="Novo empreendimento"
      className="flex flex-col gap-(--e-4) rounded-(--raio-painel) border bg-(--folha) p-(--e-4) md:p-(--e-5)"
      onSubmit={(evento) => {
        evento.preventDefault()
        enviar()
      }}
    >
      <h3 className="titulo-secao">Novo empreendimento</h3>
      <div className="grid gap-(--e-3) sm:grid-cols-2">
        <CampoTexto
          rotulo="Nome do empreendimento"
          value={dados.nome}
          erro={erroNome}
          autoComplete="organization"
          onChange={(evento) => {
            setDados({ ...dados, nome: evento.target.value })
          }}
        />
        <CampoTexto
          rotulo="CNPJ"
          value={dados.cnpj}
          erro={erroCnpj}
          inputMode="text"
          onChange={(evento) => {
            setDados({ ...dados, cnpj: mascararCnpj(evento.target.value) })
          }}
        />
        <CampoTexto
          rotulo="Unidade"
          value={dados.unidade}
          erro={erroUnidade}
          onChange={(evento) => {
            setDados({ ...dados, unidade: evento.target.value })
          }}
        />
        <CampoTexto
          rotulo="Endereço da unidade"
          value={dados.endereco}
          onChange={(evento) => {
            setDados({ ...dados, endereco: evento.target.value })
          }}
        />
      </div>
      {cadastrar.isError ? (
        <MensagemSecao role="alert" tom="perigo">
          {mensagemDoErro(cadastrar.error)}
        </MensagemSecao>
      ) : null}
      <div className="flex flex-wrap justify-end gap-(--e-2) max-md:flex-col-reverse max-md:[&>*]:w-full">
        <Botao aparencia="sutil" onClick={aoCancelar} disabled={cadastrar.isPending}>
          Cancelar
        </Botao>
        <Botao type="submit" iconeAntes="plus" disabled={cadastrar.isPending}>
          {cadastrar.isPending ? 'Cadastrando…' : 'Cadastrar e usar'}
        </Botao>
      </div>
    </form>
  )
}

/** O titular achado no PDF: já cadastrado (usar) ou novo (cadastrar com um clique). */
function SugestaoDoTitular({
  consultoriaId,
  titular,
  aoUsar,
  aoRevisar,
  aoCadastrado,
}: {
  consultoriaId: string
  titular: TitularDaLicenca
  aoUsar: (empreendimentoId: string) => void
  aoRevisar: () => void
  aoCadastrado: (empreendimentoId: string, unidadeId: string) => void
}) {
  const queryClient = useQueryClient()
  const parecidos = useQuery({
    queryKey: ['parecidos-titular', consultoriaId, titular.razaoSocial, titular.cnpj],
    queryFn: () => buscarParecidos(consultoriaId, titular.razaoSocial ?? '', titular.cnpj ?? ''),
  })
  const [ids] = useState(() => ({
    empreendimento: crypto.randomUUID(),
    unidade: crypto.randomUUID(),
  }))
  const cadastrar = useMutation({
    mutationFn: () =>
      cadastrarEmpreendimentoComUnidade(consultoriaId, {
        empreendimentoId: ids.empreendimento,
        unidadeId: ids.unidade,
        nome: titular.razaoSocial ?? '',
        cnpj: titular.cnpj ?? '',
        unidadeNome: nomeDaUnidadeSugerido(titular),
        unidadeEndereco: titular.endereco ?? '',
      }),
    onSuccess: async (unidadeId) => {
      await queryClient.invalidateQueries({ queryKey: ['empreendimentos', consultoriaId] })
      aoCadastrado(ids.empreendimento, unidadeId)
    },
  })

  const identificacao = (
    <p className="flex flex-wrap items-baseline gap-x-(--e-3) gap-y-(--e-05) corpo">
      <span className="corpo-medio">{titular.razaoSocial ?? 'Sem razão social no PDF'}</span>
      {titular.cnpj ? (
        <span className="text-(--tinta-2)">
          CNPJ <span className="numero">{formatarCnpj(titular.cnpj)}</span>
        </span>
      ) : null}
    </p>
  )

  if (parecidos.isPending) {
    return <Carregando rotulo="Procurando o empreendimento" linhas={1} />
  }

  const existente = parecidos.data?.find((p) => p.mesmoCnpj) ?? parecidos.data?.[0]

  return (
    <section
      aria-label="Titular encontrado no PDF"
      className="flex flex-col gap-(--e-3) rounded-(--raio-painel) border border-(--marca-linha) bg-(--escolha) p-(--e-4)"
    >
      <span className="inline-flex items-center gap-(--e-2) rotulo text-(--tinta)">
        <Icone nome="file-text" />
        Titular no PDF
      </span>
      {identificacao}
      {existente ? (
        <div className="flex flex-wrap items-center gap-(--e-3)">
          <span className="corpo text-(--tinta-2)">
            Já cadastrado como <span className="corpo-medio text-(--tinta)">{existente.nome}</span>
          </span>
          <Botao
            iconeAntes="check"
            className="max-md:w-full"
            onClick={() => {
              aoUsar(existente.id)
            }}
          >
            Usar {existente.nome}
          </Botao>
        </div>
      ) : titular.razaoSocial ? (
        <div className="flex flex-wrap items-center gap-(--e-2)">
          <Botao
            iconeAntes="plus"
            className="max-md:w-full"
            disabled={cadastrar.isPending}
            onClick={() => {
              cadastrar.mutate()
            }}
          >
            {cadastrar.isPending ? 'Cadastrando…' : `Cadastrar ${titular.razaoSocial}`}
          </Botao>
          <Botao aparencia="sutil" className="max-md:w-full" onClick={aoRevisar}>
            Revisar dados
          </Botao>
        </div>
      ) : (
        <Botao aparencia="sutil" className="w-fit" onClick={aoRevisar}>
          Completar o cadastro
        </Botao>
      )}
      {cadastrar.isError ? (
        <MensagemSecao role="alert" tom="perigo">
          {mensagemDoErro(cadastrar.error)}
        </MensagemSecao>
      ) : null}
    </section>
  )
}

/**
 * Empreendimento e unidade da licença. Três caminhos, sem beco sem saída: escolher um cadastrado,
 * usar o titular lido do PDF (existente ou novo, com confirmação) ou cadastrar na hora.
 */
export function EmpreendimentoDaLicenca({
  consultoriaId,
  empreendimentos,
  carregando,
  erro,
  aoTentarDeNovo,
  empreendimentoId,
  unidadeEscolhida,
  unidades,
  unidadesCarregando,
  leitura,
  aoEscolherEmpreendimento,
  aoEscolherUnidade,
  aoPedirPdf,
}: {
  consultoriaId: string
  empreendimentos: readonly EmpreendimentoNaLista[]
  carregando: boolean
  erro: boolean
  aoTentarDeNovo: () => void
  empreendimentoId: string
  unidadeEscolhida: string
  unidades: readonly Unidade[]
  unidadesCarregando: boolean
  leitura: LeituraDoTitular
  aoEscolherEmpreendimento: (id: string, unidadeId?: string) => void
  aoEscolherUnidade: (id: string) => void
  aoPedirPdf: () => void
}) {
  const [formulario, setFormulario] = useState<RascunhoDoEmpreendimento | null>(null)
  const titular =
    leitura.situacao === 'pronta' && titularEncontrado(leitura.titular) ? leitura.titular : null
  const vazio = empreendimentos.length === 0

  if (carregando) return <Carregando rotulo="Carregando empreendimentos" linhas={1} />
  if (erro) return <EstadoErro aoTentarDeNovo={aoTentarDeNovo} />

  const cadastrado = (empId: string, uniId: string) => {
    setFormulario(null)
    aoEscolherEmpreendimento(empId, uniId)
  }

  return (
    <div className="flex flex-col gap-(--e-3)">
      {leitura.situacao === 'lendo' ? (
        <p role="status" className="inline-flex items-center gap-(--e-2) corpo text-(--tinta-2)">
          <Icone nome="refresh-cw" className="animate-spin motion-reduce:animate-none" />
          Lendo o titular no PDF…
        </p>
      ) : null}

      {titular && !empreendimentoId && !formulario ? (
        <SugestaoDoTitular
          consultoriaId={consultoriaId}
          titular={titular}
          aoUsar={(id) => {
            aoEscolherEmpreendimento(id)
          }}
          aoRevisar={() => {
            setFormulario(rascunhoDoTitular(titular))
          }}
          aoCadastrado={cadastrado}
        />
      ) : null}

      {leitura.situacao === 'pronta' && !titular && !empreendimentoId ? (
        <p className="corpo text-(--tinta-2)">Não achamos o titular no texto do PDF.</p>
      ) : null}
      {leitura.situacao === 'falhou' && !empreendimentoId ? (
        <p className="corpo text-(--tinta-2)">Não deu para ler o texto deste PDF.</p>
      ) : null}

      {formulario ? (
        <NovoEmpreendimento
          consultoriaId={consultoriaId}
          inicial={formulario}
          aoCadastrar={cadastrado}
          aoCancelar={() => {
            setFormulario(null)
          }}
        />
      ) : vazio && !titular ? (
        <div className="flex flex-col gap-(--e-3) rounded-(--raio-painel) border border-dashed border-(--regra-forte) bg-(--folha) p-(--e-4) md:flex-row md:items-center">
          <p className="flex-1 corpo-medio">Nenhum empreendimento cadastrado ainda.</p>
          <div className="flex flex-wrap gap-(--e-2) max-md:flex-col max-md:[&>*]:w-full">
            {leitura.situacao === 'sem_pdf' ? (
              <Botao aparencia="sutil" iconeAntes="upload" onClick={aoPedirPdf}>
                Ler do PDF
              </Botao>
            ) : null}
            <Botao
              iconeAntes="plus"
              onClick={() => {
                setFormulario(rascunhoDoTitular(null))
              }}
            >
              Cadastrar agora
            </Botao>
          </div>
        </div>
      ) : null}

      {vazio && !empreendimentoId ? null : (
        <div className="grid gap-(--e-3) sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="flex flex-col gap-(--e-1)">
            <span className="rotulo text-(--tinta)">Empreendimento</span>
            <select
              className={classeCampo}
              value={empreendimentoId}
              onChange={(evento) => {
                aoEscolherEmpreendimento(evento.target.value)
              }}
            >
              <option value="">Selecione o empreendimento</option>
              {empreendimentos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-(--e-1)">
            <span className="rotulo text-(--tinta)">Unidade</span>
            <select
              className={classeCampo}
              value={unidadeEscolhida}
              disabled={!empreendimentoId || unidadesCarregando}
              onChange={(evento) => {
                aoEscolherUnidade(evento.target.value)
              }}
            >
              <option value="">Selecione a unidade</option>
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>
          </label>
          {formulario ? null : (
            <Botao
              aparencia="sutil"
              iconeAntes="plus"
              onClick={() => {
                setFormulario(rascunhoDoTitular(titular))
              }}
            >
              Novo empreendimento
            </Botao>
          )}
        </div>
      )}
    </div>
  )
}
