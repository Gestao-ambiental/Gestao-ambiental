// /relatorios/:id (ADR-0040): o relatório escrito no Grama. Quem escreve edita e envia para revisão;
// quem confere corrige no mesmo texto e devolve ou aprova. A IA aponta trechos sublinhados no texto,
// com "Aplicar sugestão" e "Ignorar"; ela não bloqueia nada. O Word é só a saída (Exportar .docx).
import { nomeDoArquivoDoRelatorio, type NoDoDocumento } from '@gestao-ambiental/domain'
import type { Editor } from '@tiptap/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router'

import { Pagina } from '@/app/paginas/Pagina'
import { EditorDeModelo } from '@/app/paginas/modelos/EditorDeModelo'
import { AvisoDeSaida } from '@/components/aviso-de-saida'
import { Carregando, EstadoErro, EstadoVazio } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { BotaoIcone } from '@/components/ui/botao-icone'
import { CampoTexto } from '@/components/ui/campo-texto'
import { Dialogo } from '@/components/ui/dialogo'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Selo, type TomSelo } from '@/components/ui/selo'
import { pedirConferenciaIa } from '@/lib/api/conferencia-ia'
import {
  aprovarRelatorio,
  devolverRelatorio,
  enviarRelatorio,
  obterRelatorio,
  permissoesDoRelatorio,
  ROTULO_DA_SITUACAO,
  salvarRelatorio,
  type Relatorio,
  type SituacaoDoRelatorio,
} from '@/lib/api/relatorios'
import { mensagemDoErro } from '@/lib/erros'

import { sublinhadoDaIa } from './apontamentos-no-texto'
import { ColunaDaConferencia } from './ColunaDaConferencia'

const TOM: Record<SituacaoDoRelatorio, TomSelo> = {
  rascunho: 'padrao',
  em_revisao: 'revisao',
  devolvido: 'perigo',
  aprovado: 'sucesso',
}

export function PaginaRelatorio() {
  const { id = '' } = useParams()
  const relatorio = useQuery({ queryKey: ['relatorio', id], queryFn: () => obterRelatorio(id) })
  const permissoes = useQuery({
    queryKey: ['relatorio', id, 'permissoes'],
    queryFn: () => permissoesDoRelatorio(id),
    enabled: Boolean(relatorio.data),
  })

  if (relatorio.isPending || (relatorio.data && permissoes.isPending)) {
    return (
      <Pagina titulo="Relatório">
        <Carregando rotulo="Carregando relatório" />
      </Pagina>
    )
  }
  if (relatorio.isError || permissoes.isError) {
    return (
      <Pagina titulo="Relatório">
        <EstadoErro
          aoTentarDeNovo={() => {
            void relatorio.refetch()
            void permissoes.refetch()
          }}
        />
      </Pagina>
    )
  }
  if (!relatorio.data || !permissoes.data) {
    return (
      <Pagina titulo="Relatório">
        <EstadoVazio icone="file-text" titulo="Relatório não encontrado" />
      </Pagina>
    )
  }
  return (
    <EdicaoDoRelatorio
      key={`${relatorio.data.id}:${relatorio.data.situacao}`}
      relatorio={relatorio.data}
      podeEditar={permissoes.data.podeEditar}
      podeRevisar={permissoes.data.podeRevisar}
    />
  )
}

