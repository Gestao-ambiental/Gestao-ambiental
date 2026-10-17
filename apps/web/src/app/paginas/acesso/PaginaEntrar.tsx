import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useLocation, useSearchParams } from 'react-router'
import { z } from 'zod'

import type { AvisoDeAcesso } from '@/app/consultoria/RequerConsultoria'
import { destinoSeguro } from '@/app/sessao/destino'
import { useSessao } from '@/app/sessao/contexto-sessao'
import { Botao } from '@/components/ui/botao'
import { CaixaSelecao } from '@/components/ui/caixa-selecao'
import { CampoTexto } from '@/components/ui/campo-texto'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { definirLembrarSessao } from '@/lib/armazenamento-sessao'
import { codigoDoErro, ehMuitasTentativas, mensagemDoErro } from '@/lib/erros'
import { obterSupabase } from '@/lib/supabase'

import { CabecalhoAcesso, RodapeAcesso } from './CabecalhoAcesso'
import { campoEmail } from './esquemas'

const esquema = z.object({
  email: campoEmail,
  senha: z.string().min(1, 'Informe a senha'),
  lembrar: z.boolean(),
})

type Dados = z.infer<typeof esquema>

/** /entrar (Protótipo 01, ACC-01). E-mail e senha; sem Google (ADR-0004). */
export function PaginaEntrar() {
  const { sessao, sessaoExpirou, avisoDeSaida } = useSessao()
  const [busca] = useSearchParams()
  const local = useLocation()
  const para = destinoSeguro(busca.get('para'))
  const aviso = (local.state as AvisoDeAcesso | null)?.aviso ?? avisoDeSaida
  const [falha, setFalha] = useState<string | null>(null)
  const [muitasTentativas, setMuitasTentativas] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Dados>({
    resolver: zodResolver(esquema),
    defaultValues: { email: '', senha: '', lembrar: false },
  })

  if (sessao) return <Navigate to={para} replace />

  const entrar = handleSubmit(async ({ email, senha, lembrar }) => {
    setFalha(null)
    setMuitasTentativas(false)
    definirLembrarSessao(lembrar)
    const { error } = await obterSupabase().auth.signInWithPassword({ email, password: senha })
    if (!error) return
    if (ehMuitasTentativas(error)) {
      setMuitasTentativas(true)
      return
    }
    if (codigoDoErro(error) === 'invalid_credentials') setValue('senha', '')
    setFalha(mensagemDoErro(error))
  })

  const sufixo = para === '/' ? '' : `?para=${encodeURIComponent(para)}`

  return (
    <div className="flex flex-col gap-(--space-300)">
      <CabecalhoAcesso titulo="Entrar no Grama" tituloDaAba="Entrar">
        Licenças, condicionantes e prazos dos empreendimentos dos seus clientes, num lugar só.
      </CabecalhoAcesso>

      {aviso ? <MensagemSecao tom="atencao">{aviso}</MensagemSecao> : null}
      {!aviso && sessaoExpirou ? (
        <MensagemSecao tom="informacao">
          Sua sessão terminou. Entre de novo para continuar.
        </MensagemSecao>
      ) : null}
      {muitasTentativas ? (
        <MensagemSecao role="alert" tom="atencao">
          Muitas tentativas seguidas. Tente de novo em alguns minutos.
        </MensagemSecao>
      ) : null}
      {falha ? (
        <MensagemSecao role="alert" tom="perigo">
          {falha}
        </MensagemSecao>
      ) : null}

      <form
        noValidate
        onSubmit={(evento) => void entrar(evento)}
        className="flex flex-col gap-(--space-200)"
      >
        <CampoTexto
          rotulo="E-mail"
          type="email"
          autoComplete="email"
          erro={errors.email?.message}
          {...register('email')}
        />
        <CampoTexto
          rotulo="Senha"
          senha
          autoComplete="current-password"
          erro={errors.senha?.message}
          {...register('senha')}
        />
        <div className="flex items-center justify-between gap-(--space-100)">
          <CaixaSelecao rotulo="Lembrar de mim" {...register('lembrar')} />
          <Link to="/recuperar-senha" className="corpo">
            Esqueci minha senha
          </Link>
        </div>
        <Botao type="submit" aparencia="primario" larguraTotal disabled={isSubmitting}>
          {isSubmitting ? 'Entrando…' : 'Entrar'}
        </Botao>
      </form>

      <RodapeAcesso>
        <span>Ainda não tem conta?</span>
        <Link to={`/criar-conta${sufixo}`}>Criar conta</Link>
      </RodapeAcesso>
      <p className="-mt-(--space-200) text-center text-xs text-(--text-subtle)">
        Recebeu um convite? Abra o link do e-mail.
      </p>
    </div>
  )
}
