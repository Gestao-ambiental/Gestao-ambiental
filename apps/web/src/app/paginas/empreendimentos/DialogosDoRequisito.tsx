// Diálogos dos requisitos legais (ADR-0050, LEG-07 e LEG-08): avaliar (com ação opcional), marcar
// que não se aplica, anexar evidência e acrescentar uma norma à mão.
import { type DataCivil } from '@gestao-ambiental/domain'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useId, useRef, useState } from 'react'

import { Botao } from '@/components/ui/botao'
import { CampoData } from '@/components/ui/campo-data'
import { CampoTexto } from '@/components/ui/campo-texto'
import { Dialogo } from '@/components/ui/dialogo'
import { classeCampo } from '@/components/ui/estilos-campo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { conferirPdf, listarMembrosAtivos, type ProblemaDoPdf } from '@/lib/api/licencas'
import { buscarNormas } from '@/lib/api/normas'
import {
  adicionarRequisito,
  anexarEvidencia,
  avaliarRequisito,
  decidirAplicabilidade,
  type RequisitoLegal,
} from '@/lib/api/requisitos-legais'
import { mensagemDoErro } from '@/lib/erros'

const PROBLEMAS: Record<ProblemaDoPdf, string> = {
  nao_pdf: 'Este arquivo não é um PDF válido.',
  grande_demais: 'O arquivo passa de 25 MB.',
  vazio: 'O arquivo está vazio.',
}

function Erro({ id, texto }: { id: string; texto: string | undefined }) {
  if (!texto) return null
  return (
    <span id={id} role="alert" className="text-xs font-[650] text-(--atraso-texto)">
      {texto}
    </span>
  )
}

function Acoes({
  pendente,
  rotulo,
  aoCancelar,
  aoConfirmar,
}: {
  pendente: boolean
  rotulo: string
  aoCancelar: () => void
  aoConfirmar: () => void
}) {
  return (
    <>
      <Botao onClick={aoCancelar}>Cancelar</Botao>
      <Botao aparencia="primario" disabled={pendente} onClick={aoConfirmar}>
        {pendente ? 'Salvando…' : rotulo}
      </Botao>
    </>
  )
}

