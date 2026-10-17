import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { z } from 'zod'

import {
  CHAVE_MEUS_VINCULOS,
  gravarConsultoriaPreferida,
} from '@/app/consultoria/contexto-consultoria'
import { useSessao } from '@/app/sessao/contexto-sessao'
import { Botao } from '@/components/ui/botao'
import { CampoTexto } from '@/components/ui/campo-texto'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { criarConsultoria } from '@/lib/api/acesso'
import { mensagemDoErro } from '@/lib/erros'

import { CabecalhoAcesso } from './CabecalhoAcesso'
import { RodapeDaConta } from './PaginaEscolherConsultoria'

const esquema = z.object({ nome: z.string().trim().min(1, 'Informe o nome da consultoria') })
type Dados = z.infer<typeof esquema>

/** /criar-consultoria (Protótipo 03, ACC-02). Quem cria vira a Gestão. */
export function PaginaCriarConsultoria() {
  const { sessao } = useSessao()
  const queryClient = useQueryClient()
  // Id gerado aqui: reenviar o formulário (clique duplo, rede instável) não cria outra consultoria.
  const [id] = useState(() => crypto.randomUUID())
  const [criada, setCriada] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Dados>({ resolver: zodResolver(esquema), defaultValues: { nome: '' } })

  const criacao = useMutation({
    mutationFn: ({ nome }: Dados) => criarConsultoria(id, nome),
    onSuccess: async (consultoriaId, { nome }) => {
      if (sessao) gravarConsultoriaPreferida(sessao.user.id, consultoriaId)
      await queryClient.invalidateQueries({ queryKey: [CHAVE_MEUS_VINCULOS], refetchType: 'all' })
      setCriada(nome.trim())
    },
  })

  if (criada) {
    return (
      <div className="flex flex-col gap-(--space-300)">
        <CabecalhoAcesso titulo={`Boas-vindas à ${criada}`} tituloDaAba="Consultoria criada">
          A consultoria está criada e você é a Gestão.
        </CabecalhoAcesso>
        <section aria-labelledby="proximos-passos" className="flex flex-col gap-(--space-100)">
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
    <div className="flex flex-col gap-(--space-300)">
      <CabecalhoAcesso titulo="Criar consultoria">
        Você será a Gestão desta consultoria.
      </CabecalhoAcesso>
      {criacao.isError ? (
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
        className="flex flex-col gap-(--space-200)"
      >
        <CampoTexto
          rotulo="Nome da consultoria"
          autoComplete="organization"
          erro={errors.nome?.message}
          {...register('nome')}
        />
        <Botao type="submit" aparencia="primario" larguraTotal disabled={criacao.isPending}>
          {criacao.isPending ? 'Criando…' : 'Criar consultoria'}
        </Botao>
      </form>
      <RodapeDaConta />
    </div>
  )
}
