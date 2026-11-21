import {
  impedimentoDoVinculo,
  rotuloDaFormacaoDaPessoa,
  rotuloDaProfissaoDaPessoa,
  situacaoDoConvite,
  type CodigoCargo,
  type CodigoProfissao,
} from '@gestao-ambiental/domain'
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

import { CHAVE_MEUS_VINCULOS, useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { NOMES_PAPEL } from '@/app/papeis'
import { PaginaDeConfiguracoes } from '@/app/paginas/configuracoes/PaginaDeConfiguracoes'
import { Carregando, EstadoErro, SemPermissao } from '@/components/estados'
import { Avatar } from '@/components/ui/avatar'
import { Botao } from '@/components/ui/botao'
import { Dialogo } from '@/components/ui/dialogo'
import { BotaoMais } from '@/components/ui/botao-mais'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Selo } from '@/components/ui/selo'
import {
  TAMANHO_PAGINA,
  alterarPapel,
  definirPermissaoFinanceira,
  cancelarConvite,
  desligarMembro,
  enviarEmailDoConvite,
  listarConvitesPendentes,
  listarMembros,
  reenviarConvite,
  type ConvitePendente,
  type Membro,
} from '@/lib/api/acesso'
import { definirProfissaoECargo } from '@/lib/api/perfil'
import { formatarInstanteComoData } from '@/lib/datas'
import { ehSemPermissao, mensagemDoErro } from '@/lib/erros'

import { AcessosDoSuporte } from '@/app/suporte/AcessosDoSuporte'

import { CamposProfissaoECargo } from './CamposProfissaoECargo'
import { DialogoConvidar, type ResultadoConvite } from './DialogoConvidar'
import { RegistrosAConfirmar } from './RegistrosAConfirmar'

const MOTIVO_ULTIMA_GESTAO = 'A consultoria precisa de pelo menos uma pessoa na Gestão.'

type Aviso = { tom: 'sucesso' | 'atencao' | 'perigo'; texto: string } | null

interface PaginaDeDados<T> {
  itens: T[]
  total: number
}

function proximaPagina<T>(ultima: PaginaDeDados<T>, todas: PaginaDeDados<T>[]): number | undefined {
  const carregados = todas.reduce((soma, pagina) => soma + pagina.itens.length, 0)
  return carregados < ultima.total && ultima.itens.length === TAMANHO_PAGINA
    ? todas.length
    : undefined
}

function achatar<T>(dados: InfiniteData<PaginaDeDados<T>> | undefined): {
  itens: T[]
  total: number
} {
  const paginas = dados?.pages ?? []
  return { itens: paginas.flatMap((p) => p.itens), total: paginas[0]?.total ?? 0 }
}

function TituloSecao({ id, children, total }: { id: string; children: ReactNode; total?: number }) {
  return (
    <div className="flex items-center gap-(--e-2)">
      <h2 id={id} className="titulo-secao text-(--tinta)">
        {children}
      </h2>
      {total === undefined ? null : (
        <span className="min-w-6 rounded-(--raio-mini) bg-(--aperto) px-(--e-1) text-center text-xs font-semibold text-(--tinta-2) numero">
          {total}
        </span>
      )}
    </div>
  )
}

// Quadro (DESIGN.md): painel com regra de 1px, cabeçalho em maiúsculas, linhas de 48px.
const classePainel = 'rounded-(--raio-painel) border bg-(--folha)'
const classeTabela = 'w-full border-collapse corpo'
const classeCabecalho =
  'h-10 border-b px-(--e-3) text-left rotulo-maiusculo whitespace-nowrap text-(--tinta-2)'
const classeCelula = 'h-(--linha) border-b border-(--regra-leve) px-(--e-3) align-middle'
const classeLinha = 'transicao-estado hover:bg-(--toque) last:[&>td]:border-b-0'
const classeItemCelular =
  'flex items-center gap-(--e-3) border-b border-(--regra-leve) px-(--e-4) py-(--e-3) last:border-b-0'

/**
 * /configuracoes/equipe (Protótipo 07; ACC-02, ACC-03). Só a Gestão administra: membros com
 * papel e desligamento, convites pendentes com reenviar e cancelar. A Equipe vê "sem permissão"
 * (o banco recusaria de qualquer forma).
 */
