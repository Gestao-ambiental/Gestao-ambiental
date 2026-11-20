import {
  ehDataCivil,
  formatarDataCivil,
  hojeNoFuso,
  type DataCivil,
} from '@gestao-ambiental/domain'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Botao } from '@/components/ui/botao'
import { CampoData } from '@/components/ui/campo-data'
import { CampoTexto } from '@/components/ui/campo-texto'
import { Icone } from '@/components/ui/icone'
import { classeCampo } from '@/components/ui/estilos-campo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { concluirEtapa, criarEtapa, type Etapa } from '@/lib/api/ocorrencias'
import { mensagemDoErro } from '@/lib/erros'
import { cn } from '@/lib/utils'

import { CabecalhoDeSecao, VazioDeSecao } from './pecas'

function dataDe(valor: string): DataCivil | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? (valor as DataCivil) : null
}

function FormEtapa({
  ocorrenciaId,
  membros,
  aoTerminar,
}: {
  ocorrenciaId: string
  membros: readonly { id: string; nome: string }[]
  aoTerminar: (salvou: boolean) => void
}) {
  // Id gerado aqui: repetir depois de erro de rede não cria outra etapa.
  const [id] = useState(() => crypto.randomUUID())
  const { fuso } = useConsultoria().atual
  const [titulo, setTitulo] = useState('')
  const [modo, setModo] = useState<'trabalho' | 'espera_externa'>('trabalho')
  const [responsavelId, setResponsavelId] = useState('')
  const [externo, setExterno] = useState('')
  const [meta, setMeta] = useState('')
  const [horas, setHoras] = useState('')
  const [erroTitulo, setErroTitulo] = useState<string | null>(null)

  const salvar = useMutation({
    mutationFn: () =>
      criarEtapa(id, ocorrenciaId, {
        titulo,
        modo,
        responsavelId: modo === 'trabalho' ? responsavelId || null : null,
        responsavelExterno: modo === 'espera_externa' ? externo : '',
        meta: dataDe(meta),
        horas: modo === 'trabalho' && horas ? Number(horas.replace(',', '.')) : null,
      }),
    onSuccess: () => {
      aoTerminar(true)
    },
  })

  return (
    <form
      noValidate
      aria-label="Nova etapa"
      onSubmit={(evento) => {
        evento.preventDefault()
        if (!titulo.trim()) {
          setErroTitulo('Informe o título')
          return
        }
        salvar.mutate()
      }}
      className="mt-(--e-3) flex flex-col gap-(--e-3) rounded-(--raio-painel) border bg-(--folha) p-(--e-4)"
    >
      {salvar.isError ? (
        <MensagemSecao role="alert" tom="perigo">
          {mensagemDoErro(salvar.error)}
        </MensagemSecao>
      ) : null}
      <CampoTexto
        rotulo="Título da etapa"
        value={titulo}
        erro={erroTitulo ?? undefined}
        onChange={(evento) => {
          setTitulo(evento.target.value)
          setErroTitulo(null)
        }}
      />
      <fieldset className="flex gap-(--e-4)">
        <legend className="mb-(--e-1) rotulo">Modo</legend>
        {(
          [
            ['trabalho', 'Trabalho'],
            ['espera_externa', 'Espera externa'],
          ] as const
        ).map(([valor, rotulo]) => (
          <label key={valor} className="inline-flex cursor-pointer items-center gap-(--e-2) corpo">
            <input
              type="radio"
              name="modo-etapa"
              checked={modo === valor}
              onChange={() => {
                setModo(valor)
              }}
              className="size-4 accent-(--marca-linha)"
            />
            {rotulo}
          </label>
        ))}
      </fieldset>
      <div className="grid gap-(--e-3) sm:grid-cols-3">
        {modo === 'trabalho' ? (
          <label className="flex flex-col gap-(--e-1)">
            <span className="rotulo">Responsável</span>
            <select
              className={classeCampo}
              value={responsavelId}
              onChange={(evento) => {
                setResponsavelId(evento.target.value)
              }}
            >
              <option value="">Sem responsável</option>
              {membros.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <CampoTexto
            rotulo="Quem executa"
            placeholder="Laboratório, órgão…"
            value={externo}
            onChange={(evento) => {
              setExterno(evento.target.value)
            }}
          />
        )}
        <CampoData
          rotulo="Meta"
          hoje={hojeNoFuso(new Date(), fuso)}
          valor={ehDataCivil(meta) ? meta : null}
          aoMudar={(nova) => {
            setMeta(nova ?? '')
          }}
        />
        {modo === 'trabalho' ? (
          <CampoTexto
            rotulo="Horas estimadas"
            inputMode="decimal"
            value={horas}
            onChange={(evento) => {
              setHoras(evento.target.value.replace(/[^\d,.]/g, ''))
            }}
          />
        ) : null}
      </div>
      <div className="flex justify-end gap-(--e-2) max-md:[&>*]:flex-1">
        <Botao
          onClick={() => {
            aoTerminar(false)
          }}
        >
          Cancelar
        </Botao>
        <Botao type="submit" aparencia="primario" disabled={salvar.isPending}>
          {salvar.isPending ? 'Salvando…' : 'Adicionar etapa'}
        </Botao>
      </div>
    </form>
  )
}

function MetaDaEtapa({ etapa }: { etapa: Etapa }) {
  const partes = [
    etapa.modo === 'espera_externa' ? 'Espera externa' : null,
    etapa.responsavelNome ?? etapa.responsavelExterno ?? 'Sem responsável',
    etapa.meta ? `Meta ${formatarDataCivil(etapa.meta).slice(0, 5)}` : null,
    etapa.horas ? `${String(etapa.horas).replace('.', ',')} h` : null,
  ].filter(Boolean)
  return <span className="text-xs text-(--tinta-2) numero">{partes.join(' · ')}</span>
}

/** Caixa do checklist: cheia com check (feita), vazada (pendente). */
function Caixa({ feita, destaque = false }: { feita: boolean; destaque?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-5 shrink-0 items-center justify-center rounded-(--raio-mini) border-2 transicao-estado',
        feita
          ? 'border-(--marca-linha) bg-(--marca-linha) text-(--folha)'
          : 'border-(--campo-borda) text-(--marca-linha) group-hover:border-(--marca-linha)',
        destaque && 'border-(--marca-linha)',
      )}
    >
      <Icone
        nome="check"
        tamanho={12}
        className={feita ? undefined : 'opacity-0 transicao-estado group-hover:opacity-100'}
      />
    </span>
  )
}

