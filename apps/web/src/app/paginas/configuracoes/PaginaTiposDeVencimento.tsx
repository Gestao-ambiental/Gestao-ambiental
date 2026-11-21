// /configuracoes/vencimentos (ADR-0046): tipos de vencimento da consultoria (Alvará, ART, CTF IBAMA,
// Outorga, AVCB, Certidão e os que a Gestão criar), com antecedência e PDF obrigatório. Só a Gestão
// cria, edita, desativa e reativa; não há exclusão. Tipo desativado continua nos vencimentos que já
// o usam e pode ser renovado; só não serve para vencimento novo.
import { ANTECEDENCIA_PADRAO_DIAS, antecedenciaValida } from '@gestao-ambiental/domain'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { PaginaDeConfiguracoes } from '@/app/paginas/configuracoes/PaginaDeConfiguracoes'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { BotaoMais } from '@/components/ui/botao-mais'
import { CaixaSelecao } from '@/components/ui/caixa-selecao'
import { CampoTexto } from '@/components/ui/campo-texto'
import { Dialogo } from '@/components/ui/dialogo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Selo } from '@/components/ui/selo'
import {
  criarTipoDeVencimento,
  editarTipoDeVencimento,
  listarTiposDeVencimento,
  type TipoDeVencimento,
} from '@/lib/api/vencimentos'
import { ehSemPermissao, mensagemDoErroDoVencimento } from '@/lib/erros'
import { cn } from '@/lib/utils'

const classeCabecalho =
  'h-10 border-b px-(--e-3) text-left rotulo-maiusculo whitespace-nowrap text-(--tinta-2)'
const classeCelula = 'h-(--linha) border-b border-(--regra-leve) px-(--e-3) align-middle'

function dias(n: number): string {
  return `${String(n)} ${n === 1 ? 'dia' : 'dias'}`
}

export function PaginaTiposDeVencimento() {
  const { atual } = useConsultoria()
  if (atual.papel !== 'gestao') {
    return (
      <PaginaDeConfiguracoes>
        <SemPermissao />
      </PaginaDeConfiguracoes>
    )
  }
  return <ListaDeTipos />
}

type Aberto = { tipo: 'novo' } | { tipo: 'editar'; existente: TipoDeVencimento } | null

