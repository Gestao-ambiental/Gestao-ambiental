// /configuracoes/modelos/:id (ADR-0036, fatia 1): editor do modelo. "novo" abre um modelo em
// branco, criado no primeiro Salvar com o id gerado aqui (repetir não duplica).
import { documentoVazio, problemaDoConteudo, type NoDoDocumento } from '@gestao-ambiental/domain'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Pagina } from '@/app/paginas/Pagina'
import { AvisoDeSaida } from '@/app/paginas/orcamentos/AvisoDeSaida'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { BotaoIcone } from '@/components/ui/botao-icone'
import { CampoTexto } from '@/components/ui/campo-texto'
import { Dialogo } from '@/components/ui/dialogo'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import {
  arquivarModeloDeDocumento,
  obterModeloDeDocumento,
  salvarModeloDeDocumento,
  type ModeloDeDocumento,
} from '@/lib/api/modelos-de-documento'
import { mensagemDoErro } from '@/lib/erros'

import { EditorDeModelo } from './EditorDeModelo'

export function PaginaModelo() {
  const { atual } = useConsultoria()
  const { id = 'novo' } = useParams()
  if (atual.papel !== 'gestao') {
    return (
      <Pagina titulo="Modelo de documento">
        <SemPermissao />
      </Pagina>
    )
  }
  if (id === 'novo') return <EdicaoDoModelo key="novo" modelo={null} />
  return <CarregarModelo id={id} />
}

function CarregarModelo({ id }: { id: string }) {
  const modelo = useQuery({
    queryKey: ['modelo-de-documento', id],
    queryFn: () => obterModeloDeDocumento(id),
  })
  if (modelo.isPending) {
    return (
      <Pagina titulo="Modelo de documento">
        <Carregando rotulo="Carregando modelo" />
      </Pagina>
    )
  }
  if (modelo.isError) {
    return (
      <Pagina titulo="Modelo de documento">
        <EstadoErro aoTentarDeNovo={() => void modelo.refetch()} />
      </Pagina>
    )
  }
  if (!modelo.data || modelo.data.arquivado) {
    return (
      <Pagina titulo="Modelo de documento">
        <EstadoVazio icone="file-text" titulo="Modelo não encontrado" />
      </Pagina>
    )
  }
  return <EdicaoDoModelo key={modelo.data.id} modelo={modelo.data} />
}

const PROBLEMAS = {
  formato: 'O texto do modelo não pôde ser lido. Recarregue a página.',
  grande_demais: 'O modelo passou do tamanho máximo. Divida em dois modelos.',
  campo_desconhecido: 'Há um campo que o Grama não reconhece. Remova-o e insira de novo.',
} as const

