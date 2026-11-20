import { mascararDocumento } from '@gestao-ambiental/domain'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { chaveDoOrcamento, usePrenderTarefa, useTarefas } from '@/app/consultoria/tempo-ativo'
import { Botao } from '@/components/ui/botao'
import { OpcaoRadio } from '@/components/ui/caixa-selecao'
import { CampoTexto } from '@/components/ui/campo-texto'
import { Dialogo } from '@/components/ui/dialogo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { listarEmpreendimentos } from '@/lib/api/empreendimentos'
import { criarOrcamento, type ParaQuem } from '@/lib/api/orcamentos'
import { mensagemDoErro } from '@/lib/erros'

import { classeCampo } from './comum'
import {
  lerProspecto,
  PROSPECTO_VAZIO,
  type CamposDoProspecto,
  type ErrosDoProspecto,
} from './prospecto'

type Destino = 'empreendimento' | 'prospecto'

const CHAVE_DO_NOVO = 'orcamento:novo'

/**
 * "Novo orçamento": para um empreendimento cadastrado ou para um prospecto (quem pediu preço e
 * ainda não está cadastrado), e o objeto. O resto se preenche no rascunho. O id nasce aqui:
 * repetir depois de um erro de rede não cria outro orçamento.
 */
export function DialogoNovoOrcamento({
  aberto,
  aoMudar,
  consultoriaId,
  aoCriar,
}: {
  aberto: boolean
  aoMudar: (aberto: boolean) => void
  consultoriaId: string
  aoCriar: (id: string) => void
}) {
  const [id, setId] = useState(() => crypto.randomUUID())
  const [destino, setDestino] = useState<Destino>('empreendimento')
  const [empreendimentoId, setEmpreendimentoId] = useState('')
  const [prospecto, setProspecto] = useState<CamposDoProspecto>(PROSPECTO_VAZIO)
  const [objeto, setObjeto] = useState('')
  const [erros, setErros] = useState<
    { empreendimento?: string; objeto?: string } & { prospecto?: ErrosDoProspecto }
  >({})
  const [falha, setFalha] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  // Tempo ativo do orçamento (ADR-0027): começa aqui e segue com o id do orçamento criado.
  const tarefas = useTarefas()
  usePrenderTarefa(aberto ? CHAVE_DO_NOVO : null)
  useEffect(() => {
    if (aberto) tarefas.iniciar(CHAVE_DO_NOVO)
  }, [aberto, tarefas])

  const empreendimentos = useQuery({
    queryKey: ['empreendimentos', consultoriaId, '', 'para-orcamento'],
    queryFn: () => listarEmpreendimentos(consultoriaId, '', 0),
    enabled: aberto,
  })

  function fechar() {
    setId(crypto.randomUUID())
    setDestino('empreendimento')
    setEmpreendimentoId('')
    setProspecto(PROSPECTO_VAZIO)
    setObjeto('')
    setErros({})
    setFalha(null)
    tarefas.descartar(CHAVE_DO_NOVO)
    aoMudar(false)
  }

  function campoDoProspecto(nome: keyof CamposDoProspecto) {
    return {
      value: prospecto[nome],
      disabled: salvando,
      erro: erros.prospecto?.[nome],
      onChange: (evento: { target: { value: string } }) => {
        const valor = nome === 'cnpj' ? mascararDocumento(evento.target.value) : evento.target.value
        setProspecto((a) => ({ ...a, [nome]: valor }))
      },
    }
  }

  async function criar() {
    let paraQuem: ParaQuem | null = null
    const novosErros: typeof erros = objeto.trim() ? {} : { objeto: 'Diga o que será orçado' }
    if (destino === 'empreendimento') {
      if (empreendimentoId) paraQuem = { empreendimentoId }
      else novosErros.empreendimento = 'Escolha o empreendimento'
    } else {
      const lido = lerProspecto(prospecto)
      if ('erros' in lido) novosErros.prospecto = lido.erros
      else paraQuem = { prospecto: lido.prospecto }
    }
    setErros(novosErros)
    if (!paraQuem || Object.keys(novosErros).length > 0) return
    setFalha(null)
    setSalvando(true)
    try {
      await criarOrcamento(id, consultoriaId, paraQuem, objeto)
      tarefas.transferir(CHAVE_DO_NOVO, chaveDoOrcamento(id))
      aoCriar(id)
      fechar()
    } catch (erro) {
      setFalha(mensagemDoErro(erro))
    } finally {
      setSalvando(false)
    }
  }

  const opcoes = empreendimentos.data?.itens ?? []

  return (
    <Dialogo
      aberto={aberto}
      aoMudar={(valor) => {
        if (!valor) fechar()
        else aoMudar(true)
      }}
      titulo="Novo orçamento"
      largura={560}
      acoes={
        <>
          <Botao disabled={salvando} onClick={fechar}>
            Cancelar
          </Botao>
          <Botao
            type="submit"
            form="form-novo-orcamento"
            aparencia="primario"
            disabled={salvando}
            aria-busy={salvando || undefined}
          >
            {salvando ? 'Criando…' : 'Criar rascunho'}
          </Botao>
        </>
      }
    >
      <form
        id="form-novo-orcamento"
        noValidate
        onSubmit={(evento) => {
          evento.preventDefault()
          void criar()
        }}
        className="flex flex-col gap-(--e-4)"
      >
        {falha ? (
          <MensagemSecao role="alert" tom="perigo">
            {falha}
          </MensagemSecao>
        ) : null}

        <fieldset className="flex flex-col gap-(--e-2)">
          <legend className="mb-(--e-1) rotulo">Para quem é o orçamento</legend>
          <OpcaoRadio
            name="destino-orcamento"
            rotulo="Empreendimento cadastrado"
            descricao="Empresa, obra ou propriedade rural já cadastrada no Grama."
            checked={destino === 'empreendimento'}
            disabled={salvando}
            onChange={() => {
              setDestino('empreendimento')
            }}
          />
          <OpcaoRadio
            name="destino-orcamento"
            rotulo="Prospecto, ainda não cadastrado"
            descricao="Quem pediu preço. Vira empreendimento quando você cadastrar, pelo próprio orçamento."
            checked={destino === 'prospecto'}
            disabled={salvando}
            onChange={() => {
              setDestino('prospecto')
            }}
          />
        </fieldset>

        {destino === 'empreendimento' ? (
          <div className="flex flex-col gap-(--e-1)">
            <label htmlFor="novo-orcamento-empreendimento" className="rotulo">
              Empreendimento
            </label>
            <select
              id="novo-orcamento-empreendimento"
              className={classeCampo}
              value={empreendimentoId}
              disabled={salvando || empreendimentos.isPending}
              aria-invalid={erros.empreendimento ? true : undefined}
              aria-describedby={
                erros.empreendimento ? 'novo-orcamento-empreendimento-erro' : undefined
              }
              onChange={(evento) => {
                setEmpreendimentoId(evento.target.value)
              }}
            >
              <option value="">
                {empreendimentos.isPending ? 'Carregando…' : 'Escolha o empreendimento'}
              </option>
              {opcoes.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
            {erros.empreendimento ? (
              <p id="novo-orcamento-empreendimento-erro" className="text-xs text-(--atraso-texto)">
                {erros.empreendimento}
              </p>
            ) : null}
            {empreendimentos.isSuccess && opcoes.length === 0 ? (
              <p className="text-xs text-(--tinta-2)">
                Nenhum empreendimento cadastrado. Orce como prospecto e cadastre depois.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-(--e-3) sm:grid-cols-2">
            <CampoTexto
              rotulo="Nome da empresa ou do cliente"
              required
              className="sm:col-span-2"
              {...campoDoProspecto('nome')}
            />
            <CampoTexto
              rotulo="CNPJ ou CPF"
              ajuda="Opcional. Evita cadastro repetido."
              inputMode="text"
              {...campoDoProspecto('cnpj')}
            />
            <CampoTexto rotulo="Contato" ajuda="Opcional" {...campoDoProspecto('contato')} />
            <CampoTexto
              rotulo="E-mail"
              type="email"
              ajuda="Opcional"
              {...campoDoProspecto('email')}
            />
            <CampoTexto
              rotulo="Telefone"
              type="tel"
              ajuda="Opcional"
              {...campoDoProspecto('telefone')}
            />
          </div>
        )}

        <CampoTexto
          rotulo="O que será orçado"
          placeholder="Ex.: Licenciamento (LO)"
          required
          value={objeto}
          disabled={salvando}
          erro={erros.objeto}
          onChange={(evento) => {
            setObjeto(evento.target.value)
          }}
        />
      </form>
    </Dialogo>
  )
}
