// Ações do menu "…" no cabeçalho do empreendimento. A ação principal ("Cadastrar licença") fica
// na página. Função nova acrescenta UMA linha em ACOES: um link (`para`) ou um diálogo (`Dialogo`,
// num arquivo próprio). `somenteGestao` esconde a ação da Equipe (o banco decide de fato).
import { useQueryClient } from '@tanstack/react-query'
import { useState, type ComponentType } from 'react'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { DialogoGerarRelatorio } from '@/app/paginas/modelos/GerarRelatorio'
import { BotaoMais } from '@/components/ui/botao-mais'
import type { NomeIcone } from '@/components/ui/icone'
import type { Empreendimento, Unidade } from '@/lib/api/empreendimentos'

import { DialogoEmpreendimento } from './DialogoEmpreendimento'
import { DialogoUnidades } from './DialogoUnidades'

export interface ContextoDaAcao {
  empreendimento: Empreendimento
  unidades: readonly Unidade[]
}

export interface PropsDoDialogoDaAcao extends ContextoDaAcao {
  aberto: boolean
  aoMudar: (aberto: boolean) => void
}

type AcaoDoEmpreendimento = {
  id: string
  rotulo: string
  icone: NomeIcone
  somenteGestao?: boolean
} & (
  | { para: (contexto: ContextoDaAcao) => string; Dialogo?: never }
  | { Dialogo: ComponentType<PropsDoDialogoDaAcao>; para?: never }
)

function DialogoEditar({ empreendimento, aberto, aoMudar }: PropsDoDialogoDaAcao) {
  const { atual } = useConsultoria()
  const queryClient = useQueryClient()
  return (
    <DialogoEmpreendimento
      aberto={aberto}
      aoMudar={aoMudar}
      consultoriaId={atual.consultoriaId}
      existente={empreendimento}
      aoSalvar={() => {
        void queryClient.invalidateQueries({ queryKey: ['empreendimento', empreendimento.id] })
        void queryClient.invalidateQueries({ queryKey: ['empreendimentos'] })
      }}
    />
  )
}

function DialogoDasUnidades({ empreendimento, unidades, aberto, aoMudar }: PropsDoDialogoDaAcao) {
  return (
    <DialogoUnidades
      aberto={aberto}
      aoMudar={aoMudar}
      empreendimentoId={empreendimento.id}
      unidades={unidades}
    />
  )
}

function DialogoDoRelatorio({ empreendimento, aberto, aoMudar }: PropsDoDialogoDaAcao) {
  return (
    <DialogoGerarRelatorio
      empreendimentoId={empreendimento.id}
      empreendimentoNome={empreendimento.nome}
      aberto={aberto}
      aoMudar={aoMudar}
    />
  )
}

const ACOES: readonly AcaoDoEmpreendimento[] = [
  { id: 'editar', rotulo: 'Editar empreendimento', icone: 'pencil', Dialogo: DialogoEditar },
  {
    id: 'unidades',
    rotulo: 'Gerenciar unidades',
    icone: 'buildings',
    Dialogo: DialogoDasUnidades,
  },
  { id: 'relatorio', rotulo: 'Gerar relatório', icone: 'file-text', Dialogo: DialogoDoRelatorio },
  {
    id: 'triagem',
    rotulo: 'Triar atividades',
    icone: 'signpost',
    para: ({ empreendimento }) => `/triagem?empreendimento=${empreendimento.id}`,
  },
]

export function AcoesDoEmpreendimento({
  ehGestao,
  ...contexto
}: ContextoDaAcao & { ehGestao: boolean }) {
  const [aberta, setAberta] = useState<string | null>(null)
  const visiveis = ACOES.filter((acao) => !acao.somenteGestao || ehGestao)

  return (
    <>
      <BotaoMais
        itens={visiveis.map((acao) =>
          acao.para
            ? { chave: acao.id, rotulo: acao.rotulo, icone: acao.icone, para: acao.para(contexto) }
            : {
                chave: acao.id,
                rotulo: acao.rotulo,
                icone: acao.icone,
                aoEscolher: () => {
                  setAberta(acao.id)
                },
              },
        )}
      />
      {visiveis.map(({ id, Dialogo }) =>
        Dialogo ? (
          <Dialogo
            key={id}
            {...contexto}
            aberto={aberta === id}
            aoMudar={(aberto) => {
              setAberta(aberto ? id : null)
            }}
          />
        ) : null,
      )}
    </>
  )
}
