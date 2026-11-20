// /configuracoes/proposta (ADR-0018, fatia 6; P8): dados da consultoria que aparecem em toda
// proposta. Cadastrados uma vez; só a Gestão edita. Nenhum valor é sugerido: a consultoria informa.

import { mascararCnpj } from '@gestao-ambiental/domain'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useRef, useState } from 'react'
import { Link } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Pagina } from '@/app/paginas/Pagina'
import { Carregando, EstadoErro, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import {
  enviarLogo,
  obterIdentidade,
  removerLogo,
  salvarIdentidade,
  type DadosDaIdentidade,
  type IdentidadeDaConsultoria,
} from '@/lib/api/identidade'
import { conferirFoto, type ProblemaDaFoto } from '@/lib/api/perfil'
import { mensagemDoErro } from '@/lib/erros'

import { classeCampo } from './comum'

const PROBLEMAS_DA_LOGO: Record<ProblemaDaFoto, string> = {
  tipo: 'Envie uma imagem PNG ou JPEG.',
  vazio: 'Este arquivo está vazio.',
  grande_demais: 'A imagem passa de 2 MB.',
}

export function PaginaDadosDaProposta() {
  const { atual } = useConsultoria()
  if (atual.papel !== 'gestao') {
    return (
      <Pagina titulo="Dados da proposta">
        <SemPermissao descricao="Os dados da proposta são editados pela gestão." />
      </Pagina>
    )
  }
  return (
    <Pagina titulo="Dados da proposta">
      <div className="flex max-w-3xl flex-col gap-(--e-4)">
        <p className="text-(--tinta-2)">
          Aparecem no topo de toda proposta. Só a gestão edita. O texto de apresentação é o padrão;
          cada orçamento pode ter o seu. <Link to="/orcamentos">Voltar aos orçamentos</Link>
        </p>
        <DadosDaProposta consultoriaId={atual.consultoriaId} />
      </div>
    </Pagina>
  )
}

/**
 * Logo e dados da consultoria, com a RPC e a versão próprias da identidade (já valem para as
 * propostas ao salvar). Usado aqui e no passo 5 dos primeiros passos (ADR-0020).
 */
export function DadosDaProposta({
  consultoriaId,
  nivelDosTitulos = 2,
  rotuloSalvar = 'Salvar',
  aoAlterar,
}: {
  consultoriaId: string
  nivelDosTitulos?: 2 | 3
  rotuloSalvar?: string
  /** Avisa quando há mudança não salva (para perguntar antes de sair). */
  aoAlterar?: (alterado: boolean) => void
}) {
  const consulta = useQuery({
    queryKey: ['identidade', consultoriaId],
    queryFn: () => obterIdentidade(consultoriaId),
  })
  if (consulta.isPending) return <Carregando rotulo="Carregando dados da proposta" linhas={5} />
  if (consulta.isError) {
    return (
      <EstadoErro
        titulo="Não foi possível carregar os dados da proposta."
        aoTentarDeNovo={() => void consulta.refetch()}
      />
    )
  }
  return (
    <Formulario
      key={String(consulta.data.rowVersion)}
      consultoriaId={consultoriaId}
      identidade={consulta.data}
      nivelDosTitulos={nivelDosTitulos}
      rotuloSalvar={rotuloSalvar}
      aoAlterar={aoAlterar}
    />
  )
}

function Formulario({
  consultoriaId,
  identidade,
  nivelDosTitulos,
  rotuloSalvar,
  aoAlterar,
}: {
  consultoriaId: string
  identidade: IdentidadeDaConsultoria
  nivelDosTitulos: 2 | 3
  rotuloSalvar: string
  aoAlterar: ((alterado: boolean) => void) | undefined
}) {
  const Titulo = nivelDosTitulos === 2 ? 'h2' : 'h3'
  const queryClient = useQueryClient()
  const entrada = useRef<HTMLInputElement>(null)
  const [d, setD] = useState<DadosDaIdentidade>(() => ({
    razaoSocial: identidade.razaoSocial,
    cnpj: identidade.cnpj ? mascararCnpj(identidade.cnpj) : '',
    endereco: identidade.endereco,
    telefone: identidade.telefone,
    email: identidade.email,
    site: identidade.site,
    textoApresentacao: identidade.textoApresentacao,
  }))
  const [alterado, setAlterado] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [problemaDaLogo, setProblemaDaLogo] = useState<string | null>(null)

  async function atualizar() {
    await queryClient.invalidateQueries({ queryKey: ['identidade', consultoriaId] })
  }

  const salvar = useMutation({
    mutationFn: () => salvarIdentidade(consultoriaId, identidade.rowVersion, d),
    onSuccess: async () => {
      setAviso('Dados da proposta salvos.')
      setAlterado(false)
      aoAlterar?.(false)
      await atualizar()
    },
  })
  const logo = useMutation({
    mutationFn: (arquivo: File) => enviarLogo(consultoriaId, arquivo),
    onSuccess: atualizar,
  })
  const tirar = useMutation({ mutationFn: () => removerLogo(consultoriaId), onSuccess: atualizar })
  const ocupado = salvar.isPending || logo.isPending || tirar.isPending
  const erroDaLogo =
    problemaDaLogo ??
    (logo.error ? mensagemDoErro(logo.error) : tirar.error ? mensagemDoErro(tirar.error) : null)

  function campo(chave: keyof DadosDaIdentidade) {
    return {
      value: d[chave],
      onChange: (e: { target: { value: string } }) => {
        const valor = e.target.value
        setD((a) => ({ ...a, [chave]: valor }))
        setAlterado(true)
        aoAlterar?.(true)
        setAviso(null)
      },
    }
  }

  return (
    <div className="flex flex-col gap-(--e-4)">
      <section aria-label="Logo" className="flex flex-col gap-(--e-2)">
        <Titulo className="corpo-medio">Logo</Titulo>
        <div className="flex flex-wrap items-center gap-(--e-3)">
          {identidade.logoUrl ? (
            <img
              src={identidade.logoUrl}
              alt="Logo atual da consultoria"
              className="h-16 max-w-48 object-contain"
            />
          ) : (
            <span className="text-xs text-(--tinta-2)">Sem logo.</span>
          )}
          <input
            ref={entrada}
            type="file"
            accept="image/png,image/jpeg"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(evento) => {
              const arquivo = evento.target.files?.[0]
              evento.target.value = ''
              if (!arquivo) return
              const motivo = conferirFoto(arquivo)
              setProblemaDaLogo(motivo ? PROBLEMAS_DA_LOGO[motivo] : null)
              if (!motivo) logo.mutate(arquivo)
            }}
          />
          <Botao
            iconeAntes="upload"
            disabled={ocupado || identidade.rowVersion === 0}
            title={
              identidade.rowVersion === 0
                ? 'Salve os dados abaixo para habilitar o envio da logo.'
                : undefined
            }
            onClick={() => {
              entrada.current?.click()
            }}
          >
            {logo.isPending ? 'Enviando…' : identidade.logoUrl ? 'Trocar logo' : 'Enviar logo'}
          </Botao>
          {identidade.logoUrl ? (
            <Botao
              aparencia="sutil"
              iconeAntes="trash-2"
              disabled={ocupado}
              onClick={() => {
                setProblemaDaLogo(null)
                tirar.mutate()
              }}
            >
              {tirar.isPending ? 'Tirando…' : 'Tirar logo'}
            </Botao>
          ) : null}
          <span className="rotulo">PNG ou JPEG, até 2 MB.</span>
        </div>
        {identidade.rowVersion === 0 ? (
          <p className="text-xs text-(--tinta-2)">
            Salve os dados abaixo para habilitar o envio da logo.
          </p>
        ) : null}
        {erroDaLogo ? (
          <MensagemSecao role="alert" tom="perigo">
            {erroDaLogo}
          </MensagemSecao>
        ) : null}
      </section>

      <section aria-label="Dados da consultoria" className="flex flex-col gap-(--e-3)">
        <Titulo className="corpo-medio">Dados da consultoria</Titulo>
        <div className="grid gap-(--e-3) sm:grid-cols-2">
          <Campo rotulo="Razão social" {...campo('razaoSocial')} />
          <Campo rotulo="CNPJ" inputMode="text" {...campo('cnpj')} />
          <Campo rotulo="Telefone" inputMode="tel" {...campo('telefone')} />
          <Campo rotulo="E-mail" inputMode="email" {...campo('email')} />
          <Campo rotulo="Site" inputMode="url" {...campo('site')} />
          <Campo rotulo="Endereço" {...campo('endereco')} />
        </div>
        <CampoTexto
          rotulo="Texto de apresentação padrão"
          apoio="Vai no início de toda proposta que não tiver texto próprio."
          {...campo('textoApresentacao')}
        />
      </section>

      {salvar.error ? (
        <MensagemSecao role="alert" tom="perigo">
          {mensagemDoErro(salvar.error)}
        </MensagemSecao>
      ) : null}
      {aviso ? (
        <MensagemSecao role="status" tom="sucesso">
          {aviso}
        </MensagemSecao>
      ) : null}
      <div>
        <Botao
          aparencia="primario"
          disabled={!alterado || ocupado}
          aria-busy={salvar.isPending || undefined}
          onClick={() => {
            salvar.mutate()
          }}
        >
          {salvar.isPending ? 'Salvando…' : rotuloSalvar}
        </Botao>
      </div>
    </div>
  )
}

function Campo({
  rotulo,
  value,
  onChange,
  inputMode,
}: {
  rotulo: string
  value: string
  onChange: (e: { target: { value: string } }) => void
  inputMode?: 'text' | 'tel' | 'email' | 'url'
}) {
  const id = useId()
  return (
    <label htmlFor={id} className="flex flex-col gap-(--e-1)">
      <span className="rotulo">{rotulo}</span>
      <input
        id={id}
        inputMode={inputMode}
        className={classeCampo}
        value={value}
        onChange={onChange}
      />
    </label>
  )
}

function CampoTexto({
  rotulo,
  apoio,
  value,
  onChange,
}: {
  rotulo: string
  apoio: string
  value: string
  onChange: (e: { target: { value: string } }) => void
}) {
  const id = useId()
  const idApoio = useId()
  return (
    <div className="flex flex-col gap-(--e-1)">
      <label htmlFor={id} className="rotulo">
        {rotulo}
      </label>
      <textarea
        id={id}
        rows={4}
        maxLength={4000}
        aria-describedby={idApoio}
        className={classeCampo}
        value={value}
        onChange={onChange}
      />
      <span id={idApoio} className="text-xs text-(--tinta-2)">
        {apoio}
      </span>
    </div>
  )
}
