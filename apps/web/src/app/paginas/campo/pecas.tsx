// Peças comuns das telas de Campo (ADR-0033): coluna única centrada, barra de ação fixa no rodapé,
// voltar, selo da situação, estados da vistoria, observação geral e miniaturas.

import {
  LIMITES_DA_VISTORIA,
  ROTULO_DA_SITUACAO_DA_VISTORIA,
  type SituacaoDaVistoria,
} from '@gestao-ambiental/domain'
import { type UseQueryResult } from '@tanstack/react-query'
import { useEffect, useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Carregando, EstadoErro, EstadoVazio, SemPermissao } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { classeAreaTexto } from '@/components/ui/estilos-campo'
import { Icone } from '@/components/ui/icone'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Selo, type TomSelo } from '@/components/ui/selo'
import type { FotoDaVistoria, Vistoria } from '@/lib/api/vistorias'
import { filaDeCampo, type Pendencia } from '@/lib/campo/fila'
import { ehSemPermissao, mensagemDoErroDaVistoria } from '@/lib/erros'
import { cn } from '@/lib/utils'

import {
  situacaoDasPendencias,
  useRascunhoDaVistoria,
  type FotoDoAparelho,
  type SituacaoNoAparelho,
} from './rascunho'

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
  // Sem sinal a releitura falha, mas a vistoria já lida continua na tela (ADR-0060).
  if (consulta.isError && consulta.data === undefined) {
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

const ROTULO_NO_APARELHO: Record<Exclude<SituacaoNoAparelho, 'recusado'>, string> = {
  servidor: 'Salvo no servidor',
  no_aparelho: 'No aparelho, falta enviar',
  enviando: 'Enviando…',
}

/**
 * Onde está o registro (ADR-0060): "Salvo no servidor", "No aparelho, falta enviar", "Enviando…"
 * ou "Não enviado" com o motivo da recusa. Nunca diz que salvou no servidor o que não chegou.
 */
export function SituacaoDoEnvio({
  pendencias,
  noServidor,
  erroNoAparelho = false,
  aoGravarDeNovo,
}: {
  pendencias: readonly Pendencia[]
  /** Há algo deste registro já gravado no servidor? */
  noServidor: boolean
  /** Não coube no aparelho (armazenamento cheio ou bloqueado). */
  erroNoAparelho?: boolean
  aoGravarDeNovo?: () => void
}) {
  const situacao = situacaoDasPendencias(pendencias) ?? (noServidor ? 'servidor' : null)
  const recusada = pendencias.find((p) => p.estado === 'recusado')
  return (
    <div role="status" aria-live="polite" className="flex min-h-5 items-center gap-(--e-2)">
      {erroNoAparelho ? (
        <span className="inline-flex flex-wrap items-center gap-(--e-2) rotulo text-(--atraso-texto)">
          <Icone nome="circle-alert" tamanho={12} />
          Não salvou no aparelho
          {aoGravarDeNovo ? (
            <Botao tamanho="compacto" onClick={aoGravarDeNovo}>
              Tentar de novo
            </Botao>
          ) : null}
        </span>
      ) : situacao === 'recusado' && recusada ? (
        <span className="inline-flex flex-wrap items-center gap-(--e-2) rotulo text-(--atraso-texto)">
          <Icone nome="circle-alert" tamanho={12} />
          Não enviado: {mensagemDoErroDaVistoria(recusada.erro)}
          <Botao tamanho="compacto" onClick={() => void filaDeCampo.tentarDeNovo()}>
            Tentar de novo
          </Botao>
          <Botao
            tamanho="compacto"
            aparencia="sutil"
            onClick={() => {
              for (const p of pendencias)
                if (p.estado === 'recusado') void filaDeCampo.descartar(p.id)
            }}
          >
            Descartar
          </Botao>
        </span>
      ) : situacao === 'servidor' ? (
        <span className="inline-flex items-center gap-(--e-1) rotulo text-(--ok-texto)">
          <Icone nome="check" tamanho={12} />
          {ROTULO_NO_APARELHO.servidor}
        </span>
      ) : situacao === 'no_aparelho' ? (
        <span className="inline-flex items-center gap-(--e-1) rotulo text-(--alerta-texto)">
          <Icone nome="upload" tamanho={12} />
          {ROTULO_NO_APARELHO.no_aparelho}
        </span>
      ) : situacao === 'enviando' ? (
        <span className="rotulo">{ROTULO_NO_APARELHO.enviando}</span>
      ) : null}
    </div>
  )
}

/** Quanto falta enviar desta vistoria, com "Enviar agora"; sem nada no aparelho, "Tudo salvo". */
export function PainelDoEnvio({ vistoriaId }: { vistoriaId: string }) {
  const rascunho = useRascunhoDaVistoria(vistoriaId)
  if (!rascunho.carregado) return null
  const { total } = rascunho.contagem
  const recusados = rascunho.pendencias.filter((p) => p.estado === 'recusado').length
  const enviando = rascunho.pendencias.some((p) => p.estado === 'enviando')
  return (
    <div role="status" aria-live="polite">
      {total === 0 ? (
        <p className="inline-flex items-center gap-(--e-2) corpo-medio text-(--ok-texto)">
          <Icone nome="circle-check" />
          Tudo salvo no servidor
        </p>
      ) : (
        <MensagemSecao
          tom={recusados > 0 ? 'perigo' : 'atencao'}
          titulo={`${String(total)} ${total === 1 ? 'registro' : 'registros'} no aparelho, falta enviar`}
          acoes={
            <Botao
              tamanho="compacto"
              iconeAntes="upload"
              disabled={enviando}
              onClick={() => void filaDeCampo.tentarDeNovo()}
            >
              Enviar agora
            </Botao>
          }
        >
          {enviando
            ? 'Enviando…'
            : rascunho.semConexao
              ? 'Sem conexão. Envia sozinho quando o sinal voltar.'
              : recusados > 0
                ? `${String(recusados)} ${recusados === 1 ? 'recusado' : 'recusados'} pelo servidor.`
                : 'Envia sozinho quando a conexão responder.'}
        </MensagemSecao>
      )}
    </div>
  )
}

/**
 * Observação geral: ao sair do campo, se mudou, grava no aparelho e entra na fila de envio. Só
 * leitura quando a vistoria não aceita registro.
 */
export function CampoObservacao({ vistoria, editavel }: { vistoria: Vistoria; editavel: boolean }) {
  const id = useId()
  const rascunho = useRascunhoDaVistoria(vistoria.id)
  const pendencias = rascunho.daObservacao()
  const local = pendencias[0]?.registro
  const base = (local?.tipo === 'observacao' ? local.observacao : vistoria.observacao) ?? ''
  const [texto, setTexto] = useState<string | null>(null)
  const [erroNoAparelho, setErroNoAparelho] = useState(false)
  const valor = texto ?? base

  function gravar() {
    if (valor === base && !erroNoAparelho) return
    filaDeCampo
      .registrar({
        tipo: 'observacao',
        vistoriaId: vistoria.id,
        observacao: valor.trim() || null,
        registradoEm: new Date().toISOString(),
      })
      .then(
        () => {
          setErroNoAparelho(false)
          setTexto(null)
        },
        () => {
          setErroNoAparelho(true)
        },
      )
  }

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
        value={valor}
        className={classeAreaTexto}
        onChange={(evento) => {
          setTexto(evento.target.value)
        }}
        onBlur={gravar}
      />
      <SituacaoDoEnvio
        pendencias={pendencias}
        noServidor={false}
        erroNoAparelho={erroNoAparelho}
        aoGravarDeNovo={gravar}
      />
    </div>
  )
}

