// /configuracoes/importar/nova (ADR-0043): escolher Empreendimentos ou Licenças, o arquivo (lido
// no Web Worker, CPF descartado lá dentro), as colunas (lembra o último mapeamento) e mandar
// conferir. Nada toca as tabelas reais antes de "Importar" na tela da importação.
import {
  CAMPOS_DA_IMPORTACAO,
  TAMANHO_MAXIMO_DO_ARQUIVO,
  faltamObrigatorios,
  mapearCabecalhos,
  montarDadosDaLinha,
  tirarCpfDoTexto,
  type EntidadeDaImportacao,
  type MapeamentoDeColunas,
} from '@gestao-ambiental/domain'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { PaginaDeConfiguracoes } from '@/app/paginas/configuracoes/PaginaDeConfiguracoes'
import { Carregando, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { BotaoMais } from '@/components/ui/botao-mais'
import { classeCampo } from '@/components/ui/estilos-campo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Segmentado } from '@/components/ui/segmentado'
import { Selo } from '@/components/ui/selo'
import {
  conferirImportacao,
  criarImportacao,
  enviarTodasAsLinhas,
  obterMapeamentoLembrado,
} from '@/lib/api/importacao'
import { ehSemPermissao, mensagemDoErroDaImportacao } from '@/lib/erros'

import type { AbaLida, ErroDaLeitura } from './ler-planilha'
import { lerArquivoNoWorker } from './ler-no-worker'
import { baixarArquivo, plural, ROTULO_DA_ENTIDADE } from './pecas'

const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const MENSAGEM_DA_LEITURA: Record<ErroDaLeitura, string> = {
  formato_nao_aceito: 'Envie um arquivo .xlsx ou .csv.',
  arquivo_grande: 'O arquivo passa de 5 MB.',
  linhas_demais: 'Use até 1.000 linhas por planilha.',
  arquivo_ilegivel: 'Não foi possível ler o arquivo.',
  sem_linhas: 'A planilha não tem linhas abaixo do cabeçalho.',
}

type Leitura =
  | { estado: 'nada' }
  | { estado: 'lendo'; nome: string }
  | { estado: 'erro'; nome: string; erro: ErroDaLeitura }
  | { estado: 'lida'; nome: string; abas: AbaLida[] }

export function PaginaNovaImportacao() {
  const { atual } = useConsultoria()
  if (atual.papel !== 'gestao') {
    return (
      <PaginaDeConfiguracoes>
        <SemPermissao descricao="Só a gestão da consultoria importa planilhas." />
      </PaginaDeConfiguracoes>
    )
  }
  return <NovaImportacao />
}

function NovaImportacao() {
  const { atual } = useConsultoria()
  const cid = atual.consultoriaId
  const navegar = useNavigate()
  const queryClient = useQueryClient()
  const [parametros] = useSearchParams()
  const [entidade, setEntidade] = useState<EntidadeDaImportacao>(
    parametros.get('entidade') === 'licenca' ? 'licenca' : 'empreendimento',
  )
  const [leitura, setLeitura] = useState<Leitura>({ estado: 'nada' })
  const [indiceDaAba, setIndiceDaAba] = useState(0)
  const [editado, setEditado] = useState<MapeamentoDeColunas | null>(null)
  const [tentou, setTentou] = useState(false)
  const [enviadas, setEnviadas] = useState<number | null>(null)
  // Um id por tentativa: repetir o envio do mesmo arquivo cai na mesma importação (idempotente).
  const [idDaImportacao, setIdDaImportacao] = useState(() => crypto.randomUUID())
  const entrada = useRef<HTMLInputElement>(null)
  const idBase = useId()

  const memoria = useQuery({
    queryKey: ['importacao-mapeamento', cid, entidade],
    queryFn: () => obterMapeamentoLembrado(cid, entidade),
  })

  const aba = leitura.estado === 'lida' ? (leitura.abas[indiceDaAba] ?? leitura.abas[0]) : null
  const mapeamento: MapeamentoDeColunas =
    editado ?? (aba ? mapearCabecalhos(aba.tabela.cabecalhos, entidade, memoria.data) : {})
  const faltam = faltamObrigatorios(mapeamento, entidade)

  const conferir = useMutation({
    mutationFn: async () => {
      if (!aba || leitura.estado !== 'lida') throw new Error('sem_arquivo')
      const linhas = aba.tabela.linhas.map((linha) => ({
        numeroLinha: linha.numeroLinha,
        dados: montarDadosDaLinha(entidade, mapeamento, aba.tabela.cabecalhos, linha),
      }))
      const id = await criarImportacao({
        id: idDaImportacao,
        consultoriaId: cid,
        entidade,
        // O nome do arquivo também sai do aparelho: sem CPF.
        nomeArquivo: (tirarCpfDoTexto(leitura.nome) || 'planilha').slice(0, 255),
        totalLinhas: linhas.length,
        mapeamento,
      })
      setEnviadas(0)
      await enviarTodasAsLinhas(id, linhas, setEnviadas)
      await conferirImportacao(id)
      return id
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ['importacoes'] })
      await queryClient.invalidateQueries({ queryKey: ['importacao-mapeamento'] })
      void navegar(`/configuracoes/importar/${id}`)
    },
    onSettled: () => {
      setEnviadas(null)
    },
  })

  /** Começo novo: outro arquivo, outra aba ou outra entidade. */
  function recomecar() {
    setEditado(null)
    setTentou(false)
    setIdDaImportacao(crypto.randomUUID())
    conferir.reset()
  }

  async function escolher(arquivo: File) {
    recomecar()
    setIndiceDaAba(0)
    if (arquivo.size > TAMANHO_MAXIMO_DO_ARQUIVO) {
      setLeitura({ estado: 'erro', nome: arquivo.name, erro: 'arquivo_grande' })
      return
    }
    setLeitura({ estado: 'lendo', nome: arquivo.name })
    try {
      const resultado = await lerArquivoNoWorker(arquivo)
      setLeitura(
        resultado.ok
          ? { estado: 'lida', nome: arquivo.name, abas: resultado.abas }
          : { estado: 'erro', nome: arquivo.name, erro: resultado.erro },
      )
    } catch {
      setLeitura({ estado: 'erro', nome: arquivo.name, erro: 'arquivo_ilegivel' })
    }
  }

  async function baixarModelo() {
    const { gerarModeloDaPlanilha, nomeDoModelo } = await import('./modelo-da-planilha')
    baixarArquivo(
      new Blob([gerarModeloDaPlanilha(entidade)], { type: TIPO_XLSX }),
      nomeDoModelo(entidade),
    )
  }

  function abrirSeletor() {
    entrada.current?.click()
  }

  function mandarConferir() {
    setTentou(true)
    if (faltam.length > 0 || conferir.isPending) return
    conferir.mutate()
  }

  const total = aba?.tabela.linhas.length ?? 0
  const botaoEscolher = (
    <Botao aparencia="primario" iconeAntes="upload" onClick={abrirSeletor}>
      Escolher arquivo
    </Botao>
  )
  const acao = (
    <>
      <BotaoMais
        itens={[
          {
            rotulo: 'Baixar modelo',
            icone: 'download',
            aoEscolher: () => {
              void baixarModelo()
            },
          },
        ]}
      />
      {aba ? (
        <Botao aparencia="primario" disabled={conferir.isPending} onClick={mandarConferir}>
          {`Conferir ${plural(total, 'linha', 'linhas')}`}
        </Botao>
      ) : leitura.estado === 'nada' ? null : (
        botaoEscolher
      )}
    </>
  )

  let corpo
  if (leitura.estado === 'nada') {
    corpo = (
      <EstadoVazio icone="upload" titulo="Nenhum arquivo escolhido" acaoPrincipal={botaoEscolher} />
    )
  } else if (leitura.estado === 'lendo') {
    corpo = <Carregando rotulo="Lendo o arquivo" linhas={3} />
  } else if (leitura.estado === 'erro') {
    corpo = (
      <MensagemSecao role="alert" tom="perigo" titulo={MENSAGEM_DA_LEITURA[leitura.erro]}>
        {leitura.nome}
      </MensagemSecao>
    )
  } else if (aba) {
    corpo = (
      <div className="flex flex-col gap-(--e-5)">
        <div className="flex flex-wrap items-center gap-x-(--e-4) gap-y-(--e-2)">
          <span className="min-w-0 truncate corpo-medio">{leitura.nome}</span>
          <span className="rotulo numero text-(--tinta-2)">{plural(total, 'linha', 'linhas')}</span>
          <Botao tamanho="compacto" aparencia="sutil" onClick={abrirSeletor}>
            Trocar arquivo
          </Botao>
        </div>

        {leitura.abas.length > 1 ? (
          <label className="flex max-w-[360px] flex-col gap-(--e-1)">
            <span className="rotulo text-(--tinta)">Aba da planilha</span>
            <select
              className={classeCampo}
              value={indiceDaAba}
              onChange={(evento) => {
                setIndiceDaAba(Number(evento.target.value))
                recomecar()
              }}
            >
              {leitura.abas.map((a, i) => (
                <option key={a.nome} value={i}>
                  {a.nome}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {aba.descartadas.length > 0 ? (
          <section aria-labelledby={`${idBase}-descartadas`} className="flex flex-col gap-(--e-2)">
            <h2 id={`${idBase}-descartadas`} className="titulo-secao">
              Colunas com CPF
            </h2>
            <ul className="flex flex-col gap-(--e-1)">
              {aba.descartadas.map((nome) => (
                <li key={nome} className="flex items-center gap-(--e-3)">
                  <span className="corpo">{nome}</span>
                  <Selo tom="perigo">Descartada</Selo>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-labelledby={`${idBase}-colunas`} className="flex flex-col gap-(--e-3)">
          <h2 id={`${idBase}-colunas`} className="titulo-secao">
            Colunas
          </h2>
          <div className="grid gap-(--e-4) md:grid-cols-2 xl:grid-cols-3">
            {CAMPOS_DA_IMPORTACAO[entidade].map(({ campo, rotulo, obrigatorio }) => {
              const id = `${idBase}-${campo}`
              const comErro = tentou && faltam.includes(campo)
              return (
                <div key={campo} className="flex flex-col gap-(--e-1)">
                  <label htmlFor={id} className="rotulo text-(--tinta)">
                    {rotulo}
                    {obrigatorio ? (
                      <span aria-hidden="true" className="text-(--atraso-texto)">
                        {' '}
                        *
                      </span>
                    ) : null}
                  </label>
                  <select
                    id={id}
                    className={classeCampo}
                    required={obrigatorio}
                    aria-invalid={comErro ? true : undefined}
                    aria-describedby={comErro ? `${id}-erro` : undefined}
                    value={mapeamento[campo] ?? ''}
                    onChange={(evento) => {
                      const valor = evento.target.value
                      // Cada coluna serve a um campo só.
                      const novo = Object.fromEntries(
                        Object.entries(mapeamento).filter(
                          ([outro, cabecalho]) =>
                            outro !== campo && (valor === '' || cabecalho !== valor),
                        ),
                      ) as MapeamentoDeColunas
                      if (valor) novo[campo] = valor
                      setEditado(novo)
                    }}
                  >
                    <option value="">Nenhuma</option>
                    {aba.tabela.cabecalhos.map((cabecalho) => (
                      <option key={cabecalho} value={cabecalho}>
                        {cabecalho}
                      </option>
                    ))}
                  </select>
                  {comErro ? (
                    <span id={`${id}-erro`} className="text-xs text-(--atraso-texto)">
                      Escolha a coluna
                    </span>
                  ) : null}
                </div>
              )
            })}
          </div>
        </section>

        {conferir.isPending ? (
          <p role="status" className="corpo text-(--tinta-2)">
            {enviadas === null
              ? 'Preparando'
              : enviadas < total
                ? `Enviando ${enviadas.toLocaleString('pt-BR')} de ${plural(total, 'linha', 'linhas')}`
                : 'Conferindo'}
          </p>
        ) : null}
        {conferir.isError ? (
          ehSemPermissao(conferir.error) ? (
            <SemPermissao />
          ) : (
            <MensagemSecao
              role="alert"
              tom="perigo"
              titulo={mensagemDoErroDaImportacao(conferir.error)}
            />
          )
        ) : null}
      </div>
    )
  }

  return (
    <PaginaDeConfiguracoes acao={acao}>
      <div className="flex flex-col gap-(--e-5) rounded-(--raio-painel) border bg-(--folha) p-(--e-4) md:p-(--e-6)">
        <Segmentado
          rotulo="O que importar"
          opcoes={(['empreendimento', 'licenca'] as const).map((valor) => ({
            valor,
            rotulo: ROTULO_DA_ENTIDADE[valor],
          }))}
          valor={entidade}
          aoMudar={(valor) => {
            setEntidade(valor)
            recomecar()
          }}
          desabilitado={conferir.isPending}
          larguraTotalNoCelular
          className="self-start"
        />
        <input
          ref={entrada}
          type="file"
          accept=".xlsx,.csv"
          aria-label="Arquivo da planilha"
          tabIndex={-1}
          className="sr-only"
          onChange={(evento) => {
            const arquivo = evento.target.files?.[0]
            // Limpa a escolha: escolher o mesmo arquivo de novo também dispara.
            evento.target.value = ''
            if (arquivo) void escolher(arquivo)
          }}
        />
        {corpo}
      </div>
    </PaginaDeConfiguracoes>
  )
}
