import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import type { z } from 'zod'

import { TelaDeEspera } from '@/app/sessao/RequerSessao'
import { useSessao, usuarioDaSessao } from '@/app/sessao/contexto-sessao'
import { Botao } from '@/components/ui/botao'
import { CampoTexto } from '@/components/ui/campo-texto'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { mensagemDoErro } from '@/lib/erros'
import { obterSupabase } from '@/lib/supabase'

import { CabecalhoAcesso, RodapeAcesso } from './CabecalhoAcesso'
import { esquemaSenhaNova } from './esquemas'
import { lerLinkDoEmail } from './link-do-email'

type Dados = z.infer<typeof esquemaSenhaNova>

/**
 * /redefinir-senha (Protótipo 02). Aberta pelo link do e-mail, que já traz a sessão de
 * recuperação. Ao salvar, encerra as sessões dos outros aparelhos (ACC-01).
 */
export function PaginaRedefinirSenha() {
  const { carregando, sessao, recuperandoSenha } = useSessao()
  const navegar = useNavigate()
  const [link] = useState(() => lerLinkDoEmail())
  const [alterada, setAlterada] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Dados>({
    resolver: zodResolver(esquemaSenhaNova),
    defaultValues: { senha: '', repeticao: '' },
  })

  const salvar = handleSubmit(async ({ senha }) => {
    setFalha(null)
    const supabase = obterSupabase()
    const { error } = await supabase.auth.updateUser({ password: senha })
    if (error) {
      setFalha(mensagemDoErro(error))
      return
    }
    await supabase.auth.signOut({ scope: 'others' })
    setAlterada(true)
  })

  if (alterada) {
    return (
      <div className="flex flex-col gap-(--space-300)">
        <CabecalhoAcesso titulo="Criar senha nova" />
        <MensagemSecao role="status" tom="sucesso">
          Senha alterada. Por segurança, encerramos as sessões abertas em outros aparelhos.
        </MensagemSecao>
        <Botao
          aparencia="primario"
          larguraTotal
          onClick={() => void navegar('/', { replace: true })}
        >
          Entrar
        </Botao>
      </div>
    )
  }

  const linkValido = !link.erro && (link.recuperacao || recuperandoSenha)
  if (linkValido && carregando) return <TelaDeEspera />

  if (!linkValido || !sessao) {
    return (
      <div className="flex flex-col gap-(--space-300)">
        <CabecalhoAcesso titulo="Criar senha nova" />
        <MensagemSecao role="alert" tom="perigo" titulo="Este link expirou ou já foi usado.">
          Cada link vale por 1 hora e funciona uma vez.
        </MensagemSecao>
        <Botao aparencia="primario" larguraTotal asChild>
          <Link to="/recuperar-senha">Pedir outro link</Link>
        </Botao>
        <RodapeAcesso>
          <Link to="/entrar">Voltar para entrar</Link>
        </RodapeAcesso>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-(--space-300)">
      <CabecalhoAcesso titulo="Criar senha nova">
        Conta: {usuarioDaSessao(sessao).email}
      </CabecalhoAcesso>
      {falha ? (
        <MensagemSecao role="alert" tom="perigo">
          {falha}
        </MensagemSecao>
      ) : null}
      <form
        noValidate
        onSubmit={(evento) => void salvar(evento)}
        className="flex flex-col gap-(--space-200)"
      >
        <CampoTexto
          rotulo="Nova senha"
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
          {isSubmitting ? 'Salvando…' : 'Salvar senha'}
        </Botao>
      </form>
    </div>
  )
}