export function Miniaturas({
  fotos,
  urls,
  doAparelho = [],
  className,
}: {
  fotos: readonly FotoDaVistoria[]
  urls: Readonly<Record<string, string>> | undefined
  /** Fotos ainda não enviadas: borda tracejada, ícone de envio e "falta enviar" no nome. */
  doAparelho?: readonly FotoDoAparelho[]
  className?: string
}) {
  if (fotos.length === 0 && doAparelho.length === 0) return null
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
      {doAparelho.map((foto, indice) => {
        const alt = `${foto.legenda ?? `Foto ${String(fotos.length + indice + 1)}`} (no aparelho, falta enviar)`
        return (
          <li
            key={foto.id}
            className="relative size-16 overflow-hidden rounded-(--raio) border border-dashed border-(--alerta-texto) bg-(--off)"
          >
            {foto.url ? (
              <img src={foto.url} alt={alt} className="size-full object-cover" />
            ) : (
              <span
                role="img"
                aria-label={alt}
                className="flex size-full items-center justify-center text-(--icone)"
              >
                <Icone nome="image" />
              </span>
            )}
            <span className="absolute right-0.5 bottom-0.5 flex size-5 items-center justify-center rounded-(--raio-mini) bg-(--alerta-fundo) text-(--alerta-texto)">
              <Icone nome="upload" tamanho={12} />
            </span>
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
