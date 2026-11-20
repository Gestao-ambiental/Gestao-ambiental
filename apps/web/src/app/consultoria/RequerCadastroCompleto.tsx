import { generoDoCodigo, profissaoDoCodigo } from '@gestao-ambiental/domain'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useForm } from 'react-hook-form'

import { LayoutPublico } from '@/app/layout/LayoutPublico'
import { CabecalhoAcesso } from '@/app/paginas/acesso/CabecalhoAcesso'
import {
  CamposGeneroEFormacao,
  type DadosGeneroEFormacao,
} from '@/app/paginas/acesso/CamposGeneroEFormacao'
import { esquemaGeneroEFormacao } from '@/app/paginas/acesso/esquemas'
import { RodapeDaConta } from '@/app/paginas/acesso/PaginaEscolherConsultoria'
import { TelaDeEspera } from '@/app/sessao/RequerSessao'
import { Botao } from '@/components/ui/botao'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import {
  cadastroCompleto,
  completarCadastro,
  meuCadastro,
  type CadastroDaPessoa,
} from '@/lib/api/perfil'
import { mensagemDoErro } from '@/lib/erros'

import { CHAVE_MEU_CADASTRO, useConsultoria } from './contexto-consultoria'

/**
 * Antes do sistema: o vínculo atual precisa ter formação (profissão principal) e gênero (ADR-0021).
 * Conta antiga sem um deles vê "Complete seu cadastro"; salvo, a tela não volta. Como as outras
 * proteções de rota, isto é apresentação: o banco continua decidindo o acesso.
 */
export function RequerCadastroCompleto({ children }: { children: ReactNode }) {
  const { atual } = useConsultoria()
  const consulta = useQuery({
    queryKey: [CHAVE_MEU_CADASTRO, atual.membroId],
    queryFn: () => meuCadastro(atual.membroId),
  })

  // Com o cadastro já lido, uma releitura que falhe não tira a pessoa da tela em que está.
  if (consulta.data) {
    return cadastroCompleto(consulta.data) ? (
      children
    ) : (
      <CompletarCadastro cadastro={consulta.data} />
    )
  }
  if (consulta.isError) {
    return (
      <TelaDeEspera
        erro={{
          titulo: 'Não foi possível carregar seu cadastro',
          descricao: 'Verifique a conexão e tente de novo.',
        }}
        aoTentarDeNovo={() => void consulta.refetch()}
      />
    )
  }
  return <TelaDeEspera />
}

function CompletarCadastro({ cadastro }: { cadastro: CadastroDaPessoa }) {
  const { atual } = useConsultoria()
  const queryClient = useQueryClient()
  const { handleSubmit, control } = useForm<DadosGeneroEFormacao>({
    resolver: zodResolver(esquemaGeneroEFormacao),
    defaultValues: {
      genero: cadastro.genero ?? '',
      profissao: cadastro.profissao ?? '',
      emCurso: cadastro.emCurso,
    },
  })

  const salvar = useMutation({
    mutationFn: async (dados: DadosGeneroEFormacao) => {
      const profissao = profissaoDoCodigo(dados.profissao)
      const genero = generoDoCodigo(dados.genero)
      // O esquema já garante os dois; isto só estreita o tipo.
      if (!profissao || !genero) throw new Error('dados_invalidos')
      await completarCadastro(profissao, genero, dados.emCurso)
      return { profissao, emCurso: dados.emCurso, genero }
    },
    onSuccess: async (gravado) => {
      queryClient.setQueryData<CadastroDaPessoa>([CHAVE_MEU_CADASTRO, atual.membroId], gravado)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['meu-perfil'] }),
        queryClient.invalidateQueries({ queryKey: ['membros-ativos'] }),
        queryClient.invalidateQueries({ queryKey: ['membros'] }),
      ])
    },
  })

  const enviar = handleSubmit((dados) => {
    salvar.mutate(dados)
  })

  return (
    <LayoutPublico>
      <div className="flex flex-col gap-(--e-6)">
        <CabecalhoAcesso titulo="Complete seu cadastro" />
        {salvar.isError ? (
          <MensagemSecao role="alert" tom="perigo">
            {mensagemDoErro(salvar.error)}
          </MensagemSecao>
        ) : null}
        <form
          noValidate
          onSubmit={(evento) => void enviar(evento)}
          className="flex flex-col gap-(--e-4)"
        >
          <fieldset disabled={salvar.isPending} className="flex min-w-0 flex-col gap-(--e-4)">
            <CamposGeneroEFormacao control={control} />
          </fieldset>
          <Botao type="submit" aparencia="primario" larguraTotal disabled={salvar.isPending}>
            {salvar.isPending ? 'Salvando…' : 'Salvar e continuar'}
          </Botao>
        </form>
        <RodapeDaConta />
      </div>
    </LayoutPublico>
  )
}
