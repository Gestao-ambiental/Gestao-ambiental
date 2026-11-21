import { cnpjValido, mascararCnpj } from '@gestao-ambiental/domain'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import { z } from 'zod'

import {
  CHAVE_MEUS_VINCULOS,
  gravarConsultoriaPreferida,
} from '@/app/consultoria/contexto-consultoria'
import { useSessao } from '@/app/sessao/contexto-sessao'
import { Botao } from '@/components/ui/botao'
import { CampoTexto } from '@/components/ui/campo-texto'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { abrirConsultoria } from '@/lib/api/acesso'
import { enviarLogo, salvarIdentidade } from '@/lib/api/identidade'
import { conferirFoto, type ProblemaDaFoto } from '@/lib/api/perfil'
import { mensagemDoErro } from '@/lib/erros'

import { CabecalhoAcesso } from './CabecalhoAcesso'
import { RodapeDaConta } from './PaginaEscolherConsultoria'

const esquema = z.object({
  nome: z.string().trim().min(1, 'Informe o nome da consultoria'),
  cnpj: z
    .string()
    .trim()
    .min(1, 'Informe o CNPJ')
    .refine((valor) => cnpjValido(valor), 'CNPJ inválido'),
})
type Dados = z.infer<typeof esquema>

/** Onde se entra na lista de espera do beta. */
export const LINK_DA_LISTA_DE_ESPERA = 'https://gramaapp.com.br/'

function semConviteDoBeta(erro: unknown): boolean {
  return (erro as { message?: unknown } | null)?.message === 'convite_do_beta_obrigatorio'
}

const PROBLEMAS_DO_LOGO: Record<ProblemaDaFoto, string> = {
  tipo: 'Envie uma imagem PNG ou JPEG.',
  vazio: 'Este arquivo está vazio.',
  grande_demais: 'A imagem passa de 2 MB.',
}

/**
 * Logo escolhido na criação: grava a identidade (razão social = nome da consultoria) e envia o
 * logo, que sai nas propostas. Falhar aqui não desfaz a consultoria: dá para enviar depois em
 * Dados da proposta.
 */
async function guardarLogo(consultoriaId: string, nome: string, arquivo: File): Promise<void> {
  await salvarIdentidade(consultoriaId, 0, {
    razaoSocial: nome,
    cnpj: '',
    endereco: '',
    telefone: '',
    email: '',
    site: '',
    textoApresentacao: '',
  })
  await enviarLogo(consultoriaId, arquivo)
}

/**
 * /criar-consultoria (Protótipo 03, ACC-02, ADR-0058). Quem cria vira a Gestão. CNPJ obrigatório;
 * no beta, só com convite do beta; sem teste (já usou), vai direto para o plano.
 */
