import { formatarDataCivil, type DataCivil } from '@gestao-ambiental/domain'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { Botao } from '@/components/ui/botao'
import { CampoTexto } from '@/components/ui/campo-texto'
import { Icone } from '@/components/ui/icone'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Selo } from '@/components/ui/selo'
import { concluirEtapa, criarEtapa, type Etapa } from '@/lib/api/ocorrencias'
import { mensagemDoErro } from '@/lib/erros'

const classeSelect =
  'h-(--size-control) w-full rounded-(--radius) border border-(--border-input) bg-(--surface-input) px-(--space-100) corpo text-(--text)'

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
      className="flex flex-col gap-(--space-150) rounded-(--radius) border p-(--space-150)"
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
      <fieldset className="flex gap-(--space-200)">
        <legend className="mb-(--space-050) rotulo">Modo</legend>
        {(
          [
            ['trabalho', 'Trabalho'],
            ['espera_externa', 'Espera externa'],
          ] as const
        ).map(([valor, rotulo]) => (
          <label
            key={valor}
            className="inline-flex cursor-pointer items-center gap-(--space-100) corpo"
          >
            <input
              type="radio"
              name="modo-etapa"
              checked={modo === valor}
              onChange={() => {
                setModo(valor)
              }}
              className="size-4 accent-(--brand)"
            />
            {rotulo}
          </label>
        ))}
      </fieldset>
      <div className="grid gap-(--space-150) sm:grid-cols-3">
        {modo === 'trabalho' ? (
          <label className="flex flex-col gap-(--space-050)">
            <span className="rotulo">Responsável</span>
            <select
              className={classeSelect}
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
        <CampoTexto
          rotulo="Meta"
          type="date"
          value={meta}
          onChange={(evento) => {
            setMeta(evento.target.value)
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
      <div className="flex justify-end gap-(--space-100)">
        <Botao
          tamanho="compacto"
          onClick={() => {
            aoTerminar(false)
          }}
        >
          Cancelar
        </Botao>
        <Botao tamanho="compacto" type="submit" aparencia="primario" disabled={salvar.isPending}>
          {salvar.isPending ? 'Salvando…' : 'Adicionar etapa'}
        </Botao>
      </div>
    </form>
  )
}

/** Etapas (DEM-02): passos internos com responsável próprio; espera externa não consome jornada. */
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

  return (
    <section aria-labelledby="titulo-etapas" className="flex flex-col gap-(--space-100)">
      <h2 id="titulo-etapas" className="rotulo-maiusculo text-(--text-subtle)">
        Etapas
      </h2>
      {concluir.isError ? (
        <MensagemSecao role="alert" tom="perigo">
          {mensagemDoErro(concluir.error)}
        </MensagemSecao>
      ) : null}
      {etapas.length === 0 ? (
        <p className="text-xs text-(--text-subtle)">
          Nenhuma etapa. Etapas são opcionais e ajudam a dividir o trabalho.
        </p>
      ) : (
        <ul className="flex flex-col rounded-(--radius) border" aria-label="Etapas">
          {etapas.map((etapa) => (
            <li
              key={etapa.id}
              className="flex items-start gap-(--space-100) border-b px-(--space-150) py-(--space-100) last:border-b-0"
            >
              <Icone
                nome={etapa.concluida ? 'circle-check' : 'clock'}
                rotulo={etapa.concluida ? 'Etapa concluída' : 'Etapa pendente'}
                className={etapa.concluida ? 'mt-0.5 text-(--text-link)' : 'mt-0.5 text-(--icon)'}
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={etapa.concluida ? 'corpo text-(--text-subtle)' : 'corpo'}>
                  {etapa.titulo}
                </span>
                <span className="text-xs text-(--text-subtle)">
                  {[
                    etapa.meta ? `Meta ${formatarDataCivil(etapa.meta).slice(0, 5)}` : null,
                    etapa.responsavelNome ?? etapa.responsavelExterno ?? 'Sem responsável',
                    etapa.horas ? `${String(etapa.horas).replace('.', ',')} h` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <Selo>{etapa.modo === 'trabalho' ? 'Trabalho' : 'Espera externa'}</Selo>
              {!etapa.concluida && podeEditar ? (
                <Botao
                  tamanho="compacto"
                  disabled={concluir.isPending}
                  aria-label={`Concluir etapa ${etapa.titulo}`}
                  onClick={() => {
                    concluir.mutate(etapa.id)
                  }}
                >
                  Concluir etapa
                </Botao>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {podeEditar ? (
        adicionando ? (
          <FormEtapa
            ocorrenciaId={ocorrenciaId}
            membros={membros}
            aoTerminar={(salvou) => {
              setAdicionando(false)
              if (salvou) void aoMudar()
            }}
          />
        ) : (
          <div>
            <Botao
              tamanho="compacto"
              iconeAntes="plus"
              onClick={() => {
                setAdicionando(true)
              }}
            >
              Adicionar etapa
            </Botao>
          </div>
        )
      ) : null}
    </section>
  )
}
