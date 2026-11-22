import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Pagina } from '@/app/paginas/Pagina'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import {
  ITENS_POR_PAGINA_DA_AUDITORIA,
  listarAuditoriaDaOcorrencia,
  type RegistroDeAuditoria,
} from '@/lib/api/ocorrencias'
import { formatarInstanteComHora } from '@/lib/datas'
import { ehSemPermissao } from '@/lib/erros'

import { descreverRegistro } from './auditoria'

function Registro({ registro, fuso }: { registro: RegistroDeAuditoria; fuso: string }) {
  const { acao, mudancas } = descreverRegistro(registro, fuso)
  return (
    <li className="flex flex-col gap-(--e-05) border-b border-(--regra-leve) py-(--e-2)">
      <span className="flex flex-wrap items-baseline gap-x-(--e-2)">
        <span className="text-xs text-(--tinta-2) numero">
          {formatarInstanteComHora(registro.instante, fuso)}
        </span>
        <span className="corpo-medio text-(--tinta)">{registro.atorNome ?? 'Sistema'}</span>
        <span className="corpo text-(--tinta)">{acao}</span>
      </span>
      {mudancas.length > 0 ? (
        <ul className="flex flex-col gap-(--e-05)" aria-label="Campos alterados">
          {mudancas.map((m) => (
            <li key={m.campo} className="text-xs text-(--tinta-2) numero">
              {m.campo}: {m.de ?? 'vazio'} → {m.para ?? 'vazio'}
            </li>
          ))}
        </ul>
      ) : null}
      {registro.motivo ? (
        <span className="text-xs text-(--tinta) numero">Motivo: “{registro.motivo}”</span>
      ) : null}
    </li>
  )
}

/**
 * /ocorrencias/:id/auditoria: quem fez o quê e quando na ocorrência, nas etapas, nas evidências,
 * nas conferências e na conferência do arquivo. Só a Gestão; o banco recusa os demais.
 */
export function PaginaAuditoriaOcorrencia() {
  const { id = '' } = useParams()
  const { atual } = useConsultoria()
  const [pagina, setPagina] = useState(0)
  const ehGestao = atual.papel === 'gestao'

  const auditoria = useQuery({
    queryKey: ['ocorrencia', id, 'auditoria', pagina],
    queryFn: () => listarAuditoriaDaOcorrencia(id, pagina),
    enabled: ehGestao,
  })

  const voltar = { para: `/ocorrencias/${id}`, rotulo: 'Ocorrência' }

  if (!ehGestao || (auditoria.isError && ehSemPermissao(auditoria.error))) {
    return (
      <Pagina titulo="Auditoria" voltar={voltar}>
        <SemPermissao />
      </Pagina>
    )
  }

  let conteudo
  if (auditoria.isPending) {
    conteudo = <Carregando rotulo="Carregando a auditoria" linhas={6} />
  } else if (auditoria.isError) {
    conteudo = (
      <EstadoErro
        titulo="Não foi possível carregar a auditoria."
        aoTentarDeNovo={() => void auditoria.refetch()}
      />
    )
  } else if (auditoria.data.registros.length === 0) {
    conteudo = <EstadoVazio icone="list" titulo="Nenhum registro de auditoria." />
  } else {
    const { registros, total } = auditoria.data
    const de = pagina * ITENS_POR_PAGINA_DA_AUDITORIA + 1
    const ate = de + registros.length - 1
    conteudo = (
      <div className="flex flex-col gap-(--e-3)">
        <ol className="flex flex-col" aria-label="Registros de auditoria">
          {registros.map((r) => (
            <Registro key={r.id} registro={r} fuso={atual.fuso} />
          ))}
        </ol>
        <nav aria-label="Páginas da auditoria" className="flex flex-wrap items-center gap-(--e-2)">
          <span className="text-xs text-(--tinta-2) numero">
            {de}–{ate} de {total}
          </span>
          <Botao
            tamanho="compacto"
            disabled={pagina === 0}
            onClick={() => {
              setPagina((p) => p - 1)
            }}
          >
            Anteriores
          </Botao>
          <Botao
            tamanho="compacto"
            disabled={ate >= total}
            onClick={() => {
              setPagina((p) => p + 1)
            }}
          >
            Próximos
          </Botao>
        </nav>
      </div>
    )
  }

  return (
    <Pagina titulo="Auditoria" voltar={voltar}>
      {conteudo}
    </Pagina>
  )
}