export function PaginaCriarConsultoria() {
  const { sessao } = useSessao()
  const queryClient = useQueryClient()
  const navegar = useNavigate()
  // Id gerado aqui: reenviar o formulário (clique duplo, rede instável) não cria outra consultoria.
  const [id] = useState(() => crypto.randomUUID())
  const [criada, setCriada] = useState<string | null>(null)
  const [logo, setLogo] = useState<File | null>(null)
  const [problemaDoLogo, setProblemaDoLogo] = useState<string | null>(null)
  const [logoFalhou, setLogoFalhou] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<Dados>({ resolver: zodResolver(esquema), defaultValues: { nome: '', cnpj: '' } })

  const criacao = useMutation({
    mutationFn: ({ nome, cnpj }: Dados) => abrirConsultoria(id, nome, cnpj),
    onSuccess: async ({ consultoriaId, acesso }, { nome }) => {
      if (sessao) gravarConsultoriaPreferida(sessao.user.id, consultoriaId)
      if (logo) {
        await guardarLogo(consultoriaId, nome.trim(), logo).catch(() => {
          setLogoFalhou(true)
        })
      }
      await queryClient.invalidateQueries({ queryKey: [CHAVE_MEUS_VINCULOS], refetchType: 'all' })
      if (acesso === 'sem_teste') {
        await navegar('/configuracoes/plano', { replace: true })
        return
      }
      setCriada(nome.trim())
    },
  })

  if (criada) {
    return (
      <div className="flex flex-col gap-(--e-6)">
        <CabecalhoAcesso titulo={`Boas-vindas à ${criada}`} tituloDaAba="Consultoria criada">
          A consultoria está criada e você é a Gestão.
        </CabecalhoAcesso>
        {logoFalhou ? (
          <MensagemSecao role="alert" tom="atencao">
            O logo não foi enviado.{' '}
            <Link to="/configuracoes/proposta">Enviar em Dados da proposta</Link>
          </MensagemSecao>
        ) : null}
        <section aria-labelledby="proximos-passos" className="flex flex-col gap-(--e-2)">
          <h2 id="proximos-passos" className="titulo-secao">
            Próximos passos
          </h2>
          <Botao aparencia="primario" larguraTotal asChild>
            <Link to="/configuracoes/equipe">Convidar a equipe</Link>
          </Botao>
          <Botao larguraTotal asChild>
            <Link to="/empreendimentos">Cadastrar o primeiro empreendimento</Link>
          </Botao>
          <Botao aparencia="sutil" larguraTotal asChild>
            <Link to="/">Fazer isso depois</Link>
          </Botao>
        </section>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-(--e-6)">
      <CabecalhoAcesso titulo="Criar consultoria">
        Você será a Gestão desta consultoria.
      </CabecalhoAcesso>
      {criacao.isError && semConviteDoBeta(criacao.error) ? (
        <MensagemSecao role="alert" tom="atencao" titulo="Falta o convite do beta">
          {mensagemDoErro(criacao.error)}{' '}
          <a href={LINK_DA_LISTA_DE_ESPERA} target="_blank" rel="noopener noreferrer">
            Entrar na lista de espera
          </a>
        </MensagemSecao>
      ) : criacao.isError ? (
        <MensagemSecao role="alert" tom="perigo">
          {mensagemDoErro(criacao.error)}
        </MensagemSecao>
      ) : null}
      <form
        noValidate
        onSubmit={(evento) =>
          void handleSubmit((dados) => {
            criacao.mutate(dados)
          })(evento)
        }
        className="flex flex-col gap-(--e-4)"
      >
        <CampoTexto
          rotulo="Nome da consultoria"
          autoComplete="organization"
          erro={errors.nome?.message}
          {...register('nome')}
        />
        <CampoTexto
          rotulo="CNPJ"
          autoComplete="off"
          spellCheck={false}
          erro={errors.cnpj?.message}
          {...register('cnpj', {
            onChange: (evento: { target: { value: string } }) => {
              setValue('cnpj', mascararCnpj(evento.target.value))
            },
          })}
        />
        <div role="group" aria-labelledby="rotulo-logo" className="flex flex-col gap-(--e-1)">
          <span id="rotulo-logo" className="rotulo">
            Logo (opcional)
          </span>
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
              setProblemaDoLogo(motivo ? PROBLEMAS_DO_LOGO[motivo] : null)
              setLogo(motivo ? null : arquivo)
            }}
          />
          <div className="flex flex-wrap items-center gap-(--e-2)">
            <Botao
              iconeAntes="upload"
              aria-describedby={problemaDoLogo ? 'erro-logo' : undefined}
              onClick={() => {
                entrada.current?.click()
              }}
            >
              {logo ? 'Trocar logo' : 'Escolher logo'}
            </Botao>
            {logo ? (
              <>
                <span className="corpo">{logo.name}</span>
                <Botao
                  aparencia="sutil"
                  onClick={() => {
                    setLogo(null)
                  }}
                >
                  Tirar
                </Botao>
              </>
            ) : null}
          </div>
          {problemaDoLogo ? (
            <span id="erro-logo" role="alert" className="text-xs text-(--atraso-texto)">
              {problemaDoLogo}
            </span>
          ) : null}
        </div>
        <Botao type="submit" aparencia="primario" larguraTotal disabled={criacao.isPending}>
          {criacao.isPending ? 'Criando…' : 'Criar consultoria'}
        </Botao>
      </form>
      <RodapeDaConta />
    </div>
  )
}