export function DialogoAvaliar({
  consultoriaId,
  requisito,
  hoje,
  aoFechar,
  aoSalvar,
}: {
  consultoriaId: string
  requisito: RequisitoLegal
  hoje: DataCivil
  aoFechar: () => void
  aoSalvar: () => Promise<void>
}) {
  const id = useId()
  const [resultado, setResultado] = useState<'conforme' | 'nao_conforme'>('conforme')
  const [avaliadaEm, setAvaliadaEm] = useState<DataCivil | null>(hoje)
  const [observacao, setObservacao] = useState('')
  const [comAcao, setComAcao] = useState(false)
  const [descricao, setDescricao] = useState('')
  const [prazo, setPrazo] = useState<DataCivil | null>(null)
  const [responsavelId, setResponsavelId] = useState('')
  const [erros, setErros] = useState<{ data?: string; descricao?: string; prazo?: string }>({})
  const membros = useQuery({
    queryKey: ['membros-ativos', consultoriaId],
    queryFn: () => listarMembrosAtivos(consultoriaId),
  })

  const salvar = useMutation({
    mutationFn: () =>
      avaliarRequisito(
        consultoriaId,
        requisito,
        resultado,
        avaliadaEm ?? hoje,
        observacao.trim() || null,
        comAcao && prazo
          ? { descricao: descricao.trim(), prazo, responsavelId: responsavelId || null }
          : null,
      ),
    onSuccess: aoSalvar,
  })

  function enviar() {
    const novos: typeof erros = {}
    if (!avaliadaEm) novos.data = 'Informe a data da avaliação'
    if (comAcao && !descricao.trim()) novos.descricao = 'Descreva a ação'
    if (comAcao && !prazo) novos.prazo = 'Informe o prazo'
    setErros(novos)
    if (Object.keys(novos).length === 0) salvar.mutate()
  }

  return (
    <Dialogo
      aberto
      aoMudar={(aberto) => {
        if (!aberto) aoFechar()
      }}
      titulo="Avaliar requisito"
      descricao={requisito.normaTitulo}
      acoes={
        <Acoes
          pendente={salvar.isPending}
          rotulo="Salvar avaliação"
          aoCancelar={aoFechar}
          aoConfirmar={enviar}
        />
      }
    >
      <div className="flex flex-col gap-(--e-3)">
        {salvar.isError ? (
          <MensagemSecao role="alert" tom="perigo">
            {mensagemDoErro(salvar.error)}
          </MensagemSecao>
        ) : null}
        <fieldset className="flex flex-wrap gap-(--e-4)">
          <legend className="rotulo text-(--tinta)">Resultado</legend>
          {(
            [
              ['conforme', 'Conforme'],
              ['nao_conforme', 'Não conforme'],
            ] as const
          ).map(([valor, rotulo]) => (
            <label key={valor} className="flex items-center gap-(--e-2) corpo">
              <input
                type="radio"
                name={`${id}-resultado`}
                value={valor}
                checked={resultado === valor}
                onChange={() => {
                  setResultado(valor)
                }}
              />
              {rotulo}
            </label>
          ))}
        </fieldset>
        <CampoData
          rotulo="Avaliado em *"
          hoje={hoje}
          maximo={hoje}
          valor={avaliadaEm}
          erro={erros.data}
          aoMudar={(nova) => {
            setAvaliadaEm(nova)
            setErros((e) => ({ ...e, data: undefined }))
          }}
        />
        <div className="flex flex-col gap-(--e-1)">
          <label htmlFor={`${id}-observacao`} className="rotulo text-(--tinta)">
            Observação
          </label>
          <textarea
            id={`${id}-observacao`}
            className={classeCampo}
            rows={3}
            maxLength={2000}
            value={observacao}
            onChange={(evento) => {
              setObservacao(evento.target.value)
            }}
          />
        </div>
        <label className="flex items-center gap-(--e-2) corpo">
          <input
            type="checkbox"
            checked={comAcao}
            onChange={(evento) => {
              setComAcao(evento.target.checked)
            }}
          />
          Criar ação
        </label>
        {comAcao ? (
          <div className="flex flex-col gap-(--e-3)">
            <CampoTexto
              rotulo="Ação *"
              value={descricao}
              maxLength={500}
              erro={erros.descricao}
              onChange={(evento) => {
                setDescricao(evento.target.value)
                setErros((e) => ({ ...e, descricao: undefined }))
              }}
            />
            <CampoData
              rotulo="Prazo *"
              hoje={hoje}
              minimo={hoje}
              valor={prazo}
              erro={erros.prazo}
              aoMudar={(nova) => {
                setPrazo(nova)
                setErros((e) => ({ ...e, prazo: undefined }))
              }}
            />
            <div className="flex flex-col gap-(--e-1)">
              <label htmlFor={`${id}-responsavel`} className="rotulo text-(--tinta)">
                Responsável
              </label>
              <select
                id={`${id}-responsavel`}
                className={classeCampo}
                value={responsavelId}
                onChange={(evento) => {
                  setResponsavelId(evento.target.value)
                }}
              >
                <option value="">Sem responsável</option>
                {(membros.data ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}
      </div>
    </Dialogo>
  )
}

export function DialogoNaoSeAplica({
  consultoriaId,
  requisito,
  aoFechar,
  aoSalvar,
}: {
  consultoriaId: string
  requisito: RequisitoLegal
  aoFechar: () => void
  aoSalvar: () => Promise<void>
}) {
  const id = useId()
  const [justificativa, setJustificativa] = useState('')
  const [erro, setErro] = useState<string | undefined>()
  const salvar = useMutation({
    mutationFn: () => decidirAplicabilidade(consultoriaId, requisito, false, justificativa.trim()),
    onSuccess: aoSalvar,
  })

  function enviar() {
    if (!justificativa.trim()) {
      setErro('Escreva por que não se aplica')
      return
    }
    salvar.mutate()
  }

  return (
    <Dialogo
      aberto
      aoMudar={(aberto) => {
        if (!aberto) aoFechar()
      }}
      titulo="Não se aplica"
      descricao={requisito.normaTitulo}
      acoes={
        <Acoes
          pendente={salvar.isPending}
          rotulo="Confirmar"
          aoCancelar={aoFechar}
          aoConfirmar={enviar}
        />
      }
    >
      <div className="flex flex-col gap-(--e-3)">
        {salvar.isError ? (
          <MensagemSecao role="alert" tom="perigo">
            {mensagemDoErro(salvar.error)}
          </MensagemSecao>
        ) : null}
        <div className="flex flex-col gap-(--e-1)">
          <label htmlFor={`${id}-justificativa`} className="rotulo text-(--tinta)">
            Justificativa *
          </label>
          <textarea
            id={`${id}-justificativa`}
            className={classeCampo}
            rows={3}
            maxLength={1000}
            value={justificativa}
            aria-invalid={erro ? true : undefined}
            aria-describedby={erro ? `${id}-erro` : undefined}
            onChange={(evento) => {
              setJustificativa(evento.target.value)
              setErro(undefined)
            }}
          />
          <Erro id={`${id}-erro`} texto={erro} />
        </div>
      </div>
    </Dialogo>
  )
}

export function DialogoEvidencia({
  consultoriaId,
  requisito,
  hoje,
  aoFechar,
  aoSalvar,
}: {
  consultoriaId: string
  requisito: RequisitoLegal
  hoje: DataCivil
  aoFechar: () => void
  aoSalvar: () => Promise<void>
}) {
  const id = useId()
  const entrada = useRef<HTMLInputElement>(null)
  // Id gerado aqui: repetir depois de erro de rede não registra outra evidência.
  const [versaoId] = useState(() => crypto.randomUUID())
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [validade, setValidade] = useState<DataCivil | null>(null)
  const [erro, setErro] = useState<string | undefined>()
  const salvar = useMutation({
    mutationFn: async () => {
      if (!arquivo) throw new Error('sem PDF')
      await anexarEvidencia(consultoriaId, requisito.id, versaoId, arquivo, validade)
    },
    onSuccess: aoSalvar,
  })

  async function escolher(escolhido: File | undefined) {
    if (!escolhido) return
    const problema = await conferirPdf(escolhido)
    if (problema) {
      setErro(PROBLEMAS[problema])
      return
    }
    setErro(undefined)
    setArquivo(escolhido)
  }

  return (
    <Dialogo
      aberto
      aoMudar={(aberto) => {
        if (!aberto) aoFechar()
      }}
      titulo="Anexar evidência"
      descricao={requisito.normaTitulo}
      acoes={
        <Acoes
          pendente={salvar.isPending}
          rotulo="Anexar"
          aoCancelar={aoFechar}
          aoConfirmar={() => {
            if (!arquivo) {
              setErro('Escolha o PDF')
              return
            }
            salvar.mutate()
          }}
        />
      }
    >
      <div className="flex flex-col gap-(--e-3)">
        {salvar.isError ? (
          <MensagemSecao role="alert" tom="perigo">
            {mensagemDoErro(salvar.error)}
          </MensagemSecao>
        ) : null}
        <div className="flex flex-col gap-(--e-1)">
          <label htmlFor={`${id}-pdf`} className="rotulo text-(--tinta)">
            PDF *
          </label>
          <input
            ref={entrada}
            id={`${id}-pdf`}
            type="file"
            accept="application/pdf,.pdf"
            className="corpo"
            aria-invalid={erro ? true : undefined}
            aria-describedby={erro ? `${id}-erro` : undefined}
            onChange={(evento) => {
              void escolher(evento.target.files?.[0])
            }}
          />
          <Erro id={`${id}-erro`} texto={erro} />
        </div>
        <CampoData rotulo="Válida até" hoje={hoje} valor={validade} aoMudar={setValidade} />
      </div>
    </Dialogo>
  )
}

export function DialogoAdicionarNorma({
  consultoriaId,
  empreendimentoId,
  aoFechar,
  aoSalvar,
}: {
  consultoriaId: string
  empreendimentoId: string
  aoFechar: () => void
  aoSalvar: () => Promise<void>
}) {
  const id = useId()
  const [termo, setTermo] = useState('')
  const [normaId, setNormaId] = useState('')
  const [dispositivo, setDispositivo] = useState('')
  const [erro, setErro] = useState<string | undefined>()
  const busca = useQuery({
    queryKey: ['buscar-normas', termo.trim()],
    queryFn: () => buscarNormas(termo, 0, 10),
    enabled: termo.trim().length >= 2,
  })
  const salvar = useMutation({
    mutationFn: () =>
      adicionarRequisito(consultoriaId, empreendimentoId, normaId, dispositivo.trim() || null),
    onSuccess: aoSalvar,
  })

  return (
    <Dialogo
      aberto
      aoMudar={(aberto) => {
        if (!aberto) aoFechar()
      }}
      titulo="Adicionar norma"
      acoes={
        <Acoes
          pendente={salvar.isPending}
          rotulo="Adicionar"
          aoCancelar={aoFechar}
          aoConfirmar={() => {
            if (!normaId) {
              setErro('Escolha a norma')
              return
            }
            salvar.mutate()
          }}
        />
      }
    >
      <div className="flex flex-col gap-(--e-3)">
        {salvar.isError ? (
          <MensagemSecao role="alert" tom="perigo">
            {mensagemDoErro(salvar.error)}
          </MensagemSecao>
        ) : null}
        <CampoTexto
          rotulo="Buscar norma"
          type="search"
          value={termo}
          maxLength={100}
          onChange={(evento) => {
            setTermo(evento.target.value)
            setNormaId('')
          }}
        />
        {busca.isError ? (
          <MensagemSecao role="alert" tom="perigo">
            {mensagemDoErro(busca.error)}
          </MensagemSecao>
        ) : null}
        {busca.data ? (
          busca.data.itens.length === 0 ? (
            <p className="corpo text-(--tinta-2)">Nenhuma norma encontrada.</p>
          ) : (
            <fieldset className="flex max-h-56 flex-col gap-(--e-1) overflow-y-auto">
              <legend className="sr-only">Normas encontradas</legend>
              {busca.data.itens.map((n) => (
                <label key={n.id} className="flex items-start gap-(--e-2) corpo">
                  <input
                    type="radio"
                    name={`${id}-norma`}
                    value={n.id}
                    checked={normaId === n.id}
                    onChange={() => {
                      setNormaId(n.id)
                      setErro(undefined)
                    }}
                  />
                  <span>
                    {n.titulo}
                    {n.revogada ? <span className="text-(--tinta-2)"> · revogada</span> : null}
                  </span>
                </label>
              ))}
            </fieldset>
          )
        ) : null}
        <Erro id={`${id}-erro`} texto={erro} />
        <CampoTexto
          rotulo="Dispositivo"
          value={dispositivo}
          maxLength={120}
          placeholder="art. 5º"
          onChange={(evento) => {
            setDispositivo(evento.target.value)
          }}
        />
      </div>
    </Dialogo>
  )
}
