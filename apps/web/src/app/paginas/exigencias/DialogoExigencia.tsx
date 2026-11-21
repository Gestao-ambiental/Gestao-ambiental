import { zodResolver } from '@hookform/resolvers/zod'
import {
  DIAS_MAXIMOS_DA_EXIGENCIA,
  formatarDataCivil,
  hojeNoFuso,
  metaInternaSugerida,
  metaInternaValida,
  prazoDaExigencia,
  type DataCivil,
  type UnidadePrazo,
} from '@gestao-ambiental/domain'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useId, useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Botao } from '@/components/ui/botao'
import { CampoData } from '@/components/ui/campo-data'
import { CampoTexto } from '@/components/ui/campo-texto'
import { Dialogo } from '@/components/ui/dialogo'
import { classeAreaTexto, classeCampo } from '@/components/ui/estilos-campo'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import { Segmentado } from '@/components/ui/segmentado'
import { SeletorPessoa } from '@/components/ui/seletor-pessoa'
import { listarEmpreendimentos, listarUnidades, type Unidade } from '@/lib/api/empreendimentos'
import {
  editarExigencia,
  listarLicencasParaExigencia,
  registrarExigencia,
  type Exigencia,
} from '@/lib/api/exigencias'
import { listarMembrosAtivos } from '@/lib/api/licencas'
import { mensagemDoErro } from '@/lib/erros'

import { CampoPdf, ErroDoCampo } from './pecas'

export type ModoDaExigencia =
  | {
      tipo: 'novo'
      /** Vindo do Empreendimento: empreendimento e unidades já escolhidos. */
      empreendimento?: { id: string; nome: string }
      unidades?: readonly Unidade[]
    }
  | { tipo: 'editar'; exigencia: Exigencia }

interface Props {
  modo: ModoDaExigencia
  aoFechar: () => void
  aoSalvar: (exigenciaId: string) => void | Promise<void>
}

const textoOpcional = (maximo: number) =>
  z
    .string()
    .trim()
    .max(maximo, `Use até ${String(maximo)} caracteres`)

const LIMITE_DIAS = `Prazo: de 1 a ${String(DIAS_MAXIMOS_DA_EXIGENCIA)} dias.`

const textos = {
  numeroProcesso: textoOpcional(60),
  orgao: textoOpcional(120),
  numeroOficio: textoOpcional(60),
  assunto: z
    .string()
    .trim()
    .min(1, 'Informe o assunto')
    .max(300, 'Use até 300 caracteres no assunto'),
  notas: textoOpcional(4000),
}

/** Quantidade de dias digitada: inteiro de 1 a 365, ou null. */
function lerDias(texto: string): number | null {
  if (!/^\d{1,3}$/.test(texto.trim())) return null
  const dias = Number(texto.trim())
  return dias >= 1 && dias <= DIAS_MAXIMOS_DA_EXIGENCIA ? dias : null
}

interface PrazoNaTela {
  modoPrazo: 'dias' | 'data'
  recebidoEm: string | null
  dias: string
  contagem: UnidadePrazo
  prazoData: string | null
}

/** Prazo oficial pelo que está na tela: calculado pelo domínio ou a data informada. */
function prazoDaTela(v: PrazoNaTela): DataCivil | null {
  if (!v.recebidoEm) return null
  if (v.modoPrazo === 'data') return (v.prazoData as DataCivil | null) ?? null
  const dias = lerDias(v.dias)
  if (dias === null) return null
  return prazoDaExigencia(v.recebidoEm as DataCivil, dias, v.contagem).prazoOficial
}

/**
 * Registrar ou editar uma exigência do órgão (ADR-0045). No registro: unidade, licença opcional,
 * dados do ofício, recebimento, prazo (em dias, calculado pelo domínio, ou a data informada), meta
 * interna sugerida e editável, responsável e PDF opcional. Na edição só os textos e a meta.
 */
export function DialogoExigencia({ modo, aoFechar, aoSalvar }: Props) {
  return modo.tipo === 'editar' ? (
    <FormularioDeEdicao exigencia={modo.exigencia} aoFechar={aoFechar} aoSalvar={aoSalvar} />
  ) : (
    <FormularioDeRegistro
      empreendimento={modo.empreendimento}
      unidadesDadas={modo.unidades}
      aoFechar={aoFechar}
      aoSalvar={aoSalvar}
    />
  )
}

