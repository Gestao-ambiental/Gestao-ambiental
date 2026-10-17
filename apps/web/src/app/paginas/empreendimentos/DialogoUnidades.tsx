import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { Botao } from '@/components/ui/botao'
import { CampoTexto } from '@/components/ui/campo-texto'
import { Dialogo } from '@/components/ui/dialogo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { criarUnidade, editarUnidade, type Unidade } from '@/lib/api/empreendimentos'
import { mensagemDoErro } from '@/lib/erros'

const esquema = z.object({
  nome: z.string().trim().min(1, 'Informe o nome da unidade'),
  endereco: z.string(),
})
type Dados = z.infer<typeof esquema>

/** Formulário de uma unidade, dentro da lista (adicionar ou editar). */
function FormUnidade({
  empreendimentoId,
  unidade,
  aoTerminar,
}: {
  empreendimentoId: string
  unidade?: Unidade
  aoTerminar: () => void
}) {
  const queryClient = useQueryClient()
  // Id gerado aqui: repetir depois de erro de rede não cria outra unidade.
  const [id] = useState(() => crypto.randomUUID())
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Dados>({
    resolver: zodResolver(esquema),
    defaultValues: { nome: unidade?.nome ?? '', endereco: unidade?.endereco ?? '' },
  })

  const salvar = useMutation({
    mutationFn: async ({ nome, endereco }: Dados) => {
      if (unidade) await editarUnidade(unidade.id, nome, endereco)
      else await criarUnidade(id, empreendimentoId, nome, endereco)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['unidades', empreendimentoId] })
      await queryClient.invalidateQueries({ queryKey: ['empreendimentos'] })
      aoTerminar()
    },
  })

  const titulo = unidade ? `Editar ${unidade.nome}` : 'Nova unidade'

  return (
    <form
      noValidate
      aria-label={titulo}
      onSubmit={(evento) =>
        void handleSubmit((dados) => {
          salvar.mutate(dados)
        })(evento)
      }
      className="flex flex-col gap-(--space-150) rounded-(--radius) border p-(--space-150)"
    >
      {salvar.isError ? (
        <MensagemSecao role="alert" tom="perigo">
          {mensagemDoErro(salvar.error)}
        </MensagemSecao>
      ) : null}
      <CampoTexto
        rotulo="Nome da unidade"
        placeholder="Matriz, Filial Distrito Industrial…"
        disabled={salvar.isPending}
        erro={errors.nome?.message}
        {...register('nome')}
      />
      <CampoTexto
        rotulo="Endereço"
        autoComplete="street-address"
        disabled={salvar.isPending}
        {...register('endereco')}
      />
      <div className="flex justify-end gap-(--space-100)">
        <Botao tamanho="compacto" disabled={salvar.isPending} onClick={aoTerminar}>
          Cancelar
        </Botao>
        <Botao tamanho="compacto" type="submit" aparencia="primario" disabled={salvar.isPending}>
          {salvar.isPending ? 'Salvando…' : 'Salvar unidade'}
        </Botao>
      </div>
    </form>
  )
}

/**
 * Modal "Unidades" (Protótipo 09, "Gerenciar unidades"; EMP-01). Filiais são unidades do mesmo
 * empreendimento; o filtro rápido da tela usa esta mesma lista.
 */
export function DialogoUnidades({
  aberto,
  aoMudar,
  empreendimentoId,
  unidades,
}: {
  aberto: boolean
  aoMudar: (aberto: boolean) => void
  empreendimentoId: string
  unidades: readonly Unidade[]
}) {
  // 'nova' ou o id da unidade em edição; uma de cada vez.
  const [editando, setEditando] = useState<string | null>(null)

  return (
    <Dialogo
      aberto={aberto}
      aoMudar={(valor) => {
        if (!valor) setEditando(null)
        aoMudar(valor)
      }}
      titulo="Unidades"
      largura={560}
      descricao="Filiais são unidades do mesmo empreendimento. Cada item pertence a uma unidade."
      acoes={
        <Botao
          onClick={() => {
            aoMudar(false)
          }}
        >
          Fechar
        </Botao>
      }
    >
      {unidades.length === 0 && editando !== 'nova' ? (
        <p className="text-(--text-subtle)">Nenhuma unidade cadastrada.</p>
      ) : null}
      <ul className="flex flex-col" aria-label="Unidades do empreendimento">
        {unidades.map((unidade) =>
          editando === unidade.id ? (
            <li key={unidade.id} className="py-(--space-100)">
              <FormUnidade
                empreendimentoId={empreendimentoId}
                unidade={unidade}
                aoTerminar={() => {
                  setEditando(null)
                }}
              />
            </li>
          ) : (
            <li
              key={unidade.id}
              className="flex items-center gap-(--space-100) border-b py-(--space-100) last:border-b-0"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate corpo-medio">{unidade.nome}</span>
                <span
                  className={
                    unidade.endereco
                      ? 'truncate text-xs text-(--text-subtle)'
                      : 'text-xs text-(--text-subtlest)'
                  }
                >
                  {unidade.endereco ?? 'Endereço não informado'}
                </span>
              </span>
              <Botao
                tamanho="compacto"
                aparencia="sutil"
                disabled={editando !== null}
                aria-label={`Editar ${unidade.nome}`}
                onClick={() => {
                  setEditando(unidade.id)
                }}
              >
                Editar
              </Botao>
            </li>
          ),
        )}
      </ul>
      {editando === 'nova' ? (
        <FormUnidade
          empreendimentoId={empreendimentoId}
          aoTerminar={() => {
            setEditando(null)
          }}
        />
      ) : (
        <div>
          <Botao
            iconeAntes="plus"
            disabled={editando !== null}
            onClick={() => {
              setEditando('nova')
            }}
          >
            Adicionar unidade
          </Botao>
        </div>
      )}
    </Dialogo>
  )
}
