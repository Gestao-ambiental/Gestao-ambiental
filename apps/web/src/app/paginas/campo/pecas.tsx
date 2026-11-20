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
import { classeAreaTexto } from '@/components/ui/estilos-campo'
import { Icone } from '@/components/ui/icone'
import { Selo, type TomSelo } from '@/components/ui/selo'
import { salvarObservacaoDaVistoria, type FotoDaVistoria, type Vistoria } from '@/lib/api/vistorias'
import { ehSemPermissao, mensagemDoErroDaVistoria } from '@/lib/erros'
import { cn } from '@/lib/utils'

import { useRecarregarVistoria } from './consultas'

/**
 * Coluna do campo: estreita (formulário de uma mão) ou larga (detalhe com dados ao lado).
 * `comBarra`: no celular, a coluna ocupa a altura útil (tela menos barra superior de 56px, barra
 * inferior de 64px e o respiro de cima) para a `BarraDeAcao` ficar no rodapé mesmo em tela curta.
 */
export function ColunaCampo({
  children,
  larga = false,
  comBarra = false,
}: {
  children: ReactNode
  larga?: boolean
  comBarra?: boolean
}) {
  return (
    <div
      className={cn(
        'mx-auto flex w-full flex-col gap-(--e-6)',
        larga ? 'max-w-[1040px]' : 'max-w-[720px]',
        comBarra && 'max-md:min-h-[calc(100dvh-140px)] *:flex-1',
      )}
    >
      {children}
    </div>
  )
}

/**
 * Ações da tela, presas ao rodapé enquanto a página rola: no celular, faixa de largura total acima
 * da barra inferior (polegar); no desktop, botões no tamanho natural, à direita.
 */
export function BarraDeAcao({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-(--e-4) mt-auto flex gap-(--e-2) border-t border-(--regra-forte) bg-(--folha) px-(--e-4) py-(--e-3) md:mx-0 md:justify-end md:bg-(--chao) md:px-0">
      {children}
    </div>
  )
}

/** Voltar dos estados (carregando, erro, não encontrada), no mesmo desenho do `voltar` da Pagina. */
export function VoltarPara({ para, rotulo }: { para: string; rotulo: string }) {
  return (
    <Link
      to={para}
      className="inline-flex min-h-(--controle-toque) w-fit items-center gap-(--e-1) rounded-(--raio-mini) corpo-medio text-(--tinta-2) no-underline hover:text-(--tinta) hover:no-underline"
    >
      <Icone nome="chevron-left" />
      {rotulo}
    </Link>
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
    <div role="status" aria-live="polite" className="flex min-h-5 items-center gap-(--e-2)">
      {estado === 'salvando' ? (
        <span className="rotulo">Salvando…</span>
      ) : estado === 'salvo' ? (
        <span className="inline-flex items-center gap-(--e-1) rotulo text-(--ok-texto)">
          <Icone nome="check" tamanho={12} />
          Salvo
        </span>
      ) : estado === 'erro' ? (
        <span className="inline-flex flex-wrap items-center gap-(--e-2) rotulo text-(--atraso-texto)">
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
      <section aria-labelledby={id} className="flex flex-col gap-(--e-2)">
        <h2 id={id} className="titulo-secao text-(--tinta)">
          Observação geral
        </h2>
        <p className="corpo whitespace-pre-line text-(--tinta)">
          {vistoria.observacao ?? <span className="text-(--tinta-3)">Sem observação</span>}
        </p>
      </section>
    )
  }

  return (
    <div className="flex flex-col gap-(--e-2)">
      <label htmlFor={id} className="titulo-secao text-(--tinta)">
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
    <ul aria-label="Fotos" className={cn('flex flex-wrap gap-(--e-2)', className)}>
      {fotos.map((foto, indice) => {
        const url = urls?.[foto.caminho]
        const alt = foto.legenda ?? `Foto ${String(indice + 1)}`
        return (
          <li key={foto.id} className="size-16 overflow-hidden rounded-(--raio) border bg-(--off)">
            {url ? (
              <img src={url} alt={alt} className="size-full object-cover" />
            ) : (
              <span
                role="img"
                aria-label={alt}
                className="flex size-full items-center justify-center text-(--icone)"
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

/**
 * Progresso "x de y itens" em número grande e barra. `fixa` prende no topo enquanto o checklist
 * rola, para quem está em campo saber sempre quanto falta.
 */
export function BarraDeProgresso({
  registrados,
  total,
  percentual,
  fixa = false,
}: {
  registrados: number
  total: number
  percentual: number
  fixa?: boolean
}) {
  const id = useId()
  const completo = total > 0 && registrados === total
  return (
    <div
      className={cn(
        'flex flex-col gap-(--e-2)',
        fixa && 'sticky top-0 z-10 -mx-(--e-4) bg-(--chao) px-(--e-4) py-(--e-3) md:mx-0 md:px-0',
      )}
    >
      <div className="flex items-baseline justify-between gap-(--e-3)">
        <span id={id} className="titulo-secao numero text-(--tinta)">
          {registrados} de {total} {total === 1 ? 'item' : 'itens'}
        </span>
        <span
          className={cn('corpo-medio numero', completo ? 'text-(--ok-texto)' : 'text-(--tinta-2)')}
        >
          {percentual}%
        </span>
      </div>
      <div
        role="progressbar"
        aria-labelledby={id}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentual}
        className="h-2 overflow-hidden rounded-(--raio-mini) bg-(--aperto)"
      >
        <div
          className="h-full bg-(--acao) transicao-estado"
          style={{ width: `${String(percentual)}%` }}
        />
      </div>
    </div>
  )
}