const MOTIVO_ULTIMO_FINANCEIRO =
  'A consultoria precisa de pelo menos uma pessoa com acesso ao dinheiro.'

export function PaginaEquipe() {
  const { atual } = useConsultoria()
  if (atual.papel !== 'gestao') {
    return (
      <PaginaDeConfiguracoes>
        <SemPermissao descricao="Só a gestão da consultoria administra a equipe e os convites." />
      </PaginaDeConfiguracoes>
    )
  }
  return <EquipeDaGestao />
}

function EquipeDaGestao() {
  // Em modo suporte (ADR-0025) as ações somem: o suporte só lê (o banco recusa de qualquer forma).
  const { atual, suporte } = useConsultoria()
  const cid = atual.consultoriaId
  const queryClient = useQueryClient()
  const [convidarAberto, setConvidarAberto] = useState(false)
  const [desligando, setDesligando] = useState<Membro | null>(null)
  const [editando, setEditando] = useState<Membro | null>(null)
  const [aviso, setAviso] = useState<Aviso>(null)

  const membros = useInfiniteQuery({
    queryKey: ['membros', cid],
    queryFn: ({ pageParam }) => listarMembros(cid, pageParam),
    initialPageParam: 0,
    getNextPageParam: proximaPagina<Membro>,
  })
  const convites = useInfiniteQuery({
    queryKey: ['convites', cid],
    queryFn: ({ pageParam }) => listarConvitesPendentes(cid, pageParam),
    initialPageParam: 0,
    getNextPageParam: proximaPagina<ConvitePendente>,
  })

  const atualizar = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['membros', cid] }),
      queryClient.invalidateQueries({ queryKey: ['convites', cid] }),
      queryClient.invalidateQueries({ queryKey: [CHAVE_MEUS_VINCULOS] }),
    ])

  const falhar = (erro: unknown) => {
    setAviso({ tom: 'perigo', texto: mensagemDoErro(erro) })
  }

  const papel = useMutation({
    mutationFn: ({ membro, novo }: { membro: Membro; novo: Membro['papel'] }) =>
      alterarPapel(membro.id, novo),
    onSuccess: (_, { membro, novo }) => {
      setAviso({ tom: 'sucesso', texto: `${membro.nome} agora é ${NOMES_PAPEL[novo]}.` })
    },
    onError: falhar,
    onSettled: atualizar,
  })

  const financeiro = useMutation({
    mutationFn: (membro: Membro) => definirPermissaoFinanceira(membro.id, !membro.financeiro),
    onSuccess: (_, membro) => {
      setAviso({
        tom: 'sucesso',
        texto: membro.financeiro
          ? `${membro.nome} não vê mais o dinheiro dos orçamentos.`
          : `${membro.nome} agora vê o dinheiro dos orçamentos.`,
      })
    },
    onError: falhar,
    onSettled: atualizar,
  })

  const desligamento = useMutation({
    mutationFn: (membro: Membro) => desligarMembro(membro.id),
    onSuccess: (_, membro) => {
      setDesligando(null)
      setAviso({
        tom: 'sucesso',
        texto: `Acesso de ${membro.nome} à ${atual.consultoriaNome} encerrado.`,
      })
    },
    onError: (erro) => {
      setDesligando(null)
      falhar(erro)
    },
    onSettled: atualizar,
  })

  const reenvio = useMutation({
    mutationFn: async (convite: ConvitePendente) => {
      const token = await reenviarConvite(convite.id)
      await enviarEmailDoConvite(convite.email, token)
    },
    onSuccess: (_, convite) => {
      setAviso({ tom: 'sucesso', texto: `Convite reenviado para ${convite.email}.` })
    },
    onError: falhar,
    onSettled: atualizar,
  })

  const cancelamento = useMutation({
    mutationFn: (convite: ConvitePendente) => cancelarConvite(convite.id),
    onSuccess: (_, convite) => {
      setAviso({ tom: 'sucesso', texto: `Convite para ${convite.email} cancelado.` })
    },
    onError: falhar,
    onSettled: atualizar,
  })

  function aoConvidar(resultado: ResultadoConvite) {
    setAviso(
      resultado.tipo === 'enviado'
        ? { tom: 'sucesso', texto: `Convite enviado para ${resultado.email}.` }
        : {
            tom: 'atencao',
            texto: `O convite para ${resultado.email} foi criado, mas o e-mail não saiu (${resultado.motivo}) Use “Reenviar” mais tarde.`,
          },
    )
    void atualizar()
  }

  if (ehSemPermissao(membros.error) || ehSemPermissao(convites.error)) {
    return (
      <PaginaDeConfiguracoes>
        <SemPermissao />
      </PaginaDeConfiguracoes>
    )
  }

  const listaMembros = achatar(membros.data)
  const listaConvites = achatar(convites.data)
  const vinculos = listaMembros.itens
  const agora = new Date()
  const ocupado =
    papel.isPending ||
    financeiro.isPending ||
    desligamento.isPending ||
    reenvio.isPending ||
    cancelamento.isPending

  function acoesDoMembro(membro: Membro) {
    if (membro.situacao === 'desligado' || suporte) return null
    const novo = membro.papel === 'gestao' ? 'equipe' : 'gestao'
    const impedimentoPapel = impedimentoDoVinculo(
      vinculos,
      membro.id,
      novo === 'equipe' ? 'passar_para_equipe' : 'passar_para_gestao',
    )
    const impedimentoDesligar = impedimentoDoVinculo(vinculos, membro.id, 'desligar')
    // A permissão financeira não pode ficar sem ninguém (o banco também recusa).
    const ultimoFinanceiro =
      membro.financeiro &&
      vinculos.filter((v) => v.situacao === 'ativo' && v.papel === 'gestao' && v.financeiro)
        .length === 1
    return (
      <BotaoMais
        de={membro.nome}
        desabilitado={ocupado}
        itens={[
          {
            rotulo: `Passar para ${NOMES_PAPEL[novo]}`,
            detalhe: impedimentoPapel === 'ultima_gestao' ? MOTIVO_ULTIMA_GESTAO : undefined,
            desabilitado: impedimentoPapel !== null,
            aoEscolher: () => {
              setAviso(null)
              papel.mutate({ membro, novo })
            },
          },
          ...(membro.papel === 'gestao'
            ? [
                {
                  rotulo: membro.financeiro ? 'Tirar acesso ao dinheiro' : 'Dar acesso ao dinheiro',
                  detalhe: ultimoFinanceiro ? MOTIVO_ULTIMO_FINANCEIRO : undefined,
                  desabilitado: ultimoFinanceiro,
                  aoEscolher: () => {
                    setAviso(null)
                    financeiro.mutate(membro)
                  },
                },
              ]
            : []),
          {
            rotulo: 'Profissão e cargo',
            aoEscolher: () => {
              setAviso(null)
              setEditando(membro)
            },
          },
          {
            rotulo: 'Desligar',
            detalhe: impedimentoDesligar === 'ultima_gestao' ? MOTIVO_ULTIMA_GESTAO : undefined,
            desabilitado: impedimentoDesligar !== null,
            aoEscolher: () => {
              setAviso(null)
              setDesligando(membro)
            },
          },
        ]}
      />
    )
  }

  // Papel é texto; só o desligamento é situação (Selo).
  function seloPapel(membro: Membro) {
    return membro.situacao === 'desligado' ? (
      <Selo tom="padrao">Desligado</Selo>
    ) : (
      <span className="text-(--tinta-2)">{NOMES_PAPEL[membro.papel]}</span>
    )
  }

  /**
   * Profissão (no gênero da pessoa; em curso, "Estudante de …") e cargo em texto; o que falta
   * aparece como "não informado".
   */
  function profissaoECargoDoMembro(membro: Membro) {
    return (
      <span className="flex min-w-0 flex-col">
        <span className="truncate">
          {membro.profissao
            ? [
                rotuloDaFormacaoDaPessoa(membro.profissao, membro.genero, membro.profissaoEmCurso),
                ...membro.outrasProfissoes.map((codigo) =>
                  rotuloDaProfissaoDaPessoa(codigo, membro.genero),
                ),
              ].join(' · ')
            : 'Profissão não informada'}
        </span>
        <span className="truncate rotulo">
          {membro.cargoCodigo
            ? membro.cargo
            : membro.cargoAntigo
              ? `${membro.cargoAntigo} (cargo antigo)`
              : 'Cargo não informado'}
        </span>
      </span>
    )
  }

  function nomeDoMembro(membro: Membro) {
    const desligado = membro.situacao === 'desligado'
    return (
      <span className="flex min-w-0 items-center gap-(--e-2)">
        <Avatar nome={membro.nome} />
        <span className={desligado ? 'truncate text-(--tinta-2)' : 'truncate corpo-medio'}>
          {membro.nome}
        </span>
        {membro.id === atual.membroId ? <span className="shrink-0 rotulo">você</span> : null}
      </span>
    )
  }

  function expiraEm(convite: ConvitePendente) {
    const expirado =
      situacaoDoConvite({ situacao: convite.situacao, expiraEm: convite.expiraEm }, agora) ===
      'expirado'
    return (
      <span className="inline-flex items-center gap-(--e-2) whitespace-nowrap numero">
        {formatarInstanteComoData(convite.expiraEm, atual.fuso)}
        {expirado ? <Selo tom="perigo">Expirado</Selo> : null}
      </span>
    )
  }

  function acoesDoConvite(convite: ConvitePendente) {
    if (suporte) return null
    return (
      <span className="flex items-center justify-end gap-(--e-1)">
        <Botao
          tamanho="compacto"
          disabled={ocupado}
          aria-label={`Reenviar convite para ${convite.email}`}
          onClick={() => {
            setAviso(null)
            reenvio.mutate(convite)
          }}
        >
          Reenviar
        </Botao>
        <Botao
          tamanho="compacto"
          aparencia="sutil"
          disabled={ocupado}
          aria-label={`Cancelar convite para ${convite.email}`}
          onClick={() => {
            setAviso(null)
            cancelamento.mutate(convite)
          }}
        >
          Cancelar
        </Botao>
      </span>
    )
  }

  const convitesVisiveis = !convites.isSuccess || listaConvites.total > 0

  return (
    <PaginaDeConfiguracoes
      acao={
        suporte ? null : (
          <Botao
            aparencia="primario"
            iconeAntes="plus"
            onClick={() => {
              setAviso(null)
              setConvidarAberto(true)
            }}
          >
            Convidar pessoa
          </Botao>
        )
      }
    >
      {aviso ? (
        <MensagemSecao role={aviso.tom === 'sucesso' ? 'status' : 'alert'} tom={aviso.tom}>
          {aviso.texto}
        </MensagemSecao>
      ) : null}

      <section aria-labelledby="titulo-membros" className="flex flex-col gap-(--e-3)">
        <TituloSecao id="titulo-membros" total={membros.isSuccess ? listaMembros.total : undefined}>
          Membros
        </TituloSecao>
        {membros.isPending ? (
          <Carregando rotulo="Carregando membros" linhas={4} />
        ) : membros.isError ? (
          <EstadoErro aoTentarDeNovo={() => void membros.refetch()} />
        ) : (
          <div className={`flex flex-col overflow-hidden ${classePainel}`}>
            <div className="hidden overflow-x-auto md:block">
              <table className={classeTabela}>
                <thead>
                  <tr>
                    <th scope="col" className={classeCabecalho}>
                      Nome
                    </th>
                    <th scope="col" className={classeCabecalho}>
                      E-mail
                    </th>
                    <th scope="col" className={classeCabecalho}>
                      Profissão e cargo
                    </th>
                    <th scope="col" className={classeCabecalho}>
                      Papel
                    </th>
                    <th scope="col" className={classeCabecalho}>
                      Desde
                    </th>
                    <th scope="col" className={`${classeCabecalho} w-14`}>
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {listaMembros.itens.map((membro) => (
                    <tr key={membro.id} className={classeLinha}>
                      <td className={classeCelula}>{nomeDoMembro(membro)}</td>
                      <td className={`${classeCelula} text-(--tinta-2)`}>{membro.email}</td>
                      <td className={`${classeCelula} max-w-64 py-(--e-1)`}>
                        {profissaoECargoDoMembro(membro)}
                      </td>
                      <td className={classeCelula}>{seloPapel(membro)}</td>
                      <td className={`${classeCelula} whitespace-nowrap text-(--tinta-2) numero`}>
                        {formatarInstanteComoData(membro.criadoEm, atual.fuso)}
                      </td>
                      <td className={`${classeCelula} text-right`}>{acoesDoMembro(membro)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="flex flex-col md:hidden" aria-label="Membros">
              {listaMembros.itens.map((membro) => (
                <li key={membro.id} className={classeItemCelular}>
                  <span className="flex min-w-0 flex-1 flex-col gap-(--e-1)">
                    <span className="flex items-center justify-between gap-(--e-2)">
                      {nomeDoMembro(membro)}
                      {seloPapel(membro)}
                    </span>
                    <span className="truncate rotulo">{membro.email}</span>
                    {profissaoECargoDoMembro(membro)}
                  </span>
                  {acoesDoMembro(membro)}
                </li>
              ))}
            </ul>
            {membros.hasNextPage ? (
              <div className="border-t px-(--e-4) py-(--e-2)">
                <Botao
                  aparencia="sutil"
                  disabled={membros.isFetchingNextPage}
                  onClick={() => void membros.fetchNextPage()}
                >
                  Mostrar mais membros
                </Botao>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <RegistrosAConfirmar />

      {/* Sem convites pendentes, a seção some (um vazio a menos na tela). */}
      {convitesVisiveis ? (
        <section aria-labelledby="titulo-convites" className="flex flex-col gap-(--e-3)">
          <TituloSecao
            id="titulo-convites"
            total={convites.isSuccess ? listaConvites.total : undefined}
          >
            Convites pendentes
          </TituloSecao>
          {convites.isPending ? (
            <Carregando rotulo="Carregando convites" linhas={2} />
          ) : convites.isError ? (
            <EstadoErro aoTentarDeNovo={() => void convites.refetch()} />
          ) : (
            <div className={`flex flex-col overflow-hidden ${classePainel}`}>
              <div className="hidden overflow-x-auto md:block">
                <table className={classeTabela}>
                  <thead>
                    <tr>
                      <th scope="col" className={classeCabecalho}>
                        E-mail
                      </th>
                      <th scope="col" className={classeCabecalho}>
                        Papel
                      </th>
                      <th scope="col" className={classeCabecalho}>
                        Enviado em
                      </th>
                      <th scope="col" className={classeCabecalho}>
                        Expira em
                      </th>
                      <th scope="col" className={classeCabecalho}>
                        <span className="sr-only">Ações</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {listaConvites.itens.map((convite) => (
                      <tr key={convite.id} className={classeLinha}>
                        <td className={`${classeCelula} corpo-medio`}>{convite.email}</td>
                        <td className={`${classeCelula} text-(--tinta-2)`}>
                          {NOMES_PAPEL[convite.papel]}
                        </td>
                        <td className={`${classeCelula} whitespace-nowrap text-(--tinta-2) numero`}>
                          {formatarInstanteComoData(convite.enviadoEm, atual.fuso)}
                        </td>
                        <td className={`${classeCelula} text-(--tinta-2)`}>{expiraEm(convite)}</td>
                        <td className={classeCelula}>{acoesDoConvite(convite)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="flex flex-col md:hidden" aria-label="Convites pendentes">
                {listaConvites.itens.map((convite) => (
                  <li
                    key={convite.id}
                    className="flex flex-col gap-(--e-1) border-b border-(--regra-leve) px-(--e-4) py-(--e-3) last:border-b-0"
                  >
                    <span className="truncate corpo-medio">{convite.email}</span>
                    <span className="flex flex-wrap items-center gap-x-(--e-2) gap-y-(--e-1) rotulo">
                      {NOMES_PAPEL[convite.papel]} · expira em {expiraEm(convite)}
                    </span>
                    {acoesDoConvite(convite)}
                  </li>
                ))}
              </ul>
              {convites.hasNextPage ? (
                <div className="border-t px-(--e-4) py-(--e-2)">
                  <Botao
                    aparencia="sutil"
                    disabled={convites.isFetchingNextPage}
                    onClick={() => void convites.fetchNextPage()}
                  >
                    Mostrar mais convites
                  </Botao>
                </div>
              ) : null}
            </div>
          )}
        </section>
      ) : null}
      <AcessosDoSuporte />

      <DialogoConvidar
        aberto={convidarAberto}
        aoMudar={setConvidarAberto}
        consultoriaId={cid}
        aoConvidar={aoConvidar}
      />

      {editando ? (
        <DialogoProfissaoECargo
          key={editando.id}
          membro={editando}
          aoFechar={() => {
            setEditando(null)
          }}
          aoSalvar={(membro) => {
            setEditando(null)
            setAviso({ tom: 'sucesso', texto: `Profissão e cargo de ${membro.nome} salvos.` })
            void Promise.all([
              atualizar(),
              queryClient.invalidateQueries({ queryKey: ['membros-ativos', cid] }),
            ])
          }}
        />
      ) : null}

      <Dialogo
        aberto={desligando !== null}
        aoMudar={(aberto) => {
          if (!aberto) setDesligando(null)
        }}
        titulo={desligando ? `Desligar ${desligando.nome}` : 'Desligar'}
        descricao={
          desligando
            ? `O acesso de ${desligando.nome} à ${atual.consultoriaNome} é revogado na hora. O que essa pessoa fez continua no histórico com o nome dela.`
            : undefined
        }
        acoes={
          <>
            <Botao
              onClick={() => {
                setDesligando(null)
              }}
            >
              Cancelar
            </Botao>
            <Botao
              aparencia="perigo"
              disabled={desligamento.isPending}
              onClick={() => {
                if (desligando) desligamento.mutate(desligando)
              }}
            >
              {desligamento.isPending ? 'Desligando…' : 'Desligar'}
            </Botao>
          </>
        }
      >
        <p className="text-(--tinta-2)">Nada é apagado nem cancelado.</p>
      </Dialogo>
    </PaginaDeConfiguracoes>
  )
}

/** Profissão e cargo de um membro, pela Gestão (ADR-0021). */
function DialogoProfissaoECargo({
  membro,
  aoFechar,
  aoSalvar,
}: {
  membro: Membro
  aoFechar: () => void
  aoSalvar: (membro: Membro) => void
}) {
  const [profissao, setProfissao] = useState<CodigoProfissao | ''>(membro.profissao ?? '')
  const [emCurso, setEmCurso] = useState(membro.profissaoEmCurso)
  const [outras, setOutras] = useState<CodigoProfissao[]>(membro.outrasProfissoes)
  const [cargo, setCargo] = useState<CodigoCargo | ''>(membro.cargoCodigo ?? '')
  const salvar = useMutation({
    mutationFn: () =>
      definirProfissaoECargo(membro.id, profissao || null, cargo || null, outras, emCurso),
    onSuccess: () => {
      aoSalvar(membro)
    },
  })
  return (
    <Dialogo
      aberto
      aoMudar={(aberto) => {
        if (!aberto) aoFechar()
      }}
      titulo={`Profissão e cargo de ${membro.nome}`}
      acoes={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao
            aparencia="primario"
            disabled={salvar.isPending}
            aria-busy={salvar.isPending || undefined}
            onClick={() => {
              salvar.mutate()
            }}
          >
            {salvar.isPending ? 'Salvando…' : 'Salvar'}
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-(--e-3)">
        <CamposProfissaoECargo
          profissao={profissao}
          outras={outras}
          cargo={cargo}
          cargoAntigo={membro.cargoAntigo}
          genero={membro.genero}
          emCurso={emCurso}
          rotuloEmCurso="Ainda está cursando"
          desabilitado={salvar.isPending}
          aoMudarProfissao={setProfissao}
          aoMudarEmCurso={setEmCurso}
          aoMudarOutras={setOutras}
          aoMudarCargo={setCargo}
        />
        {salvar.error ? (
          <MensagemSecao role="alert" tom="perigo">
            {mensagemDoErro(salvar.error)}
          </MensagemSecao>
        ) : null}
      </div>
    </Dialogo>
  )
}
