import { formatarContato, linkDoContato, linkDoConviteNoWhatsapp } from '@gestao-ambiental/domain'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { Pagina } from '@/app/paginas/Pagina'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { CaixaSelecao } from '@/components/ui/caixa-selecao'
import { CampoTexto } from '@/components/ui/campo-texto'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { TAMANHO_PAGINA_CENTRAL } from '@/lib/api/central'
import {
  convidarPorEmail,
  emitirConviteDoBeta,
  ErroDoConvite,
  listarListaDeEspera,
  marcarContatado,
  registrarConviteNoWhatsapp,
  type PessoaNaListaDeEspera,
} from '@/lib/api/lista-de-espera'
import { formatarInstanteComHora, formatarInstanteComoData } from '@/lib/datas'
import { ehDoisFatoresNecessarios, ehSemPermissao, mensagemDoErro } from '@/lib/erros'

import { RelerDoisFatores } from './ExigeDoisFatores'
import { classeCabecalho, classeCelula, classeLinha, classePainel, plural } from './comum'

const FUSO_DA_CENTRAL = 'America/Sao_Paulo'

const ROTULO_DO_TIPO = { email: 'E-mail', whatsapp: 'WhatsApp' } as const

type Aviso = { tom: 'sucesso' | 'perigo'; texto: string } | null

/**
 * /admin/lista-de-espera (ADR-0032, ADR-0034): quem se cadastrou pelo site, mais recentes primeiro,
 * com o link para responder, a marcação de contatado e o convite para o beta (e-mail pelo Grama;
 * WhatsApp abre a conversa com a mensagem pronta). Paginada (50).
 */