function EdicaoDoModelo({ modelo }: { modelo: ModeloDeDocumento | null }) {
  const { atual } = useConsultoria()
  const navegar = useNavigate()
  const queryClient = useQueryClient()
  const [id] = useState(() => modelo?.id ?? crypto.randomUUID())
  const [nome, setNome] = useState(modelo?.nome ?? '')
  const [rowVersion, setRowVersion] = useState<number | null>(modelo?.rowVersion ?? null)
  const [conteudoInicial] = useState<NoDoDocumento>(() => modelo?.conteudo ?? documentoVazio())
  const conteudo = useRef<NoDoDocumento>(conteudoInicial)
  const [sujo, setSujo] = useState(false)
  const sujoRef = useRef(false)
  const [erroNome, setErroNome] = useState<string | null>(null)
  const [falha, setFalha] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)
  const [arquivarAberto, setArquivarAberto] = useState(false)

  function marcarSujo(valor: boolean) {
    sujoRef.current = valor
    setSujo(valor)
    if (valor) setSalvo(false)
  }

  function invalidar() {
    void queryClient.invalidateQueries({ queryKey: ['modelos-de-documento', atual.consultoriaId] })
    void queryClient.invalidateQueries({ queryKey: ['modelo-de-documento', id] })
  }

  const salvar = useMutation({
    mutationFn: () =>
      salvarModeloDeDocumento({
        id,
        consultoriaId: atual.consultoriaId,
        nome,
        conteudo: conteudo.current,
        rowVersion,
      }),
    onSuccess: (versao) => {
      setRowVersion(versao)
      marcarSujo(false)
      setSalvo(true)
      invalidar()
      if (!modelo) void navegar(`/configuracoes/modelos/${id}`, { replace: true })
    },
    onError: (erro) => {
      setFalha(mensagemDoErro(erro))
    },
  })

  const duplicar = useMutation({
    mutationFn: async () => {
      const novoId = crypto.randomUUID()
      await salvarModeloDeDocumento({
        id: novoId,
        consultoriaId: atual.consultoriaId,
        nome: `${nome.trim()} (cópia)`.slice(0, 120),
        conteudo: conteudo.current,
        rowVersion: null,
      })
      return novoId
    },
    onSuccess: (novoId) => {
      invalidar()
      void navegar(`/configuracoes/modelos/${novoId}`)
    },
    onError: (erro) => {
      setFalha(mensagemDoErro(erro))
    },
  })

  const arquivar = useMutation({
    mutationFn: () => arquivarModeloDeDocumento(id, rowVersion ?? 0),
    onSuccess: () => {
      marcarSujo(false)
      invalidar()
      void navegar('/configuracoes/modelos', { replace: true })
    },
    onError: (erro) => {
      setArquivarAberto(false)
      setFalha(mensagemDoErro(erro))
    },
  })

  function aoSalvar() {
    setFalha(null)
    if (!nome.trim()) {
      setErroNome('Informe o nome')
      return
    }
    const problema = problemaDoConteudo(conteudo.current)
    if (problema) {
      setFalha(PROBLEMAS[problema])
      return
    }
    salvar.mutate()
  }

  const ocupado = salvar.isPending || duplicar.isPending || arquivar.isPending

  return (
    <Pagina titulo={modelo ? modelo.nome : 'Novo modelo'}>
      <div className="flex flex-col gap-(--e-4)">
        <div className="flex flex-wrap items-end gap-(--e-2)">
          <CampoTexto
            rotulo="Nome"
            value={nome}
            maxLength={120}
            erro={erroNome ?? undefined}
            className="min-w-[240px] flex-1"
            onChange={(e) => {
              setNome(e.target.value)
              setErroNome(null)
              marcarSujo(true)
            }}
          />
          <span role="status" className="corpo text-(--tinta-2)">
            {sujo ? 'Não salvo' : salvo ? 'Salvo' : ''}
          </span>
          {modelo ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <BotaoIcone icone="ellipsis" rotulo="Mais ações do modelo" aparencia="padrao" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={ocupado}
                  onSelect={() => {
                    duplicar.mutate()
                  }}
                >
                  Duplicar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={ocupado}
                  className="text-(--atraso-texto)"
                  onSelect={() => {
                    setArquivarAberto(true)
                  }}
                >
                  Arquivar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          <Botao aparencia="primario" disabled={ocupado} onClick={aoSalvar}>
            {salvar.isPending ? 'Salvando' : 'Salvar'}
          </Botao>
        </div>
        {falha ? (
          <MensagemSecao tom="perigo" role="alert">
            {falha}
          </MensagemSecao>
        ) : null}
        <EditorDeModelo
          conteudoInicial={conteudoInicial}
          aoMudar={(novo) => {
            conteudo.current = novo
            marcarSujo(true)
          }}
        />
      </div>
      <AvisoDeSaida
        bloquear={() => sujoRef.current}
        sujo={sujo}
        descricao="As alterações deste modelo não foram salvas."
      />
      <Dialogo
        aberto={arquivarAberto}
        aoMudar={setArquivarAberto}
        titulo="Arquivar modelo?"
        descricao={`"${modelo?.nome ?? ''}" sai da lista de modelos. Os relatórios já gerados não mudam.`}
        acoes={
          <>
            <Botao
              onClick={() => {
                setArquivarAberto(false)
              }}
            >
              Cancelar
            </Botao>
            <Botao
              aparencia="perigo"
              disabled={arquivar.isPending}
              onClick={() => {
                arquivar.mutate()
              }}
            >
              Arquivar
            </Botao>
          </>
        }
      />
    </Pagina>
  )
}