function Rodape({
  formulario,
  salvando,
  rotulo,
  aoFechar,
}: {
  formulario: string
  salvando: boolean
  rotulo: string
  aoFechar: () => void
}) {
  return (
    <>
      <Botao onClick={aoFechar}>Cancelar</Botao>
      <Botao type="submit" form={formulario} aparencia="primario" disabled={salvando}>
        {salvando ? 'Salvando…' : rotulo}
      </Botao>
    </>
  )
}

function Rotulo({ htmlFor, children }: { htmlFor: string; children: string }) {
  return (
    <label htmlFor={htmlFor} className="flex min-h-5 items-center rotulo text-(--tinta)">
      {children}
    </label>
  )
}

function FormularioDeRegistro({
  empreendimento,
  unidadesDadas,
  aoFechar,
  aoSalvar,
}: {
  empreendimento?: { id: string; nome: string }
  unidadesDadas?: readonly Unidade[]
  aoFechar: () => void
  aoSalvar: (exigenciaId: string) => void | Promise<void>
}) {
  const { atual } = useConsultoria()
  const cid = atual.consultoriaId
  const hoje = hojeNoFuso(new Date(), atual.fuso)
  const ids = useId()
  const formulario = `${ids}-formulario`
  // Gerados uma vez por abertura: repetir depois de erro de rede não registra outra exigência.
  const [exigenciaId] = useState(() => crypto.randomUUID())
  // Arquivo novo, versão nova: o Storage não sobrescreve o objeto de uma tentativa anterior.
  const [versaoId, setVersaoId] = useState(() => crypto.randomUUID())
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [erroDoPdf, setErroDoPdf] = useState<string | undefined>()
  const [metaEditada, setMetaEditada] = useState(false)

  const esquema = useMemo(
    () =>
      z
        .object({
          empreendimentoId: z.string().min(1, 'Escolha o empreendimento'),
          unidadeId: z.string().min(1, 'Escolha a unidade'),
          instrumentoId: z.string(),
          ...textos,
          recebidoEm: z.string().nullable(),
          modoPrazo: z.enum(['dias', 'data']),
          dias: z.string(),
          contagem: z.enum(['corridos', 'uteis']),
          prazoData: z.string().nullable(),
          metaInterna: z.string().nullable(),
          responsavelId: z.string().nullable(),
        })
        .superRefine((v, ctx) => {
          if (!v.recebidoEm) {
            ctx.addIssue({
              code: 'custom',
              path: ['recebidoEm'],
              message: 'Informe a data de recebimento',
            })
            return
          }
          if (v.recebidoEm > hoje) {
            ctx.addIssue({
              code: 'custom',
              path: ['recebidoEm'],
              message: 'A data de recebimento não pode estar no futuro',
            })
          }
          if (v.modoPrazo === 'dias' && lerDias(v.dias) === null) {
            ctx.addIssue({ code: 'custom', path: ['dias'], message: LIMITE_DIAS })
          }
          if (v.modoPrazo === 'data') {
            if (!v.prazoData) {
              ctx.addIssue({ code: 'custom', path: ['prazoData'], message: 'Informe o prazo' })
            } else if (v.prazoData <= v.recebidoEm) {
              ctx.addIssue({
                code: 'custom',
                path: ['prazoData'],
                message: 'O prazo precisa ser depois do recebimento',
              })
            }
          }
          const prazo = prazoDaTela(v)
          if (!v.metaInterna) {
            ctx.addIssue({
              code: 'custom',
              path: ['metaInterna'],
              message: 'Informe a meta interna',
            })
          } else if (
            prazo &&
            !metaInternaValida(v.metaInterna as DataCivil, v.recebidoEm as DataCivil, prazo)
          ) {
            ctx.addIssue({
              code: 'custom',
              path: ['metaInterna'],
              message: 'A meta interna fica entre o recebimento e o prazo',
            })
          }
        }),
    [hoje],
  )
  type Dados = z.infer<typeof esquema>

  const unidadeInicial = unidadesDadas?.length === 1 ? (unidadesDadas[0]?.id ?? '') : ''
  const {
    register,
    handleSubmit,
    control,
    setValue,
    getValues,
    formState: { errors, isSubmitted },
  } = useForm<Dados>({
    resolver: zodResolver(esquema),
    defaultValues: {
      empreendimentoId: empreendimento?.id ?? '',
      unidadeId: unidadeInicial,
      instrumentoId: '',
      numeroProcesso: '',
      orgao: '',
      numeroOficio: '',
      assunto: '',
      notas: '',
      recebidoEm: null,
      modoPrazo: 'dias',
      dias: '',
      contagem: 'corridos',
      prazoData: null,
      metaInterna: null,
      responsavelId: null,
    },
  })
  // Todos os campos têm valor inicial: o parcial do useWatch vem sempre completo.
  const v = useWatch({ control }) as Dados
  const opcoes = { shouldValidate: isSubmitted }

  const empreendimentos = useQuery({
    queryKey: ['empreendimentos', cid, '', 'exigencia'],
    queryFn: () => listarEmpreendimentos(cid, '', 0),
    enabled: !empreendimento,
  })
  const unidadesConsultadas = useQuery({
    queryKey: ['unidades', v.empreendimentoId],
    queryFn: () => listarUnidades(v.empreendimentoId),
    enabled: !unidadesDadas && v.empreendimentoId !== '',
  })
  const unidades = unidadesDadas ?? unidadesConsultadas.data ?? []
  const licencas = useQuery({
    queryKey: ['licencas-para-exigencia', v.empreendimentoId],
    queryFn: () => listarLicencasParaExigencia(v.empreendimentoId),
    enabled: v.empreendimentoId !== '',
  })
  const licencasDaUnidade = (licencas.data ?? []).filter((l) => l.unidadeId === v.unidadeId)
  const membros = useQuery({
    queryKey: ['membros-ativos', cid],
    queryFn: () => listarMembrosAtivos(cid),
  })

  // Unidade única: escolhida sozinha quando a lista chega.
  const unicaUnidade = unidades.length === 1 ? unidades[0]?.id : undefined
  useEffect(() => {
    if (unicaUnidade && !getValues('unidadeId')) {
      setValue('unidadeId', unicaUnidade)
    }
  }, [unicaUnidade, getValues, setValue])

  /** Recalcula a sugestão da meta depois de mudar recebimento ou prazo (se ninguém a editou). */
  function aposMudarPrazo() {
    if (metaEditada) return
    const valores = getValues()
    const prazoAtual = prazoDaTela(valores)
    setValue(
      'metaInterna',
      prazoAtual && valores.recebidoEm
        ? metaInternaSugerida(prazoAtual, valores.recebidoEm as DataCivil)
        : null,
      opcoes,
    )
  }

  const prazo = prazoDaTela(v)
  const prazoCalculado = v.modoPrazo === 'dias' ? prazo : null

  const salvar = useMutation({
    mutationFn: async (d: Dados) => {
      const prazoOficial = prazoDaTela(d)
      const dias = lerDias(d.dias)
      if (!d.recebidoEm || !prazoOficial || !d.metaInterna) throw new Error('prazo_obrigatorio')
      const recebidoEm = d.recebidoEm as DataCivil
      await registrarExigencia(
        cid,
        exigenciaId,
        {
          unidadeId: d.unidadeId,
          instrumentoId: d.instrumentoId || null,
          assunto: d.assunto,
          numeroOficio: d.numeroOficio,
          orgao: d.orgao,
          numeroProcesso: d.numeroProcesso,
          notas: d.notas,
          recebidoEm,
          recebidoEmTexto: formatarDataCivil(recebidoEm),
          prazo:
            d.modoPrazo === 'dias' && dias !== null
              ? { modo: 'dias', dias, contagem: d.contagem }
              : { modo: 'data', texto: formatarDataCivil(prazoOficial) },
          prazoOficial,
          metaInterna: d.metaInterna as DataCivil,
          responsavelId: d.responsavelId,
        },
        arquivo,
        versaoId,
      )
    },
    onSuccess: () => aoSalvar(exigenciaId),
  })

  return (
    <Dialogo
      aberto
      aoMudar={(aberto) => {
        if (!aberto) aoFechar()
      }}
      titulo="Registrar exigência"
      largura={560}
      acoes={
        <Rodape
          formulario={formulario}
          salvando={salvar.isPending}
          rotulo="Registrar exigência"
          aoFechar={aoFechar}
        />
      }
    >
      <form
        id={formulario}
        noValidate
        aria-label="Registrar exigência"
        className="flex flex-col gap-(--e-3)"
        onSubmit={(evento) =>
          void handleSubmit((dados) => {
            salvar.mutate(dados)
          })(evento)
        }
      >
        {salvar.isError ? (
          <MensagemSecao role="alert" tom="perigo">
            {mensagemDoErro(salvar.error)}
          </MensagemSecao>
        ) : null}

        {empreendimento ? null : (
          <div className="flex flex-col gap-(--e-1)">
            <Rotulo htmlFor={`${ids}-empreendimento`}>Empreendimento *</Rotulo>
            <select
              id={`${ids}-empreendimento`}
              className={classeCampo}
              value={v.empreendimentoId}
              aria-invalid={errors.empreendimentoId ? true : undefined}
              aria-describedby={errors.empreendimentoId ? `${ids}-empreendimento-erro` : undefined}
              onChange={(evento) => {
                setValue('empreendimentoId', evento.target.value, opcoes)
                setValue('unidadeId', '', opcoes)
                setValue('instrumentoId', '', opcoes)
              }}
            >
              <option value="">
                {empreendimentos.isPending ? 'Carregando…' : 'Escolha o empreendimento'}
              </option>
              {(empreendimentos.data?.itens ?? []).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
            <ErroDoCampo id={`${ids}-empreendimento-erro`}>
              {errors.empreendimentoId?.message}
            </ErroDoCampo>
          </div>
        )}

        <div className="grid gap-(--e-3) sm:grid-cols-2">
          <div className="flex flex-col gap-(--e-1)">
            <Rotulo htmlFor={`${ids}-unidade`}>Unidade *</Rotulo>
            <select
              id={`${ids}-unidade`}
              className={classeCampo}
              value={v.unidadeId}
              disabled={v.empreendimentoId === ''}
              aria-invalid={errors.unidadeId ? true : undefined}
              aria-describedby={errors.unidadeId ? `${ids}-unidade-erro` : undefined}
              onChange={(evento) => {
                setValue('unidadeId', evento.target.value, opcoes)
                setValue('instrumentoId', '', opcoes)
              }}
            >
              <option value="">Escolha a unidade</option>
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>
            <ErroDoCampo id={`${ids}-unidade-erro`}>{errors.unidadeId?.message}</ErroDoCampo>
          </div>
          <div className="flex flex-col gap-(--e-1)">
            <Rotulo htmlFor={`${ids}-licenca`}>Licença</Rotulo>
            <select
              id={`${ids}-licenca`}
              className={classeCampo}
              value={v.instrumentoId}
              disabled={v.unidadeId === ''}
              onChange={(evento) => {
                const escolhida = licencasDaUnidade.find((l) => l.id === evento.target.value)
                setValue('instrumentoId', evento.target.value, opcoes)
                if (escolhida?.orgao && !getValues('orgao'))
                  setValue('orgao', escolhida.orgao, opcoes)
                if (escolhida?.numeroProcesso && !getValues('numeroProcesso')) {
                  setValue('numeroProcesso', escolhida.numeroProcesso, opcoes)
                }
              }}
            >
              <option value="">Sem licença</option>
              {licencasDaUnidade.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.rotulo}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-(--e-3) sm:grid-cols-2">
          <CampoTexto
            rotulo="Número do ofício"
            maxLength={60}
            erro={errors.numeroOficio?.message}
            {...register('numeroOficio')}
          />
          <CampoTexto
            rotulo="Órgão"
            maxLength={120}
            erro={errors.orgao?.message}
            {...register('orgao')}
          />
        </div>
        <CampoTexto
          rotulo="Número do processo"
          maxLength={60}
          erro={errors.numeroProcesso?.message}
          {...register('numeroProcesso')}
        />
        <CampoTexto
          rotulo="Assunto *"
          maxLength={300}
          erro={errors.assunto?.message}
          {...register('assunto')}
        />

        <CampoData
          rotulo="Recebido em *"
          hoje={hoje}
          maximo={hoje}
          motivoDoLimite="A data de recebimento não pode estar no futuro"
          valor={(v.recebidoEm as DataCivil | null) ?? null}
          erro={errors.recebidoEm?.message}
          aoMudar={(data) => {
            setValue('recebidoEm', data, opcoes)
            aposMudarPrazo()
          }}
        />

        <div className="flex flex-col gap-(--e-2)">
          <span className="rotulo text-(--tinta)">Prazo *</span>
          <Segmentado
            rotulo="Como o prazo foi dado"
            opcoes={[
              { valor: 'dias', rotulo: 'Em dias' },
              { valor: 'data', rotulo: 'Data informada' },
            ]}
            valor={v.modoPrazo}
            aoMudar={(modoPrazo) => {
              setValue('modoPrazo', modoPrazo, opcoes)
              aposMudarPrazo()
            }}
          />
          {v.modoPrazo === 'dias' ? (
            <div className="flex flex-wrap items-end gap-(--e-3)">
              <CampoTexto
                rotulo="Dias"
                inputMode="numeric"
                maxLength={3}
                className="w-24"
                erro={errors.dias?.message}
                {...register('dias', { onChange: aposMudarPrazo })}
              />
              <Segmentado
                rotulo="Contagem"
                opcoes={[
                  { valor: 'corridos', rotulo: 'Corridos' },
                  { valor: 'uteis', rotulo: 'Úteis' },
                ]}
                valor={v.contagem}
                aoMudar={(contagem) => {
                  setValue('contagem', contagem, opcoes)
                  aposMudarPrazo()
                }}
              />
              {prazoCalculado ? (
                <p className="flex h-(--controle) items-center corpo" aria-live="polite">
                  Vence em{' '}
                  <span className="ml-(--e-1) corpo-medio numero">
                    {formatarDataCivil(prazoCalculado)}
                  </span>
                </p>
              ) : null}
            </div>
          ) : (
            <CampoData
              rotulo="Prazo do ofício"
              hoje={hoje}
              valor={(v.prazoData as DataCivil | null) ?? null}
              erro={errors.prazoData?.message}
              aoMudar={(data) => {
                setValue('prazoData', data, opcoes)
                aposMudarPrazo()
              }}
            />
          )}
        </div>

        <CampoData
          rotulo="Meta interna *"
          hoje={hoje}
          minimo={(v.recebidoEm as DataCivil | null) ?? undefined}
          maximo={prazo ?? undefined}
          motivoDoLimite="A meta interna fica entre o recebimento e o prazo"
          valor={(v.metaInterna as DataCivil | null) ?? null}
          erro={errors.metaInterna?.message}
          aoMudar={(data) => {
            setMetaEditada(true)
            setValue('metaInterna', data, opcoes)
          }}
        />

        <div className="flex flex-col gap-(--e-1)">
          <span className="flex min-h-5 items-center rotulo text-(--tinta)">Responsável</span>
          <SeletorPessoa
            rotulo="Responsável pela exigência"
            vazio="Sem responsável"
            pessoas={(membros.data ?? []).map((m) => ({
              id: m.id,
              nome: m.nome,
              detalhe: m.cargo,
              fotoUrl: m.fotoUrl,
            }))}
            valor={v.responsavelId}
            aoMudar={(id) => {
              setValue('responsavelId', id, opcoes)
            }}
          />
        </div>

        <div className="flex flex-col gap-(--e-1)">
          <Rotulo htmlFor={`${ids}-notas`}>Notas</Rotulo>
          <textarea
            id={`${ids}-notas`}
            className={classeAreaTexto}
            maxLength={4000}
            {...register('notas')}
          />
        </div>

        <CampoPdf
          rotulo="PDF do ofício"
          arquivo={arquivo}
          erro={erroDoPdf}
          desabilitado={salvar.isPending}
          aoEscolher={(escolhido) => {
            setErroDoPdf(undefined)
            setArquivo(escolhido)
            setVersaoId(crypto.randomUUID())
          }}
          aoErrar={setErroDoPdf}
        />
      </form>
    </Dialogo>
  )
}

function FormularioDeEdicao({
  exigencia,
  aoFechar,
  aoSalvar,
}: {
  exigencia: Exigencia
  aoFechar: () => void
  aoSalvar: (exigenciaId: string) => void | Promise<void>
}) {
  const ids = useId()
  const formulario = `${ids}-formulario`
  const esquema = useMemo(
    () =>
      z.object({ ...textos, metaInterna: z.string().nullable() }).superRefine((v, ctx) => {
        if (!v.metaInterna) {
          ctx.addIssue({
            code: 'custom',
            path: ['metaInterna'],
            message: 'Informe a meta interna',
          })
        } else if (
          !metaInternaValida(
            v.metaInterna as DataCivil,
            exigencia.recebidoEm,
            exigencia.prazoOficial,
          )
        ) {
          ctx.addIssue({
            code: 'custom',
            path: ['metaInterna'],
            message: 'A meta interna fica entre o recebimento e o prazo',
          })
        }
      }),
    [exigencia.recebidoEm, exigencia.prazoOficial],
  )
  type Dados = z.infer<typeof esquema>
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitted },
  } = useForm<Dados>({
    resolver: zodResolver(esquema),
    defaultValues: {
      assunto: exigencia.assunto,
      numeroOficio: exigencia.numeroOficio ?? '',
      orgao: exigencia.orgao ?? '',
      numeroProcesso: exigencia.numeroProcesso ?? '',
      notas: exigencia.notas ?? '',
      metaInterna: exigencia.metaInterna,
    },
  })
  const meta = useWatch({ control, name: 'metaInterna' }) as DataCivil | null

  const salvar = useMutation({
    mutationFn: (d: Dados) =>
      editarExigencia(exigencia, {
        assunto: d.assunto,
        metaInterna: d.metaInterna as DataCivil,
        numeroOficio: d.numeroOficio,
        orgao: d.orgao,
        numeroProcesso: d.numeroProcesso,
        notas: d.notas,
      }),
    onSuccess: () => aoSalvar(exigencia.id),
  })

  return (
    <Dialogo
      aberto
      aoMudar={(aberto) => {
        if (!aberto) aoFechar()
      }}
      titulo="Editar exigência"
      largura={560}
      acoes={
        <Rodape
          formulario={formulario}
          salvando={salvar.isPending}
          rotulo="Salvar exigência"
          aoFechar={aoFechar}
        />
      }
    >
      <form
        id={formulario}
        noValidate
        aria-label="Editar exigência"
        className="flex flex-col gap-(--e-3)"
        onSubmit={(evento) =>
          void handleSubmit((dados) => {
            salvar.mutate(dados)
          })(evento)
        }
      >
        {salvar.isError ? (
          <MensagemSecao role="alert" tom="perigo">
            {mensagemDoErro(salvar.error)}
          </MensagemSecao>
        ) : null}
        <div className="grid gap-(--e-3) sm:grid-cols-2">
          <CampoTexto
            rotulo="Número do ofício"
            maxLength={60}
            erro={errors.numeroOficio?.message}
            {...register('numeroOficio')}
          />
          <CampoTexto
            rotulo="Órgão"
            maxLength={120}
            erro={errors.orgao?.message}
            {...register('orgao')}
          />
        </div>
        <CampoTexto
          rotulo="Número do processo"
          maxLength={60}
          erro={errors.numeroProcesso?.message}
          {...register('numeroProcesso')}
        />
        <CampoTexto
          rotulo="Assunto *"
          maxLength={300}
          erro={errors.assunto?.message}
          {...register('assunto')}
        />
        <CampoData
          rotulo="Meta interna *"
          hoje={exigencia.hoje}
          minimo={exigencia.recebidoEm}
          maximo={exigencia.prazoOficial}
          motivoDoLimite="A meta interna fica entre o recebimento e o prazo"
          valor={meta}
          erro={errors.metaInterna?.message}
          aoMudar={(data) => {
            setValue('metaInterna', data, { shouldValidate: isSubmitted })
          }}
        />
        <div className="flex flex-col gap-(--e-1)">
          <Rotulo htmlFor={`${ids}-notas`}>Notas</Rotulo>
          <textarea
            id={`${ids}-notas`}
            className={classeAreaTexto}
            maxLength={4000}
            {...register('notas')}
          />
        </div>
      </form>
    </Dialogo>
  )
}