export function PaginaCentralListaDeEspera() {
  const cliente = useQueryClient()
  const [soPendentes, setSoPendentes] = useState(false)
  const [aviso, setAviso] = useState<Aviso>(null)

  const consulta = useInfiniteQuery({
    queryKey: ['central', 'lista-de-espera', soPendentes],
    queryFn: ({ pageParam }) => listarListaDeEspera(pageParam, soPendentes),
    initialPageParam: 0,
    getNextPageParam: (ultima, todas) => {
      const carregados = todas.reduce((soma, pagina) => soma + pagina.itens.length, 0)
      return ultima.itens.length === TAMANHO_PAGINA_CENTRAL && carregados < ultima.total
        ? todas.length
        : undefined
    },
  })

  function recarregar() {
    void cliente.invalidateQueries({ queryKey: ['central', 'lista-de-espera'] })
  }

  const contatado = useMutation({
    mutationFn: ({ id, valor }: { id: string; valor: boolean }) => marcarContatado(id, valor),
    onSuccess: () => {
      setAviso(null)
      recarregar()
    },
    onError: (erro) => {
      setAviso({ tom: 'perigo', texto: mensagemDoErro(erro) })
    },
  })

  const convite = useMutation({
    mutationFn: async (pessoa: PessoaNaListaDeEspera) => {
      if (pessoa.contato.tipo === 'email') await convidarPorEmail(pessoa.id)
      else await registrarConviteNoWhatsapp(pessoa.id)
      return pessoa
    },
    onSuccess: (pessoa) => {
      setAviso({
        tom: 'sucesso',
        texto:
          pessoa.contato.tipo === 'email'
            ? `Convite enviado para ${pessoa.contato.valor}.`
            : `Convite de ${pessoa.nome} registrado.`,
      })
      recarregar()
    },
    onError: (erro) => {
      setAviso({
        tom: 'perigo',
        texto: erro instanceof ErroDoConvite ? erro.message : mensagemDoErro(erro),
      })
    },
  })

  function convidar(pessoa: PessoaNaListaDeEspera) {
    setAviso(null)
    if (pessoa.contato.tipo === 'whatsapp') {
      // Abre no clique (antes de qualquer espera), senão o navegador bloqueia a janela.
      window.open(
        linkDoConviteNoWhatsapp(
          pessoa.contato.valor,
          pessoa.nome,
          `${window.location.origin}/criar-conta`,
        ),
        '_blank',
        'noopener,noreferrer',
      )
    }
    convite.mutate(pessoa)
  }

  const itens = consulta.data?.pages.flatMap((pagina) => pagina.itens) ?? []
  const total = consulta.data?.pages[0]?.total ?? 0

  let conteudo
  if (consulta.isPending) {
    conteudo = <Carregando rotulo="Carregando a lista de espera" linhas={6} />
  } else if (consulta.isError && ehDoisFatoresNecessarios(consulta.error)) {
    conteudo = <RelerDoisFatores />
  } else if (consulta.isError && ehSemPermissao(consulta.error)) {
    conteudo = <SemPermissao descricao={null} />
  } else if (consulta.isError) {
    conteudo = (
      <EstadoErro
        titulo="Não foi possível carregar a lista de espera."
        descricao="Verifique a conexão e tente de novo."
        aoTentarDeNovo={() => void consulta.refetch()}
      />
    )
  } else if (itens.length === 0) {
    conteudo = (
      <EstadoVazio
        icone="users"
        titulo={soPendentes ? 'Ninguém falta contatar' : 'Ninguém na lista de espera ainda'}
      />
    )
  } else {
    conteudo = (
      <div className={`flex flex-col overflow-hidden ${classePainel}`}>
        <div className="max-h-[calc(100dvh-280px)] min-h-[240px] overflow-auto">
          <table className="w-full border-collapse corpo">
            <thead className="sticky top-0 z-10 bg-(--folha)">
              <tr>
                <th scope="col" className={classeCabecalho}>
                  Nome
                </th>
                <th scope="col" className={classeCabecalho}>
                  Contato
                </th>
                <th scope="col" className={classeCabecalho}>
                  Cadastro
                </th>
                <th scope="col" className={classeCabecalho}>
                  Contatado
                </th>
                <th scope="col" className={classeCabecalho}>
                  Convite
                </th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => {
                const convidando = convite.isPending && convite.variables.id === item.id
                return (
                  <tr key={item.id} className={classeLinha}>
                    <td className={`${classeCelula} corpo-medio text-(--tinta)`}>{item.nome}</td>
                    <td className={`${classeCelula} whitespace-nowrap`}>
                      <span className="rotulo mr-(--e-15)">
                        {ROTULO_DO_TIPO[item.contato.tipo]}
                      </span>
                      <a
                        href={linkDoContato(item.contato)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {formatarContato(item.contato)}
                      </a>
                    </td>
                    <td className={`${classeCelula} whitespace-nowrap text-(--tinta-2) numero`}>
                      {formatarInstanteComHora(item.criadaEm, FUSO_DA_CENTRAL)}
                    </td>
                    <td className={`${classeCelula} whitespace-nowrap numero`}>
                      <label className="flex min-h-(--controle-mini) cursor-pointer items-center gap-(--e-2)">
                        <input
                          type="checkbox"
                          className="size-4 cursor-pointer accent-(--acao)"
                          checked={item.contatadoEm !== null}
                          disabled={contatado.isPending}
                          aria-label={`Contatado: ${item.nome}`}
                          onChange={(e) => {
                            contatado.mutate({ id: item.id, valor: e.target.checked })
                          }}
                        />
                        <span aria-hidden="true">
                          {item.contatadoEm
                            ? formatarInstanteComoData(item.contatadoEm, FUSO_DA_CENTRAL)
                            : 'Não'}
                        </span>
                      </label>
                    </td>
                    <td className={`${classeCelula} whitespace-nowrap numero`}>
                      <div className="flex items-center gap-(--e-2)">
                        {item.convidadoEm ? (
                          <span className="text-(--tinta-2)">
                            Convidado em{' '}
                            {formatarInstanteComoData(item.convidadoEm, FUSO_DA_CENTRAL)}
                          </span>
                        ) : null}
                        <Botao
                          tamanho="compacto"
                          disabled={convite.isPending}
                          aria-busy={convidando || undefined}
                          aria-label={`${item.convidadoEm ? 'Convidar de novo' : 'Convidar'}: ${item.nome}`}
                          onClick={() => {
                            convidar(item)
                          }}
                        >
                          {convidando
                            ? 'Enviando…'
                            : item.convidadoEm
                              ? 'Convidar de novo'
                              : 'Convidar'}
                        </Botao>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-(--e-2) border-t px-(--e-4) py-(--e-2)">
          <span className="flex-1 rotulo numero">{plural(total, 'pessoa', 'pessoas')}</span>
          {consulta.hasNextPage ? (
            <Botao
              aparencia="sutil"
              tamanho="compacto"
              disabled={consulta.isFetchingNextPage}
              onClick={() => void consulta.fetchNextPage()}
            >
              Mostrar mais
            </Botao>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <Pagina
      titulo="Lista de espera"
      acao={
        <CaixaSelecao
          rotulo="Só quem falta contatar"
          checked={soPendentes}
          onChange={(e) => {
            setSoPendentes(e.target.checked)
          }}
        />
      }
    >
      {aviso ? (
        <MensagemSecao role={aviso.tom === 'perigo' ? 'alert' : 'status'} tom={aviso.tom}>
          {aviso.texto}
        </MensagemSecao>
      ) : null}
      <ConviteDoBetaPorEmail aoAvisar={setAviso} />
      {conteudo}
    </Pagina>
  )
}

/**
 * Convite do beta para um e-mail que não está na lista (ADR-0058): libera abrir uma consultoria,
 * uma vez, para a conta com este e-mail. Não manda e-mail: a Central avisa a pessoa.
 */
function ConviteDoBetaPorEmail({ aoAvisar }: { aoAvisar: (aviso: Aviso) => void }) {
  const [email, setEmail] = useState('')
  const emissao = useMutation({
    mutationFn: (valor: string) => emitirConviteDoBeta(valor),
    onSuccess: (_, valor) => {
      aoAvisar({ tom: 'sucesso', texto: `Convite do beta liberado para ${valor.trim()}.` })
      setEmail('')
    },
    onError: (erro) => {
      aoAvisar({ tom: 'perigo', texto: mensagemDoErro(erro) })
    },
  })
  return (
    <form
      noValidate
      aria-label="Convite do beta por e-mail"
      className="flex flex-wrap items-end gap-(--e-2)"
      onSubmit={(evento) => {
        evento.preventDefault()
        aoAvisar(null)
        emissao.mutate(email)
      }}
    >
      <CampoTexto
        rotulo="E-mail para o convite do beta"
        type="email"
        autoComplete="off"
        value={email}
        className="w-full max-w-[360px]"
        onChange={(e) => {
          setEmail(e.target.value)
        }}
      />
      <Botao type="submit" disabled={emissao.isPending || email.trim() === ''}>
        {emissao.isPending ? 'Liberando…' : 'Liberar convite'}
      </Botao>
    </form>
  )
}