function EdicaoDoRelatorio({
  relatorio,
  podeEditar,
  podeRevisar,
}: {
  relatorio: Relatorio
  podeEditar: boolean
  podeRevisar: boolean
}) {
  const queryClient = useQueryClient()
  const [titulo, setTitulo] = useState(relatorio.titulo)
  const [conteudoInicial] = useState<NoDoDocumento>(relatorio.conteudo)
  const conteudo = useRef<NoDoDocumento>(relatorio.conteudo)
  const rowVersion = useRef(relatorio.rowVersion)
  const [sujo, setSujo] = useState(false)
  const sujoRef = useRef(false)
  const [falha, setFalha] = useState<string | null>(null)
  const [devolvendo, setDevolvendo] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [erroMotivo, setErroMotivo] = useState<string | null>(null)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [ativo, setAtivo] = useState<number | null>(null)

  const marcarSujo = useCallback((valor: boolean) => {
    sujoRef.current = valor
    setSujo(valor)
  }, [])

  const extensoes = useMemo(() => [sublinhadoDaIa(setAtivo)], [])
  useEffect(() => {
    rowVersion.current = relatorio.rowVersion
  }, [relatorio.rowVersion])

  async function atualizar() {
    await queryClient.invalidateQueries({ queryKey: ['relatorio', relatorio.id] })
    await queryClient.invalidateQueries({ queryKey: ['relatorios'] })
  }

  /** Salva o que está na tela (sem versão nova quando nada mudou) e devolve a versão atual. */
  async function salvarAgora(): Promise<number> {
    if (!sujoRef.current) return relatorio.versao
    rowVersion.current = await salvarRelatorio(
      relatorio.id,
      titulo,
      conteudo.current,
      rowVersion.current,
    )
    marcarSujo(false)
    const atual = await obterRelatorio(relatorio.id)
    queryClient.setQueryData(['relatorio', relatorio.id], atual)
    if (atual) rowVersion.current = atual.rowVersion
    return atual?.versao ?? relatorio.versao
  }

  const salvar = useMutation({
    mutationFn: salvarAgora,
    onSuccess: () => {
      setFalha(null)
    },
    onError: (erro) => {
      setFalha(mensagemDoErro(erro))
    },
  })

  const conferir = useMutation({
    mutationFn: async () => {
      const versao = await salvarAgora()
      await pedirConferenciaIa({ relatorioId: relatorio.id, versao })
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ['relatorio', relatorio.id, 'conferencia'] }),
    onError: (erro) => {
      setFalha(mensagemDoErro(erro))
    },
  })

  const decidir = useMutation({
    mutationFn: async (acao: 'enviar' | 'aprovar' | 'devolver') => {
      const versao = await salvarAgora()
      if (acao === 'enviar') {
        await enviarRelatorio(relatorio.id, rowVersion.current)
        // A IA confere a versão enviada; falha dela não impede o envio.
        void pedirConferenciaIa({ relatorioId: relatorio.id, versao })
          .catch(() => undefined)
          .finally(() => {
            void queryClient.invalidateQueries({
              queryKey: ['relatorio', relatorio.id, 'conferencia'],
            })
          })
      } else if (acao === 'aprovar') {
        await aprovarRelatorio(relatorio.id, rowVersion.current)
      } else {
        await devolverRelatorio(relatorio.id, motivo, rowVersion.current)
      }
    },
    onSuccess: async () => {
      setDevolvendo(false)
      setFalha(null)
      await atualizar()
    },
    onError: (erro) => {
      setFalha(mensagemDoErro(erro))
    },
  })

  const exportar = useMutation({
    mutationFn: async () => {
      const word = await import('@/lib/docx-do-modelo')
      const arquivo = await word.gerarDocx(conteudo.current)
      word.baixarArquivo(arquivo, nomeDoArquivoDoRelatorio(titulo, relatorio.empreendimentoNome))
    },
    onError: (erro) => {
      setFalha(mensagemDoErro(erro))
    },
  })

  const ocupado = salvar.isPending || conferir.isPending || decidir.isPending
  const comoAutor = podeEditar && !podeRevisar
  const voltar = relatorio.ocorrenciaId
    ? { para: `/ocorrencias/${relatorio.ocorrenciaId}`, rotulo: 'Voltar à ocorrência' }
    : { para: `/empreendimentos/${relatorio.empreendimentoId}`, rotulo: 'Voltar ao empreendimento' }

  const principal = podeRevisar ? (
    <Botao
      aparencia="primario"
      iconeAntes="check"
      disabled={ocupado}
      onClick={() => {
        decidir.mutate('aprovar')
      }}
    >
      Aprovar
    </Botao>
  ) : comoAutor ? (
    <Botao
      aparencia="primario"
      iconeAntes="send"
      disabled={ocupado}
      onClick={() => {
        decidir.mutate('enviar')
      }}
    >
      {decidir.isPending ? 'Enviando' : 'Enviar para revisão'}
    </Botao>
  ) : relatorio.situacao === 'aprovado' ? (
    <Botao
      aparencia="primario"
      iconeAntes="download"
      disabled={exportar.isPending}
      onClick={() => {
        exportar.mutate()
      }}
    >
      Exportar .docx
    </Botao>
  ) : null

  return (
    <Pagina
      titulo={titulo || 'Relatório'}
      voltar={voltar}
      meta={
        <span className="flex flex-wrap items-center gap-x-(--e-2) gap-y-(--e-1)">
          <Selo tom={TOM[relatorio.situacao]}>{ROTULO_DA_SITUACAO[relatorio.situacao]}</Selo>
          <span className="corpo text-(--tinta-2)">{relatorio.empreendimentoNome}</span>
          <span className="corpo text-(--tinta-2) numero">versão {relatorio.versao}</span>
          {podeEditar ? (
            <span
              role="status"
              className={sujo ? 'corpo-medio text-(--alerta-texto)' : 'corpo text-(--tinta-2)'}
            >
              {sujo ? 'Não salvo' : 'Salvo'}
            </span>
          ) : null}
        </span>
      }
      acao={
        <>
          {podeEditar ? (
            <Botao
              disabled={ocupado || !sujo}
              onClick={() => {
                salvar.mutate()
              }}
            >
              {salvar.isPending ? 'Salvando' : 'Salvar'}
            </Botao>
          ) : null}
          {podeRevisar ? (
            <Botao
              disabled={ocupado}
              onClick={() => {
                setDevolvendo(true)
              }}
            >
              Devolver
            </Botao>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <BotaoIcone icone="ellipsis" rotulo="Mais ações do relatório" aparencia="padrao" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={exportar.isPending}
                onSelect={() => {
                  exportar.mutate()
                }}
              >
                Exportar .docx
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {principal}
        </>
      }
    >
      <div className="flex flex-col gap-(--e-4)">
        {relatorio.situacao === 'devolvido' && relatorio.motivoDevolucao ? (
          <MensagemSecao
            tom="atencao"
            titulo={`Devolvido${relatorio.revisorNome ? ` por ${relatorio.revisorNome}` : ''}`}
          >
            {relatorio.motivoDevolucao}
          </MensagemSecao>
        ) : null}
        {falha ? (
          <MensagemSecao tom="perigo" role="alert">
            {falha}
          </MensagemSecao>
        ) : null}
        {podeEditar ? (
          <CampoTexto
            rotulo="Título"
            value={titulo}
            maxLength={200}
            className="max-w-[640px]"
            onChange={(e) => {
              setTitulo(e.target.value)
              marcarSujo(true)
            }}
          />
        ) : null}
        <div className="flex flex-col gap-(--e-6) lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            <EditorDeModelo
              conteudoInicial={conteudoInicial}
              rotulo="Texto do relatório"
              comCampos={false}
              somenteLeitura={!podeEditar}
              extensoesExtras={extensoes}
              aoCriar={setEditor}
              aoMudar={(novo) => {
                conteudo.current = novo
                marcarSujo(true)
              }}
            />
          </div>
          <ColunaDaConferencia
            relatorio={relatorio}
            editor={editor}
            podeEditar={podeEditar}
            podeRevisar={podeRevisar}
            ativo={ativo}
            aoEscolher={setAtivo}
            conferindo={conferir.isPending}
            aoConferir={() => {
              conferir.mutate()
            }}
            aoAplicar={() => {
              marcarSujo(true)
              conteudo.current = (editor?.getJSON() ?? conteudo.current) as NoDoDocumento
            }}
          />
        </div>
      </div>

      <AvisoDeSaida
        bloquear={() => sujoRef.current}
        sujo={sujo}
        descricao="As alterações deste relatório não foram salvas."
      />
      <Dialogo
        aberto={devolvendo}
        aoMudar={setDevolvendo}
        titulo="Devolver para correção"
        acoes={
          <>
            <Botao
              onClick={() => {
                setDevolvendo(false)
              }}
            >
              Cancelar
            </Botao>
            <Botao
              aparencia="perigo"
              disabled={decidir.isPending}
              onClick={() => {
                if (!motivo.trim()) {
                  setErroMotivo('Informe o motivo')
                  return
                }
                decidir.mutate('devolver')
              }}
            >
              Devolver
            </Botao>
          </>
        }
      >
        <CampoTexto
          rotulo="Motivo"
          value={motivo}
          erro={erroMotivo ?? undefined}
          onChange={(evento) => {
            setMotivo(evento.target.value)
            setErroMotivo(null)
          }}
        />
      </Dialogo>
    </Pagina>
  )
}
