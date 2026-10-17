import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { z } from 'zod'

import {
  CHAVE_MEUS_VINCULOS,
  gravarConsultoriaPreferida,
} from '@/app/consultoria/contexto-consultoria'
import { NOMES_PAPEL } from '@/app/papeis'
import { TelaDeEspera } from '@/app/sessao/RequerSessao'
import { useSessao, usuarioDaSessao } from '@/app/sessao/contexto-sessao'
import { Carregando, EstadoErro } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { CampoTexto } from '@/components/ui/campo-texto'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import {
  aceitarConvite,
  consultarConvite,
  enviarEmailDoConvite,
  type ConviteRecebido,
} from '@/lib/api/acesso'
import { formatarInstanteComoData } from '@/lib/datas'
import { mensagemDoErro } from '@/lib/erros'
import { obterSupabase } from '@/lib/supabase'

import { CabecalhoAcesso, RodapeAcesso } from './CabecalhoAcesso'
import { campoNome, esquemaSenhaNova } from './esquemas'

const esquemaConta = esquemaSenhaNova.and(z.object({ nome: campoNome }))
type DadosConta = z.infer<typeof esquemaConta>

function Convidou({ convite }: { convite: ConviteRecebido }) {
  return (
    <>
      <strong className="text-(--text)">{convite.convidadoPorNome}</strong> convidou você para a{' '}
      <strong className="text-(--text)">{convite.consultoriaNome}</strong> como{' '}
      {NOMES_PAPEL[convite.papel]}.
    </>
  )
}

function Indisponivel({ children }: { children: string }) {
  return (
    <div className="flex flex-col gap-(--space-300)">
      <CabecalhoAcesso titulo="Aceitar convite" />
      <MensagemSecao role="alert" tom="perigo">
        {children}
      </MensagemSecao>
      <RodapeAcesso>
        <Link to="/entrar">Voltar para entrar</Link>
      </RodapeAcesso>
    </div>
  )
}

/**
 * /convite?token=… (Protótipo 03, ACC-02). O link do e-mail abre a sessão da pessoa convidada
 * (em qualquer aparelho); quem ainda não tem senha cria aqui, e o aceite é a RPC aceitar_convite.
 */