/**
 * Etapas (DEM-02) como checklist: marcar a caixa conclui a etapa. Passos internos com
 * responsável próprio; espera externa não consome jornada.
 */
export function SecaoEtapas({
  ocorrenciaId,
  etapas,
  membros,
  podeEditar,
  aoMudar,
}: {
  ocorrenciaId: string
  etapas: readonly Etapa[]
  membros: readonly { id: string; nome: string }[]
  podeEditar: boolean
  aoMudar: () => Promise<void>
}) {
  const [adicionando, setAdicionando] = useState(false)
  const concluir = useMutation({ mutationFn: concluirEtapa, onSuccess: aoMudar })
  const feitas = etapas.filter((e) => e.concluida).length
  const proximaId = etapas.find((e) => !e.concluida)?.id

  return (
    <section aria-labelledby="titulo-etapas" className="flex flex-col">
      <CabecalhoDeSecao
        id="titulo-etapas"
        titulo="Etapas"
        contagem={etapas.length > 0 ? `${String(feitas)} de ${String(etapas.length)}` : null}
        acao={
          podeEditar && !adicionando ? (
            <Botao
              aparencia="sutil"
              tamanho="compacto"
              iconeAntes="plus"
              onClick={() => {
                setAdicionando(true)
              }}
            >
              Adicionar etapa
            </Botao>
          ) : null
        }
      />
      {concluir.isError ? (
        <MensagemSecao role="alert" tom="perigo" className="mt-(--e-2)">
          {mensagemDoErro(concluir.error)}
        </MensagemSecao>
      ) : null}
      {etapas.length === 0 ? (
        adicionando ? null : (
          <VazioDeSecao>Nenhuma etapa.</VazioDeSecao>
        )
      ) : (
        <ul className="flex flex-col" aria-label="Etapas">
          {etapas.map((etapa) => {
            const marcavel = !etapa.concluida && podeEditar
            return (
              <li
                key={etapa.id}
                className="flex min-h-(--linha) items-center gap-(--e-2) border-b border-(--regra-leve) py-(--e-1)"
              >
                {marcavel ? (
                  <button
                    type="button"
                    disabled={concluir.isPending}
                    aria-label={`Concluir etapa ${etapa.titulo}`}
                    title="Concluir etapa"
                    onClick={() => {
                      concluir.mutate(etapa.id)
                    }}
                    className="group -ml-(--e-3) inline-flex size-(--controle-toque) shrink-0 cursor-pointer items-center justify-center rounded-(--raio) transicao-estado hover:bg-(--toque) disabled:cursor-wait"
                  >
                    <Caixa feita={false} destaque={etapa.id === proximaId} />
                  </button>
                ) : (
                  <span className="-ml-(--e-3) inline-flex size-(--controle-toque) shrink-0 items-center justify-center">
                    <Caixa feita={etapa.concluida} />
                  </span>
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span
                    className={
                      etapa.concluida ? 'corpo text-(--tinta-2)' : 'corpo-medio text-(--tinta)'
                    }
                  >
                    <span className="sr-only">{etapa.concluida ? 'Feita: ' : 'Pendente: '}</span>
                    {etapa.titulo}
                  </span>
                  <MetaDaEtapa etapa={etapa} />
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {podeEditar && adicionando ? (
        <FormEtapa
          ocorrenciaId={ocorrenciaId}
          membros={membros}
          aoTerminar={(salvou) => {
            setAdicionando(false)
            if (salvou) void aoMudar()
          }}
        />
      ) : null}
    </section>
  )
}
