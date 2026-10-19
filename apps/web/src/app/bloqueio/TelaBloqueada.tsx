import type { Session } from '@supabase/supabase-js'
import { Dialog as Primitivo } from 'radix-ui'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'

import { useSessao, usuarioDaSessao } from '@/app/sessao/contexto-sessao'
import { Avatar } from '@/components/ui/avatar'
import { Botao } from '@/components/ui/botao'
import { CampoTexto } from '@/components/ui/campo-texto'
import { Icone } from '@/components/ui/icone'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import {
  codigoDoErro,
  ehMuitasTentativas,
  mensagemDoErro,
  MENSAGEM_MUITAS_TENTATIVAS,
} from '@/lib/erros'
import { obterSupabase } from '@/lib/supabase'

/**
 * Tela bloqueada (ACC-05). Modal do Radix por cima de tudo, inclusive de um modal já aberto: o
 * foco fica preso aqui, o resto da página sai da árvore de acessibilidade e nada embaixo é
 * desmontado. Desbloqueia com a senha da mesma conta; "Sair" é a única outra saída.
 */
export function TelaBloqueada({
  sessao,
  aoDesbloquear,
}: {
  sessao: Session
  aoDesbloquear: () => void
}) {
  const { sair } = useSessao()
  const navegar = useNavigate()
  const usuario = usuarioDaSessao(sessao)
  const campo = useRef<HTMLInputElement>(null)
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [conferindo, setConferindo] = useState(false)
  const [confirmandoSaida, setConfirmandoSaida] = useState(false)

  async function desbloquear() {
    if (!senha) {
      setErro('Digite sua senha')
      campo.current?.focus()
      return
    }
    setConferindo(true)
    setErro(null)
    const { error } = await obterSupabase().auth.signInWithPassword({
      email: usuario.email,
      password: senha,
    })
    setConferindo(false)
    if (error) {
      setErro(
        ehMuitasTentativas(error)
          ? MENSAGEM_MUITAS_TENTATIVAS
          : codigoDoErro(error) === 'invalid_credentials'
            ? 'Senha incorreta.'
            : mensagemDoErro(error),
      )
      setSenha('')
      campo.current?.focus()
      return
    }
    setSenha('')
    aoDesbloquear()
  }

  return (
    <Primitivo.Root open>
      <Primitivo.Portal>
        <Primitivo.Overlay className="fixed inset-0 z-[100] bg-(--surface-sunken)" />
        <Primitivo.Content
          aria-describedby="descricao-bloqueio"
          onEscapeKeyDown={(evento) => {
            evento.preventDefault()
          }}
          onInteractOutside={(evento) => {
            evento.preventDefault()
          }}
          onOpenAutoFocus={(evento) => {
            evento.preventDefault()
            campo.current?.focus()
          }}
          className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-(--surface-sunken) px-(--space-200) pt-[12vh] pb-(--space-400) outline-none"
        >
          <div className="flex w-full max-w-[400px] flex-col gap-(--space-200) rounded-(--radius) border bg-(--surface) p-(--space-300) shadow-sobreposicao">
            <p className="titulo-secao text-(--text-brand)">Grama</p>
            <div className="flex items-center gap-(--space-150)">
              <Avatar nome={usuario.nome} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate corpo-medio">{usuario.nome}</span>
                <span className="truncate text-xs text-(--text-subtle)">{usuario.email}</span>
              </span>
            </div>
            <div className="flex flex-col gap-(--space-050)">
              <Primitivo.Title className="flex items-center gap-(--space-100) titulo-tela">
                <Icone nome="lock" />
                Tela bloqueada
              </Primitivo.Title>
              <Primitivo.Description id="descricao-bloqueio" className="corpo text-(--text-subtle)">
                Digite sua senha para voltar de onde parou. O que você estava fazendo continua aqui.
              </Primitivo.Description>
            </div>

            <form
              noValidate
              className="flex flex-col gap-(--space-150)"
              onSubmit={(evento) => {
                evento.preventDefault()
                void desbloquear()
              }}
            >
              <CampoTexto
                ref={campo}
                rotulo="Senha"
                senha
                autoComplete="current-password"
                value={senha}
                erro={erro ?? undefined}
                onChange={(evento) => {
                  setSenha(evento.target.value)
                  setErro(null)
                }}
              />
              <Botao type="submit" aparencia="primario" larguraTotal disabled={conferindo}>
                {conferindo ? 'Conferindo…' : 'Desbloquear'}
              </Botao>
            </form>

            {confirmandoSaida ? (
              <MensagemSecao
                tom="atencao"
                titulo="Sair desta conta?"
                acoes={
                  <>
                    <Botao
                      tamanho="compacto"
                      onClick={() => {
                        setConfirmandoSaida(false)
                      }}
                    >
                      Cancelar
                    </Botao>
                    <Botao
                      tamanho="compacto"
                      aparencia="perigo"
                      onClick={() => {
                        void sair().then(() => navegar('/entrar', { replace: true }))
                      }}
                    >
                      Sair
                    </Botao>
                  </>
                }
              >
                O que não foi salvo nesta tela se perde.
              </MensagemSecao>
            ) : (
              <Botao
                aparencia="link"
                className="self-center"
                onClick={() => {
                  setConfirmandoSaida(true)
                }}
              >
                Sair e entrar com outra conta
              </Botao>
            )}
          </div>
        </Primitivo.Content>
      </Primitivo.Portal>
    </Primitivo.Root>
  )
}