export function PaginaConvite() {
  const { carregando, sessao, sair } = useSessao()
  const [busca] = useSearchParams()
  const token = busca.get('token') ?? ''
  const aceitarAoEntrar = busca.get('aceitar') === '1'
  const navegar = useNavigate()
  const queryClient = useQueryClient()
  const [linkReenviado, setLinkReenviado] = useState(false)
  const [falhaConta, setFalhaConta] = useState<string | null>(null)
  const aceiteAutomatico = useRef(false)

  const consulta = useQuery({
    queryKey: ['convite', token],
    queryFn: () => consultarConvite(token),
    enabled: Boolean(token) && !carregando,
  })
  const convite = consulta.data
  const usuario = sessao ? usuarioDaSessao(sessao) : null
  const mesmaConta = Boolean(convite && usuario?.email.toLowerCase() === convite.email)

  const aceite = useMutation({
    mutationFn: () => aceitarConvite(token),
    onSuccess: async (consultoriaId) => {
      if (usuario) gravarConsultoriaPreferida(usuario.id, consultoriaId)
      await queryClient.invalidateQueries({ queryKey: [CHAVE_MEUS_VINCULOS], refetchType: 'all' })
      await navegar('/', { replace: true })
    },
  })

  const reenvio = useMutation({
    mutationFn: () => enviarEmailDoConvite(convite?.email ?? '', token),
    onSuccess: () => {
      setLinkReenviado(true)
    },
  })

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DadosConta>({
    resolver: zodResolver(esquemaConta),
    values: { nome: usuario?.nome ?? '', senha: '', repeticao: '' },
    resetOptions: { keepDirtyValues: true },
  })

  // "Entrar e aceitar": depois do login a pessoa volta com aceitar=1 e o aceite segue sozinho.
  const podeAceitarDireto = mesmaConta && convite?.situacao === 'pendente' && convite.contaComSenha
  useEffect(() => {
    if (aceitarAoEntrar && podeAceitarDireto && !aceiteAutomatico.current) {
      aceiteAutomatico.current = true
      aceite.mutate()
    }
  }, [aceitarAoEntrar, podeAceitarDireto, aceite])

  const criarContaEAceitar = handleSubmit(async ({ nome, senha }) => {
    setFalhaConta(null)
    const { error } = await obterSupabase().auth.updateUser({ password: senha, data: { nome } })
    if (error) {
      setFalhaConta(mensagemDoErro(error))
      return
    }
    await aceite.mutateAsync().catch(() => {
      // a mensagem do aceite aparece pela mutation
    })
  })

  if (!token) return <Indisponivel>Este convite já foi usado ou foi cancelado.</Indisponivel>
  if (carregando || consulta.isPending) return <TelaDeEspera />
  if (consulta.isError) {
    return (
      <div className="flex flex-col gap-(--space-300)">
        <CabecalhoAcesso titulo="Aceitar convite" />
        <EstadoErro aoTentarDeNovo={() => void consulta.refetch()} />
      </div>
    )
  }
  if (!convite || convite.situacao === 'cancelado') {
    return <Indisponivel>Este convite já foi usado ou foi cancelado.</Indisponivel>
  }
  if (convite.situacao === 'aceito') {
    if (mesmaConta) {
      return (
        <div className="flex flex-col gap-(--space-300)">
          <CabecalhoAcesso titulo="Aceitar convite">
            Você já faz parte da {convite.consultoriaNome}.
          </CabecalhoAcesso>
          <Botao
            aparencia="primario"
            larguraTotal
            onClick={() => {
              aceite.mutate()
            }}
          >
            Abrir a {convite.consultoriaNome}
          </Botao>
        </div>
      )
    }
    return <Indisponivel>Este convite já foi usado ou foi cancelado.</Indisponivel>
  }
  if (convite.situacao === 'expirado') {
    return (
      <Indisponivel>
        {`Este convite expirou em ${formatarInstanteComoData(convite.expiraEm, convite.fuso)}. Peça um novo à gestão da ${convite.consultoriaNome}.`}
      </Indisponivel>
    )
  }

  const erroAceite = falhaConta ?? (aceite.isError ? mensagemDoErro(aceite.error) : null)
  const cabecalho = (
    <CabecalhoAcesso titulo="Aceitar convite">
      <Convidou convite={convite} />
    </CabecalhoAcesso>
  )
  const aviso = erroAceite ? (
    <MensagemSecao role="alert" tom="perigo">
      {erroAceite}
    </MensagemSecao>
  ) : null

  // Logado com outra conta
  if (usuario && !mesmaConta) {
    return (
      <div className="flex flex-col gap-(--space-300)">
        {cabecalho}
        <MensagemSecao tom="atencao">
          Você está como <strong>{usuario.email}</strong>, mas o convite é para{' '}
          <strong>{convite.email}</strong>.
        </MensagemSecao>
        <Botao aparencia="primario" larguraTotal onClick={() => void sair()}>
          Sair e continuar
        </Botao>
      </div>
    )
  }

  // Logado com a conta do convite
  if (usuario) {
    if (convite.contaComSenha) {
      return (
        <div className="flex flex-col gap-(--space-300)">
          {cabecalho}
          {aviso}
          {aceite.isPending ? <Carregando rotulo="Aceitando o convite" linhas={1} /> : null}
          <Botao
            aparencia="primario"
            larguraTotal
            disabled={aceite.isPending}
            onClick={() => {
              aceite.mutate()
            }}
          >
            {aceite.isPending ? 'Aceitando…' : 'Aceitar convite'}
          </Botao>
        </div>
      )
    }
    return (
      <div className="flex flex-col gap-(--space-300)">
        {cabecalho}
        {aviso}
        <form
          noValidate
          onSubmit={(evento) => void criarContaEAceitar(evento)}
          className="flex flex-col gap-(--space-200)"
        >
          <CampoTexto
            rotulo="Nome"
            autoComplete="name"
            erro={errors.nome?.message}
            {...register('nome')}
          />
          <CampoTexto rotulo="E-mail" type="email" value={convite.email} readOnly />
          <CampoTexto
            rotulo="Senha"
            senha
            autoComplete="new-password"
            ajuda="Mínimo de 8 caracteres"
            erro={errors.senha?.message}
            {...register('senha')}
          />
          <CampoTexto
            rotulo="Repita a senha"
            senha
            autoComplete="new-password"
            erro={errors.repeticao?.message}
            {...register('repeticao')}
          />
          <Botao type="submit" aparencia="primario" larguraTotal disabled={isSubmitting}>
            {isSubmitting ? 'Criando…' : 'Criar conta e entrar'}
          </Botao>
        </form>
      </div>
    )
  }

  // Sem login
  const voltarParaCa = `/convite?token=${encodeURIComponent(token)}&aceitar=1`
  if (convite.contaComSenha) {
    return (
      <div className="flex flex-col gap-(--space-300)">
        {cabecalho}
        <p className="corpo text-(--text-subtle)">
          Você já tem conta com <strong className="text-(--text)">{convite.email}</strong>.
        </p>
        <Botao aparencia="primario" larguraTotal asChild>
          <Link to={`/entrar?para=${encodeURIComponent(voltarParaCa)}`}>Entrar e aceitar</Link>
        </Botao>
      </div>
    )
  }

  // Sem senha e sem sessão: o link de acesso do e-mail expirou (vale 1 hora) ou foi aberto
  // antes. A própria pessoa pede outro, sempre para o e-mail do convite.
  return (
    <div className="flex flex-col gap-(--space-300)">
      {cabecalho}
      {linkReenviado ? (
        <MensagemSecao role="status" tom="sucesso">
          Enviamos um link novo para {convite.email}. Abra-o para criar sua conta.
        </MensagemSecao>
      ) : (
        <p className="corpo text-(--text-subtle)">
          O link de acesso do e-mail expirou. Peça outro para criar sua conta com{' '}
          <strong className="text-(--text)">{convite.email}</strong>.
        </p>
      )}
      {reenvio.isError ? (
        <MensagemSecao role="alert" tom="atencao">
          {mensagemDoErro(reenvio.error)}
        </MensagemSecao>
      ) : null}
      <Botao
        aparencia="primario"
        larguraTotal
        disabled={reenvio.isPending || linkReenviado}
        onClick={() => {
          reenvio.mutate()
        }}
      >
        Enviar link para {convite.email}
      </Botao>
      <RodapeAcesso>
        <Link to="/entrar">Voltar para entrar</Link>
      </RodapeAcesso>
    </div>
  )
}
