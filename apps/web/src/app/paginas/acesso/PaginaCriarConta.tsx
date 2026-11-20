import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useSearchParams } from 'react-router'
import { z } from 'zod'

import { destinoSeguro } from '@/app/sessao/destino'
import { useSessao } from '@/app/sessao/contexto-sessao'
import { Botao } from '@/components/ui/botao'
import { CampoTexto } from '@/components/ui/campo-texto'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { codigoDoErro, mensagemDoErro } from '@/lib/erros'
import { obterSupabase } from '@/lib/supabase'

import { CabecalhoAcesso, RodapeAcesso } from './CabecalhoAcesso'
import { EntrarComGoogle } from './EntrarComGoogle'
import { CamposGeneroEFormacao } from './CamposGeneroEFormacao'
import { campoEmail, campoNome, esquemaGeneroEFormacao, esquemaSenhaNova } from './esquemas'

const esquema = esquemaSenhaNova.and(
  z.object({ nome: campoNome, email: campoEmail }).and(esquemaGeneroEFormacao),
)
type Dados = z.infer<typeof esquema>

const JA_EXISTE = 'Já existe uma conta com este e-mail.'

/**
 * /criar-conta (Protótipo 03, fluxo sem convite; ACC-01). Conta pessoal: nome, e-mail, gênero,
 * formação e senha, sem CPF (ADR-0004). Formação e gênero vão nos metadados do Auth e o banco os
 * copia para o vínculo quando ele é criado (ADR-0021). Com confirmação de e-mail ligada, a conta só
 * entra depois do link.
 */
export function PaginaCriarConta() {
  const { sessao } = useSessao()
  const [busca] = useSearchParams()
  const para = destinoSeguro(busca.get('para'))
  const [confirmarEm, setConfirmarEm] = useState<string | null>(null)
  const [falha, setFalha] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<Dados>({
    resolver: zodResolver(esquema),
    defaultValues: {
      nome: '',
      email: '',
      genero: '',
      profissao: '',
      emCurso: false,
      senha: '',
      repeticao: '',
    },
  })

  if (sessao && !confirmarEm) return <Navigate to={para} replace />

  const criar = handleSubmit(async ({ nome, email, genero, profissao, emCurso, senha }) => {
    setFalha(null)
    const { data, error } = await obterSupabase().auth.signUp({
      email,
      password: senha,
      options: {
        data: { nome, profissao, genero, profissao_em_curso: emCurso },
        emailRedirectTo: `${window.location.origin}${para}`,
      },
    })
    const jaExiste =
      codigoDoErro(error) === 'user_already_exists' ||
      codigoDoErro(error) === 'email_exists' ||
      (!error && data.user?.identities?.length === 0)
    if (jaExiste) {
      setError('email', { message: JA_EXISTE })
      return
    }
    if (error) {
      setFalha(mensagemDoErro(error))
      return
    }
    if (!data.session) setConfirmarEm(email)
  })

  if (confirmarEm) {
    return (
      <div className="flex flex-col gap-(--e-6)">
        <CabecalhoAcesso titulo="Confira seu e-mail">
          Enviamos um link para <strong className="text-(--tinta)">{confirmarEm}</strong>. Abra-o
          para ativar a conta e entrar.
        </CabecalhoAcesso>
        <RodapeAcesso>
          <Link to="/entrar">Voltar para entrar</Link>
        </RodapeAcesso>
      </div>
    )
  }

  const sufixo = para === '/' ? '' : `?para=${encodeURIComponent(para)}`

  return (
    <div className="flex flex-col gap-(--e-6)">
      <CabecalhoAcesso titulo="Criar conta" />

      {/* Pelo Google a conta nasce no Supabase e volta pelo /entrar; o resto do cadastro (gênero e
          formação) é pedido depois, em "Complete seu cadastro" (ADR-0040). */}
      <EntrarComGoogle
        voltarPara={`/entrar${para === '/' ? '' : `?para=${encodeURIComponent(para)}`}`}
      />
      {falha ? (
        <MensagemSecao role="alert" tom="perigo">
          {falha}
        </MensagemSecao>
      ) : null}
      <form
        noValidate
        onSubmit={(evento) => void criar(evento)}
        className="flex flex-col gap-(--e-4)"
      >
        <CampoTexto
          rotulo="Nome"
          autoComplete="name"
          erro={errors.nome?.message}
          {...register('nome')}
        />
        <div className="flex flex-col gap-(--e-1)">
          <CampoTexto
            rotulo="E-mail"
            type="email"
            autoComplete="email"
            erro={errors.email?.message}
            {...register('email')}
          />
          {errors.email?.message === JA_EXISTE ? (
            <Link to={`/entrar${sufixo}`} className="text-xs">
              Entrar?
            </Link>
          ) : null}
        </div>
        <CamposGeneroEFormacao control={control} />
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
          {isSubmitting ? 'Criando…' : 'Criar conta'}
        </Botao>
      </form>
      <RodapeAcesso>
        <span>Já tem conta?</span>
        <Link to={`/entrar${sufixo}`}>Entrar</Link>
      </RodapeAcesso>
    </div>
  )
}
