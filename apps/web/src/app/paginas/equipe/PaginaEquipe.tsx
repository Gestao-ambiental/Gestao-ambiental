import { impedimentoDoVinculo, situacaoDoConvite } from '@gestao-ambiental/domain'
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

import { CHAVE_MEUS_VINCULOS, useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { NOMES_PAPEL } from '@/app/papeis'
import { Pagina } from '@/app/paginas/Pagina'
import { Carregando, EstadoErro, SemPermissao } from '@/components/estados'
import { Avatar } from '@/components/ui/avatar'
import { Botao } from '@/components/ui/botao'
import { Dialogo } from '@/components/ui/dialogo'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Icone } from '@/components/ui/icone'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Selo } from '@/components/ui/selo'
import {
  TAMANHO_PAGINA,
  alterarPapel,
  cancelarConvite,
  desligarMembro,
  enviarEmailDoConvite,
  listarConvitesPendentes,
  listarMembros,
  reenviarConvite,
  type ConvitePendente,
  type Membro,
} from '@/lib/api/acesso'
import { formatarInstanteComoData } from '@/lib/datas'
import { ehSemPermissao, mensagemDoErro } from '@/lib/erros'

import { DialogoConvidar, type ResultadoConvite } from './DialogoConvidar'

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
    <div className="flex items-baseline gap-(--space-100)">
      <h2 id={id} className="titulo-secao text-(--text)">
        {children}
      </h2>
      {total === undefined ? null : <span className="text-xs text-(--text-subtle)">{total}</span>}
    </div>
  )
}

const classeTabela = 'w-full border-collapse corpo'
const classeCabecalho =
  'h-10 border-b px-(--space-100) text-left rotulo whitespace-nowrap first:pl-(--space-150)'
const classeCelula = 'h-10 border-b px-(--space-100) align-middle first:pl-(--space-150)'

/**
 * /configuracoes/equipe (Protótipo 07; ACC-02, ACC-03). Só a Gestão administra: membros com
 * papel e desligamento, convites pendentes com reenviar e cancelar. A Equipe vê "sem permissão"
 * (o banco recusaria de qualquer forma).
 */
export function PaginaEquipe() {
  const { atual } = useConsultoria()
  if (atual.papel !== 'gestao') {
    return (
      <Pagina titulo="Equipe">
        <SemPermissao descricao="Só a gestão da consultoria administra a equipe e os convites." />
      </Pagina>
    )
  }
  return <EquipeDaGestao />
}