function ListaDeTipos() {
  const { atual } = useConsultoria()
  const cid = atual.consultoriaId
  const queryClient = useQueryClient()
  const [aberto, setAberto] = useState<Aberto>(null)

  const tipos = useQuery({
    queryKey: ['tipos-vencimento', cid],
    queryFn: () => listarTiposDeVencimento(cid),
  })
  const alternar = useMutation({
    mutationFn: (t: TipoDeVencimento) =>
      editarTipoDeVencimento(t.id, {
        nome: t.nome,
        antecedenciaDias: t.antecedenciaDias,
        exigePdf: t.exigePdf,
        ativo: !t.ativo,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tipos-vencimento', cid] }),
  })

  const novo = (
    <Botao
      aparencia="primario"
      iconeAntes="plus"
      onClick={() => {
        setAberto({ tipo: 'novo' })
      }}
    >
      Novo tipo
    </Botao>
  )
  const vazio = tipos.isSuccess && tipos.data.length === 0

  return (
    <PaginaDeConfiguracoes acao={vazio ? undefined : novo}>
      {alternar.isError ? (
        <MensagemSecao role="alert" tom="perigo">
          {mensagemDoErroDoVencimento(alternar.error)}
        </MensagemSecao>
      ) : null}
      {tipos.isPending ? (
        <Carregando rotulo="Carregando tipos de vencimento" />
      ) : tipos.isError ? (
        ehSemPermissao(tipos.error) ? (
          <SemPermissao />
        ) : (
          <EstadoErro aoTentarDeNovo={() => void tipos.refetch()} />
        )
      ) : tipos.data.length === 0 ? (
        <EstadoVazio
          icone="calendar-check"
          titulo="Nenhum tipo de vencimento"
          acaoPrincipal={novo}
        />
      ) : (
        <div className="max-h-[calc(100dvh-280px)] overflow-auto rounded-(--raio-painel) border bg-(--folha)">
          <table className="w-full border-collapse corpo">
            <caption className="sr-only">Tipos de vencimento</caption>
            <thead className="sticky top-0 z-10 bg-(--folha)">
              <tr>
                <th scope="col" className={classeCabecalho}>
                  Tipo
                </th>
                <th scope="col" className={cn(classeCabecalho, 'max-md:hidden')}>
                  Antecedência
                </th>
                <th scope="col" className={cn(classeCabecalho, 'max-md:hidden')}>
                  PDF obrigatório
                </th>
                <th scope="col" className={classeCabecalho}>
                  Situação
                </th>
                <th scope="col" className={classeCabecalho}>
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {tipos.data.map((t) => (
                <tr key={t.id} className="transicao-estado hover:bg-(--toque)">
                  <td className={cn(classeCelula, 'max-md:py-(--e-2)')}>
                    <span
                      className={cn(
                        'block corpo-medio',
                        t.ativo ? 'text-(--tinta)' : 'text-(--tinta-2)',
                      )}
                    >
                      {t.nome}
                    </span>
                    <span className="block text-xs text-(--tinta-2) numero md:hidden">
                      {dias(t.antecedenciaDias)} · {t.exigePdf ? 'PDF obrigatório' : 'PDF opcional'}
                    </span>
                  </td>
                  <td className={cn(classeCelula, 'whitespace-nowrap numero max-md:hidden')}>
                    {dias(t.antecedenciaDias)}
                  </td>
                  <td className={cn(classeCelula, 'max-md:hidden')}>
                    {t.exigePdf ? 'Sim' : 'Não'}
                  </td>
                  <td className={classeCelula}>
                    <Selo tom={t.ativo ? 'sucesso' : 'padrao'}>
                      {t.ativo ? 'Ativo' : 'Desativado'}
                    </Selo>
                  </td>
                  <td className={cn(classeCelula, 'w-px whitespace-nowrap')}>
                    <BotaoMais
                      de={t.nome}
                      desabilitado={alternar.isPending}
                      itens={[
                        {
                          rotulo: 'Editar',
                          icone: 'pencil',
                          aoEscolher: () => {
                            setAberto({ tipo: 'editar', existente: t })
                          },
                        },
                        {
                          rotulo: t.ativo ? 'Desativar' : 'Reativar',
                          icone: t.ativo ? 'archive' : 'refresh-cw',
                          aoEscolher: () => {
                            alternar.mutate(t)
                          },
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {aberto ? (
        <DialogoTipo
          existente={aberto.tipo === 'editar' ? aberto.existente : null}
          aoFechar={() => {
            setAberto(null)
          }}
          aoSalvar={async () => {
            setAberto(null)
            await queryClient.invalidateQueries({ queryKey: ['tipos-vencimento', cid] })
          }}
        />
      ) : null}
    </PaginaDeConfiguracoes>
  )
}

const esquema = z.object({
  nome: z.string().trim().min(1, 'Informe o nome').max(60, 'Use até 60 caracteres'),
  antecedencia: z
    .string()
    .refine(
      (valor) => /^\d+$/.test(valor.trim()) && antecedenciaValida(Number(valor)),
      'Use de 0 a 730 dias',
    ),
  exigePdf: z.boolean(),
})
type Campos = z.infer<typeof esquema>

function DialogoTipo({
  existente,
  aoFechar,
  aoSalvar,
}: {
  existente: TipoDeVencimento | null
  aoFechar: () => void
  aoSalvar: () => Promise<void>
}) {
  const { atual } = useConsultoria()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Campos>({
    resolver: zodResolver(esquema),
    defaultValues: {
      nome: existente?.nome ?? '',
      antecedencia: String(existente?.antecedenciaDias ?? ANTECEDENCIA_PADRAO_DIAS),
      exigePdf: existente?.exigePdf ?? false,
    },
  })
  const salvar = useMutation({
    mutationFn: async (campos: Campos) => {
      const dados = {
        nome: campos.nome,
        antecedenciaDias: Number(campos.antecedencia),
        exigePdf: campos.exigePdf,
      }
      if (existente)
        await editarTipoDeVencimento(existente.id, { ...dados, ativo: existente.ativo })
      else await criarTipoDeVencimento(atual.consultoriaId, dados)
    },
    onSuccess: aoSalvar,
  })

  return (
    <Dialogo
      aberto
      aoMudar={(abrir) => {
        if (!abrir) aoFechar()
      }}
      titulo={existente ? `Editar ${existente.nome}` : 'Novo tipo de vencimento'}
      acoes={
        <>
          <Botao disabled={salvar.isPending} onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            type="submit"
            form="form-tipo-vencimento"
            aparencia="primario"
            disabled={salvar.isPending}
            aria-busy={salvar.isPending || undefined}
          >
            {salvar.isPending ? 'Salvando…' : 'Salvar tipo'}
          </Botao>
        </>
      }
    >
      <form
        id="form-tipo-vencimento"
        noValidate
        onSubmit={(evento) => {
          void handleSubmit((campos) => {
            salvar.mutate(campos)
          })(evento)
        }}
        className="flex flex-col gap-(--e-4)"
      >
        {salvar.isError ? (
          <MensagemSecao role="alert" tom="perigo">
            {mensagemDoErroDoVencimento(salvar.error)}
          </MensagemSecao>
        ) : null}
        <CampoTexto
          rotulo="Nome *"
          maxLength={60}
          autoComplete="off"
          disabled={salvar.isPending}
          erro={errors.nome?.message}
          {...register('nome')}
        />
        <CampoTexto
          rotulo="Antecedência em dias *"
          inputMode="numeric"
          maxLength={3}
          autoComplete="off"
          disabled={salvar.isPending}
          erro={errors.antecedencia?.message}
          {...register('antecedencia')}
        />
        <CaixaSelecao rotulo="Exige PDF" disabled={salvar.isPending} {...register('exigePdf')} />
      </form>
    </Dialogo>
  )
}
