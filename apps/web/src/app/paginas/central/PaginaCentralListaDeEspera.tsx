import { formatarContato, linkDoContato, linkDoConviteNoWhatsapp } from '@gestao-ambiental/domain'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { Pagina } from '@/app/paginas/Pagina'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { TAMANHO_PAGINA_CENTRAL } from '@/lib/api/central'
import {
  convidarPorEmail,
  ErroDoConvite,
  listarListaDeEspera,
  marcarContatado,
  registrarConviteNoWhatsapp,
  type PessoaNaListaDeEspera,
} from '@/lib/api/lista-de-espera'
import { formatarInstanteComHora, formatarInstanteComoData } from '@/lib/datas'
import { ehDoisFatoresNecessarios, ehSemPermissao, mensagemDoErro } from '@/lib/erros'

import { RelerDoisFatores } from './ExigeDoisFatores'
import { classeCabecalho, classeCelula, plural } from './comum'

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
      <div className="flex flex-col gap-(--e-2)">
        <div className="overflow-x-auto rounded-(--raio-painel) border bg-(--folha) shadow-cartao">
          <table className="w-full border-collapse corpo">
            <thead>
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
                  <tr key={item.id} className="last:[&>td]:border-b-0">
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
                    <td className={`${classeCelula} whitespace-nowrap`}>
                      {formatarInstanteComHora(item.criadaEm, FUSO_DA_CENTRAL)}
                    </td>
                    <td className={`${classeCelula} whitespace-nowrap`}>
                      <label className="flex items-center gap-(--e-15)">
                        <input
                          type="checkbox"
                          className="accent-(--acao)"
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
                    <td className={`${classeCelula} whitespace-nowrap`}>
                      <div className="flex items-center gap-(--e-2)">
                        {item.convidadoEm ? (
                          <span>
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
          <p className="border-t px-(--e-3) py-(--e-2) text-xs text-(--tinta-2)">
            {plural(total, 'pessoa', 'pessoas')}
          </p>
        </div>
        {consulta.hasNextPage ? (
          <Botao
            className="self-start"
            disabled={consulta.isFetchingNextPage}
            onClick={() => void consulta.fetchNextPage()}
          >
            Mostrar mais
          </Botao>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-(--e-6)">
      <Pagina titulo="Lista de espera">{null}</Pagina>
      <label className="flex items-center gap-(--e-15) self-start">
        <input
          type="checkbox"
          className="accent-(--acao)"
          checked={soPendentes}
          onChange={(e) => {
            setSoPendentes(e.target.checked)
          }}
        />
        <span>Só quem falta contatar</span>
      </label>
      {aviso ? (
        <MensagemSecao role={aviso.tom === 'perigo' ? 'alert' : 'status'} tom={aviso.tom}>
          {aviso.texto}
        </MensagemSecao>
      ) : null}
      {conteudo}
    </div>
  )
}