function EquipeDaGestao() {
  const { atual } = useConsultoria()
  const cid = atual.consultoriaId
  const queryClient = useQueryClient()
  const [convidarAberto, setConvidarAberto] = useState(false)
  const [desligando, setDesligando] = useState<Membro | null>(null)
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
      <Pagina titulo="Equipe">
        <SemPermissao />
      </Pagina>
    )
  }

  const listaMembros = achatar(membros.data)
  const listaConvites = achatar(convites.data)
  const vinculos = listaMembros.itens
  const agora = new Date()
  const ocupado =
    papel.isPending || desligamento.isPending || reenvio.isPending || cancelamento.isPending

  function acoesDoMembro(membro: Membro) {
    if (membro.situacao === 'desligado') return null
    const novo = membro.papel === 'gestao' ? 'equipe' : 'gestao'
    const impedimentoPapel = impedimentoDoVinculo(
      vinculos,
      membro.id,
      novo === 'equipe' ? 'passar_para_equipe' : 'passar_para_gestao',
    )
    const impedimentoDesligar = impedimentoDoVinculo(vinculos, membro.id, 'desligar')
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Ações de ${membro.nome}`}
          disabled={ocupado}
          className="inline-flex size-(--size-control) cursor-pointer items-center justify-center rounded-(--radius) text-(--icon) transicao-estado hover:bg-(--neutral-subtle-hover) disabled:cursor-not-allowed max-md:size-11"
        >
          <Icone nome="ellipsis" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-w-[280px]">
          <DropdownMenuItem
            disabled={impedimentoPapel !== null}
            onSelect={() => {
              setAviso(null)
              papel.mutate({ membro, novo })
            }}
          >
            <span className="flex flex-col">
              <span>Passar para {NOMES_PAPEL[novo]}</span>
              {impedimentoPapel === 'ultima_gestao' ? (
                <span className="text-xs text-(--text-subtle)">{MOTIVO_ULTIMA_GESTAO}</span>
              ) : null}
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={impedimentoDesligar !== null}
            onSelect={() => {
              setAviso(null)
              setDesligando(membro)
            }}
          >
            <span className="flex flex-col">
              <span>Desligar</span>
              {impedimentoDesligar === 'ultima_gestao' ? (
                <span className="text-xs text-(--text-subtle)">{MOTIVO_ULTIMA_GESTAO}</span>
              ) : null}
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  function seloPapel(membro: Membro) {
    return membro.situacao === 'desligado' ? (
      <Selo tom="padrao">Desligado</Selo>
    ) : (
      <Selo tom={membro.papel === 'gestao' ? 'sucesso' : 'padrao'}>
        {NOMES_PAPEL[membro.papel]}
      </Selo>
    )
  }

  function nomeDoMembro(membro: Membro) {
    const desligado = membro.situacao === 'desligado'
    return (
      <span className="flex min-w-0 items-center gap-(--space-100)">
        <Avatar nome={membro.nome} />
        <span className={desligado ? 'truncate text-(--text-subtle)' : 'truncate corpo-medio'}>
          {membro.nome}
        </span>
        {membro.id === atual.membroId ? (
          <span className="text-xs text-(--text-subtle)">você</span>
        ) : null}
      </span>
    )
  }

  function expiraEm(convite: ConvitePendente) {
    const expirado =
      situacaoDoConvite({ situacao: convite.situacao, expiraEm: convite.expiraEm }, agora) ===
      'expirado'
    return (
      <span className="inline-flex items-center gap-(--space-100) whitespace-nowrap">
        {formatarInstanteComoData(convite.expiraEm, atual.fuso)}
        {expirado ? <Selo tom="perigo">Expirado</Selo> : null}
      </span>
    )
  }

  function acoesDoConvite(convite: ConvitePendente) {
    return (
      <span className="flex items-center justify-end gap-(--space-050)">
        <Botao
          tamanho="compacto"
          iconeAntes="send"
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

  return (
    <div className="flex flex-col gap-(--space-300)">
      <div className="flex flex-wrap items-start justify-between gap-(--space-100)">
        <Pagina titulo="Equipe">{null}</Pagina>
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
      </div>

      {aviso ? (
        <MensagemSecao role={aviso.tom === 'sucesso' ? 'status' : 'alert'} tom={aviso.tom}>
          {aviso.texto}
        </MensagemSecao>
      ) : null}

      <section aria-labelledby="titulo-membros" className="flex flex-col gap-(--space-100)">
        <TituloSecao id="titulo-membros" total={membros.isSuccess ? listaMembros.total : undefined}>
          Membros
        </TituloSecao>
        {membros.isPending ? (
          <Carregando rotulo="Carregando membros" linhas={4} />
        ) : membros.isError ? (
          <EstadoErro aoTentarDeNovo={() => void membros.refetch()} />
        ) : (
          <>
            <div className="hidden overflow-x-auto rounded-(--radius) border bg-(--surface) md:block">
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
                      Papel
                    </th>
                    <th scope="col" className={classeCabecalho}>
                      Desde
                    </th>
                    <th scope="col" className={classeCabecalho}>
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {listaMembros.itens.map((membro) => (
                    <tr key={membro.id} className="last:[&>td]:border-b-0">
                      <td className={classeCelula}>{nomeDoMembro(membro)}</td>
                      <td className={`${classeCelula} text-(--text-subtle)`}>{membro.email}</td>
                      <td className={classeCelula}>{seloPapel(membro)}</td>
                      <td className={`${classeCelula} whitespace-nowrap text-(--text-subtle)`}>
                        {formatarInstanteComoData(membro.criadoEm, atual.fuso)}
                      </td>
                      <td className={`${classeCelula} w-12 text-right`}>{acoesDoMembro(membro)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul
              className="flex flex-col rounded-(--radius) border bg-(--surface) md:hidden"
              aria-label="Membros"
            >
              {listaMembros.itens.map((membro) => (
                <li
                  key={membro.id}
                  className="flex items-center gap-(--space-100) border-b px-(--space-150) py-(--space-100) last:border-b-0"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-(--space-025)">
                    {nomeDoMembro(membro)}
                    <span className="truncate text-xs text-(--text-subtle)">{membro.email}</span>
                    <span>{seloPapel(membro)}</span>
                  </span>
                  {acoesDoMembro(membro)}
                </li>
              ))}
            </ul>
            {membros.hasNextPage ? (
              <Botao
                className="self-start"
                disabled={membros.isFetchingNextPage}
                onClick={() => void membros.fetchNextPage()}
              >
                Mostrar mais membros
              </Botao>
            ) : null}
          </>
        )}
      </section>

      <section aria-labelledby="titulo-convites" className="flex flex-col gap-(--space-100)">
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
        ) : listaConvites.itens.length === 0 ? (
          <p className="corpo text-(--text-subtle)">
            Nenhum convite pendente. Use “Convidar pessoa” para chamar alguém da equipe.
          </p>
        ) : (
          <>
            <div className="hidden overflow-x-auto rounded-(--radius) border bg-(--surface) md:block">
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
                    <tr key={convite.id} className="last:[&>td]:border-b-0">
                      <td className={classeCelula}>{convite.email}</td>
                      <td className={classeCelula}>
                        <Selo>{NOMES_PAPEL[convite.papel]}</Selo>
                      </td>
                      <td className={`${classeCelula} whitespace-nowrap text-(--text-subtle)`}>
                        {formatarInstanteComoData(convite.enviadoEm, atual.fuso)}
                      </td>
                      <td className={`${classeCelula} text-(--text-subtle)`}>
                        {expiraEm(convite)}
                      </td>
                      <td className={classeCelula}>{acoesDoConvite(convite)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul
              className="flex flex-col rounded-(--radius) border bg-(--surface) md:hidden"
              aria-label="Convites pendentes"
            >
              {listaConvites.itens.map((convite) => (
                <li
                  key={convite.id}
                  className="flex flex-col gap-(--space-050) border-b px-(--space-150) py-(--space-100) last:border-b-0"
                >
                  <span className="truncate corpo-medio">{convite.email}</span>
                  <span className="flex flex-wrap items-center gap-(--space-100) text-xs text-(--text-subtle)">
                    <Selo>{NOMES_PAPEL[convite.papel]}</Selo>
                    Expira em {expiraEm(convite)}
                  </span>
                  {acoesDoConvite(convite)}
                </li>
              ))}
            </ul>
            {convites.hasNextPage ? (
              <Botao
                className="self-start"
                disabled={convites.isFetchingNextPage}
                onClick={() => void convites.fetchNextPage()}
              >
                Mostrar mais convites
              </Botao>
            ) : null}
          </>
        )}
      </section>

      <DialogoConvidar
        aberto={convidarAberto}
        aoMudar={setConvidarAberto}
        consultoriaId={cid}
        aoConvidar={aoConvidar}
      />

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
        <p className="text-(--text-subtle)">Nada é apagado nem cancelado.</p>
      </Dialogo>
    </div>
  )
}
