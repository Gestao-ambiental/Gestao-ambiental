// Peças comuns das telas de Campo (ADR-0033): coluna única centrada, barra de ação fixa no rodapé,
// voltar, selo da situação, estados da vistoria, observação geral e miniaturas.

import {
  LIMITES_DA_VISTORIA,
  ROTULO_DA_SITUACAO_DA_VISTORIA,
  type SituacaoDaVistoria,
} from '@gestao-ambiental/domain'
import { useMutation, type UseQueryResult } from '@tanstack/react-query'
import { useEffect, useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { Icone } from '@/components/ui/icone'
import { Selo, type TomSelo } from '@/components/ui/selo'
import { salvarObservacaoDaVistoria, type FotoDaVistoria, type Vistoria } from '@/lib/api/vistorias'
import { ehSemPermissao, mensagemDoErroDaVistoria } from '@/lib/erros'
import { cn } from '@/lib/utils'

import { useRecarregarVistoria } from './consultas'
import { classeAreaTexto } from './estilos'

export function ColunaCampo({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-(--space-200)">{children}</div>
  )
}

/** Ações da tela, presas ao rodapé enquanto a página rola (uso com uma mão). */
export function BarraDeAcao({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-(--space-200) flex gap-(--space-100) border-t bg-(--surface) px-(--space-200) py-(--space-150) md:mx-0 md:rounded-(--radius-large) md:border">
      {children}
    </div>
  )
}

export function VoltarPara({ para, rotulo }: { para: string; rotulo: string }) {
  return (
    <nav aria-label="Caminho" className="flex items-center gap-(--space-050) corpo">
      <Link
        to={para}
        aria-label={`Voltar para ${rotulo}`}
        title={`Voltar para ${rotulo}`}
        className="inline-flex size-11 items-center justify-center rounded-(--radius) text-(--icon) transicao-estado hover:bg-(--neutral-subtle-hover)"
      >
        <Icone nome="chevron-left" />
      </Link>
      <Link to={para}>{rotulo}</Link>
    </nav>
  )
}

const TOM_DA_SITUACAO: Record<SituacaoDaVistoria, TomSelo> = {
  planejada: 'padrao',
  em_andamento: 'andamento',
  enviada: 'revisao',
  devolvida: 'perigo',
  aprovada: 'sucesso',
  cancelada: 'padrao',
}

export function SeloDaVistoria({ situacao }: { situacao: SituacaoDaVistoria }) {
  return <Selo tom={TOM_DA_SITUACAO[situacao]}>{ROTULO_DA_SITUACAO_DA_VISTORIA[situacao]}</Selo>
}

/** Carregando, erro, sem permissão e não encontrada; com a vistoria, desenha `children`. */
export function ComVistoria({
  consulta,
  voltar,
  children,
}: {
  consulta: UseQueryResult<Vistoria | null>
  voltar: ReactNode
  children: (vistoria: Vistoria) => ReactNode
}) {
  const { atual } = useConsultoria()
  const titulo = consulta.data?.titulo
  useEffect(() => {
    document.title = `${titulo ?? 'Vistoria'} · Grama`
  }, [titulo])

  if (consulta.isPending) {
    return (
      <ColunaCampo>
        {voltar}
        <Carregando rotulo="Carregando a vistoria" linhas={5} />
      </ColunaCampo>
    )
  }
  if (consulta.isError) {
    return (
      <ColunaCampo>
        {voltar}
        {ehSemPermissao(consulta.error) ? (
          <SemPermissao />
        ) : (
          <EstadoErro
            titulo="Não foi possível carregar a vistoria."
            aoTentarDeNovo={() => void consulta.refetch()}
          />
        )}
      </ColunaCampo>
    )
  }
  if (!consulta.data) {
    // Inexistente ou de outra consultoria: a RLS não distingue, e a tela também não.
    return (
      <ColunaCampo>
        {voltar}
        <h1 className="sr-only">Vistoria não encontrada</h1>
        <EstadoVazio
          icone="file-text"
          titulo="Vistoria não encontrada"
          descricao={`Ela não existe ou não é da ${atual.consultoriaNome}.`}
          acaoPrincipal={
            <Botao aparencia="primario" asChild>
              <Link to="/campo">Minhas vistorias</Link>
            </Botao>
          }
        />
      </ColunaCampo>
    )
  }
  return <>{children(consulta.data)}</>
}

export type EstadoDaGravacao = 'salvando' | 'salvo' | 'erro' | null

/** "Salvando…", "Salvo" ou "Não salvou" com "Tentar de novo": nunca diz que salvou o que não chegou. */
export function SituacaoDaGravacao({
  estado,
  erro,
  aoTentarDeNovo,
}: {
  estado: EstadoDaGravacao
  erro?: unknown
  aoTentarDeNovo: () => void
}) {
  return (
    <div role="status" aria-live="polite" className="flex min-h-5 items-center gap-(--space-100)">
      {estado === 'salvando' ? (
        <span className="text-xs text-(--text-subtle)">Salvando…</span>
      ) : estado === 'salvo' ? (
        <span className="inline-flex items-center gap-(--space-050) text-xs text-(--text-subtle)">
          <Icone nome="check" tamanho={12} />
          Salvo
        </span>
      ) : estado === 'erro' ? (
        <span className="inline-flex flex-wrap items-center gap-(--space-100) text-xs text-(--text-danger)">
          <Icone nome="circle-alert" tamanho={12} />
          Não salvou{erro ? `: ${mensagemDoErroDaVistoria(erro)}` : ''}
          <Botao tamanho="compacto" onClick={aoTentarDeNovo}>
            Tentar de novo
          </Botao>
        </span>
      ) : null}
    </div>
  )
}

/** Observação geral: grava ao sair do campo, se mudou. Só leitura quando a vistoria não aceita registro. */
export function CampoObservacao({ vistoria, editavel }: { vistoria: Vistoria; editavel: boolean }) {
  const id = useId()
  const recarregar = useRecarregarVistoria(vistoria.id)
  const [texto, setTexto] = useState(vistoria.observacao ?? '')
  const [gravado, setGravado] = useState(vistoria.observacao ?? '')
  const salvar = useMutation({
    mutationFn: (valor: string) => salvarObservacaoDaVistoria(vistoria.id, valor.trim() || null),
    onSuccess: (_, valor) => {
      setGravado(valor)
      void recarregar()
    },
  })

  if (!editavel) {
    return (
      <section aria-labelledby={id} className="flex flex-col gap-(--space-050)">
        <h2 id={id} className="rotulo">
          Observação geral
        </h2>
        <p className="corpo whitespace-pre-line">
          {vistoria.observacao ?? <span className="text-(--text-subtlest)">Sem observação</span>}
        </p>
      </section>
    )
  }

  return (
    <div className="flex flex-col gap-(--space-050)">
      <label htmlFor={id} className="rotulo">
        Observação geral
      </label>
      <textarea
        id={id}
        rows={3}
        maxLength={LIMITES_DA_VISTORIA.observacao}
        value={texto}
        className={classeAreaTexto}
        onChange={(evento) => {
          setTexto(evento.target.value)
        }}
        onBlur={() => {
          if (texto !== gravado) salvar.mutate(texto)
        }}
      />
      <SituacaoDaGravacao
        estado={
          salvar.isPending
            ? 'salvando'
            : salvar.isError
              ? 'erro'
              : salvar.isSuccess
                ? 'salvo'
                : null
        }
        erro={salvar.error}
        aoTentarDeNovo={() => {
          salvar.mutate(texto)
        }}
      />
    </div>
  )
}

export function Miniaturas({
  fotos,
  urls,
  className,
}: {
  fotos: readonly FotoDaVistoria[]
  urls: Readonly<Record<string, string>> | undefined
  className?: string
}) {
  if (fotos.length === 0) return null
  return (
    <ul aria-label="Fotos" className={cn('flex flex-wrap gap-(--space-075)', className)}>
      {fotos.map((foto, indice) => {
        const url = urls?.[foto.caminho]
        const alt = foto.legenda ?? `Foto ${String(indice + 1)}`
        return (
          <li
            key={foto.id}
            className="size-14 overflow-hidden rounded-(--radius) border bg-(--surface-disabled)"
          >
            {url ? (
              <img src={url} alt={alt} className="size-full object-cover" />
            ) : (
              <span
                role="img"
                aria-label={alt}
                className="flex size-full items-center justify-center text-(--icon)"
              >
                <Icone nome="image" />
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export function BarraDeProgresso({
  registrados,
  total,
  percentual,
}: {
  registrados: number
  total: number
  percentual: number
}) {
  return (
    <div className="flex flex-col gap-(--space-050)">
      <div className="flex justify-between corpo-medio">
        <span id="rotulo-progresso">
          {registrados} de {total} {total === 1 ? 'item' : 'itens'}
        </span>
        <span className="text-(--text-subtle)">{percentual}%</span>
      </div>
      <div
        role="progressbar"
        aria-labelledby="rotulo-progresso"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentual}
        className="h-1.5 overflow-hidden rounded-(--radius-pill) bg-(--surface-disabled)"
      >
        <div className="h-full bg-(--brand)" style={{ width: `${String(percentual)}%` }} />
      </div>
    </div>
  )
}
