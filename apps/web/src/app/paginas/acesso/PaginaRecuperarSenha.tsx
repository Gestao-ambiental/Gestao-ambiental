import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { z } from 'zod'

import { Botao } from '@/components/ui/botao'
import { CampoTexto } from '@/components/ui/campo-texto'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { ehMuitasTentativas, mensagemDoErro } from '@/lib/erros'
import { obterSupabase } from '@/lib/supabase'

import { CabecalhoAcesso, RodapeAcesso } from './CabecalhoAcesso'
import { campoEmail } from './esquemas'

const esquema = z.object({ email: campoEmail })
type Dados = z.infer<typeof esquema>

/** Intervalo mínimo entre envios para o mesmo e-mail no Supabase Auth (60 s). */
const ESPERA_REENVIO_SEGUNDOS = 60

async function pedirLink(email: string): Promise<unknown> {
  const { error } = await obterSupabase().auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/redefinir-senha`,
  })
  return error
}

function formatarEspera(segundos: number): string {
  return `${String(Math.floor(segundos / 60))}:${String(segundos % 60).padStart(2, '0')}`
}

/**
 * /recuperar-senha (Protótipo 02, ACC-01). A resposta é sempre a mesma, exista a conta ou não:
 * a tela nunca revela se o e-mail está cadastrado.
 */
export function PaginaRecuperarSenha() {
  const [enviadoPara, setEnviadoPara] = useState<string | null>(null)
  const [falha, setFalha] = useState<string | null>(null)
  const [espera, setEspera] = useState(0)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Dados>({ resolver: zodResolver(esquema), defaultValues: { email: '' } })

  useEffect(() => {
    if (espera <= 0) return
    const id = window.setTimeout(() => {
      setEspera((valor) => valor - 1)
    }, 1000)
    return () => {
      window.clearTimeout(id)
    }
  }, [espera])

  const enviar = handleSubmit(async ({ email }) => {
    setFalha(null)
    const erro = await pedirLink(email)
    // Só limite de envio aparece: qualquer outra resposta seria pista sobre a conta.
    if (erro && ehMuitasTentativas(erro)) {
      setFalha(mensagemDoErro(erro))
      return
    }
    setEnviadoPara(email)
    setEspera(ESPERA_REENVIO_SEGUNDOS)
  })

  async function reenviar() {
    if (!enviadoPara) return
    setFalha(null)
    const erro = await pedirLink(enviadoPara)
    if (erro && ehMuitasTentativas(erro)) setFalha(mensagemDoErro(erro))
    setEspera(ESPERA_REENVIO_SEGUNDOS)
  }

  if (enviadoPara) {
    return (
      <div className="flex flex-col gap-(--space-300)">
        <CabecalhoAcesso titulo="Confira seu e-mail">
          Se houver uma conta com <strong className="text-(--text)">{enviadoPara}</strong>, enviamos
          um link. Ele vale por 1 hora.
        </CabecalhoAcesso>
        {falha ? (
          <MensagemSecao role="alert" tom="atencao">
            {falha}
          </MensagemSecao>
        ) : null}
        <Botao larguraTotal disabled={espera > 0} onClick={() => void reenviar()}>
          {espera > 0 ? `Reenviar em ${formatarEspera(espera)}` : 'Reenviar'}
        </Botao>
        <RodapeAcesso>
          <Link to="/entrar">Voltar para entrar</Link>
        </RodapeAcesso>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-(--space-300)">
      <CabecalhoAcesso titulo="Recuperar senha">
        Informe o e-mail da sua conta. Enviaremos um link para criar uma senha nova.
      </CabecalhoAcesso>
      {falha ? (
        <MensagemSecao role="alert" tom="atencao">
          {falha}
        </MensagemSecao>
      ) : null}
      <form
        noValidate
        onSubmit={(evento) => void enviar(evento)}
        className="flex flex-col gap-(--space-200)"
      >
        <CampoTexto
          rotulo="E-mail"
          type="email"
          autoComplete="email"
          erro={errors.email?.message}
          {...register('email')}
        />
        <Botao type="submit" aparencia="primario" larguraTotal disabled={isSubmitting}>
          {isSubmitting ? 'Enviando…' : 'Enviar link'}
        </Botao>
      </form>
      <RodapeAcesso>
        <Link to="/entrar">Voltar para entrar</Link>
      </RodapeAcesso>
    </div>
  )
}
