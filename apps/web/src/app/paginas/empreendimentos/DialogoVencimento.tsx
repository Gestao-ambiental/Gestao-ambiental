// Cadastro, renovação, edição e troca do PDF de um vencimento (ADR-0046): alvará, ART, CTF IBAMA,
// outorga, AVCB, certidão. Só a Gestão abre (o banco decide de fato). O id do vencimento e o da
// versão do PDF nascem ao abrir: repetir depois de erro de rede não duplica nada.
import {
  ANTECEDENCIA_PADRAO_DIAS,
  antecedenciaValida,
  type DataCivil,
} from '@gestao-ambiental/domain'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  useId,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type SyntheticEvent,
} from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'

import { useConsultoria } from '@/app/consultoria/contexto-consultoria'
import { Carregando } from '@/components/estados'
import { Botao } from '@/components/ui/botao'
import { CampoData } from '@/components/ui/campo-data'
import { CampoTexto } from '@/components/ui/campo-texto'
import { Dialogo } from '@/components/ui/dialogo'
import { classeAreaTexto, classeCampo } from '@/components/ui/estilos-campo'
import { Icone } from '@/components/ui/icone'
import { MensagemSecao } from '@/components/ui/mensagem-secao'
import type { Unidade } from '@/lib/api/empreendimentos'
import { conferirPdf, listarMembrosAtivos, type ProblemaDoPdf } from '@/lib/api/licencas'
import {
  cadastrarVencimento,
  editarVencimento,
  listarLicencasParaVencimento,
  listarTiposDeVencimento,
  renovarVencimento,
  trocarPdfDoVencimento,
  type DadosDoVencimento,
  type TipoDeVencimento,
  type Vencimento,
} from '@/lib/api/vencimentos'
import { mensagemDoErroDoVencimento } from '@/lib/erros'
import { cn } from '@/lib/utils'

import { descricaoDoVencimento } from './vencimentos-do-empreendimento'

const PROBLEMAS: Record<ProblemaDoPdf, string> = {
  nao_pdf: 'Este arquivo não é um PDF válido.',
  grande_demais: 'O arquivo passa de 25 MB.',
  vazio: 'O arquivo está vazio.',
}

export type ModoDoVencimento =
  | { tipo: 'novo' }
  | { tipo: 'renovar'; anterior: Vencimento }
  | { tipo: 'editar'; vencimento: Vencimento }
  | { tipo: 'pdf'; vencimento: Vencimento }

function tituloDoDialogo(modo: ModoDoVencimento): string {
  switch (modo.tipo) {
    case 'novo':
      return 'Novo vencimento'
    case 'renovar':
      return `Renovar ${descricaoDoVencimento(modo.anterior)}`
    case 'editar':
      return `Editar ${descricaoDoVencimento(modo.vencimento)}`
    case 'pdf':
      return `Trocar PDF · ${descricaoDoVencimento(modo.vencimento)}`
  }
}

const esquema = z
  .object({
    tipoId: z.string().min(1, 'Escolha o tipo'),
    unidadeId: z.string(),
    instrumentoId: z.string(),
    responsavelTecnicoId: z.string(),
    numero: z.string().trim().max(60, 'Use até 60 caracteres'),
    orgao: z.string().trim().max(120, 'Use até 120 caracteres'),
    notas: z.string().trim().max(2000, 'Use até 2.000 caracteres'),
    emitidoEm: z.string().nullable(),
    emitidoTexto: z.string().trim().max(100, 'Use até 100 caracteres'),
    validoAte: z
      .string()
      .nullable()
      .refine((valor) => valor !== null, 'Informe a validade'),
    validadeTexto: z.string().trim().max(100, 'Use até 100 caracteres'),
    antecedencia: z
      .string()
      .refine(
        (valor) => /^\d+$/.test(valor.trim()) && antecedenciaValida(Number(valor)),
        'Use de 0 a 730 dias',
      ),
  })
  .refine((d) => !d.emitidoEm || !d.validoAte || d.emitidoEm <= d.validoAte, {
    path: ['emitidoEm'],
    message: 'A emissão não pode ser depois da validade',
  })
type Entrada = z.input<typeof esquema>
type Campos = z.output<typeof esquema>

function valoresIniciais(modo: ModoDoVencimento): Entrada {
  const vazio: Entrada = {
    tipoId: '',
    unidadeId: '',
    instrumentoId: '',
    responsavelTecnicoId: '',
    numero: '',
    orgao: '',
    notas: '',
    emitidoEm: null,
    emitidoTexto: '',
    validoAte: null,
    validadeTexto: '',
    antecedencia: String(ANTECEDENCIA_PADRAO_DIAS),
  }
  if (modo.tipo === 'novo') return vazio
  if (modo.tipo === 'renovar') {
    const a = modo.anterior
    // O novo herda tipo, unidade, órgão, licença, responsável técnico e antecedência; número,
    // datas e notas são do documento novo.
    return {
      ...vazio,
      tipoId: a.tipoId,
      unidadeId: a.unidadeId ?? '',
      instrumentoId: a.instrumentoId ?? '',
      responsavelTecnicoId: a.responsavelTecnicoId ?? '',
      orgao: a.orgao ?? '',
      antecedencia: String(a.antecedenciaDias),
    }
  }
  const v = modo.vencimento
  return {
    tipoId: v.tipoId,
    unidadeId: v.unidadeId ?? '',
    instrumentoId: v.instrumentoId ?? '',
    responsavelTecnicoId: v.responsavelTecnicoId ?? '',
    numero: v.numero ?? '',
    orgao: v.orgao ?? '',
    notas: v.notas ?? '',
    emitidoEm: v.emitidoEm,
    emitidoTexto: v.emitidoTexto ?? '',
    validoAte: v.validoAte,
    validadeTexto: v.validadeTexto ?? '',
    antecedencia: String(v.antecedenciaDias),
  }
}

function paraDados(campos: Campos): DadosDoVencimento {
  return {
    tipoId: campos.tipoId,
    unidadeId: campos.unidadeId || null,
    instrumentoId: campos.instrumentoId || null,
    responsavelTecnicoId: campos.responsavelTecnicoId || null,
    numero: campos.numero,
    orgao: campos.orgao,
    notas: campos.notas,
    emitidoEm: campos.emitidoEm as DataCivil | null,
    emitidoTexto: campos.emitidoTexto,
    validoAte: campos.validoAte as DataCivil,
    validadeTexto: campos.validadeTexto,
    antecedenciaDias: Number(campos.antecedencia),
  }
}

/** Seleção nativa com rótulo em cima e erro embaixo (mesmo desenho do CampoTexto). */
function CampoSelecao({
  rotulo,
  erro,
  children,
  ...rest
}: Omit<ComponentProps<'select'>, 'id'> & { rotulo: string; erro?: string; children: ReactNode }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-(--e-1)">
      <label htmlFor={id} className="flex min-h-5 items-center rotulo text-(--tinta)">
        {rotulo}
      </label>
      <select
        id={id}
        className={classeCampo}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? `${id}-erro` : undefined}
        {...rest}
      >
        {children}
      </select>
      {erro ? (
        <span id={`${id}-erro`} className="text-xs font-[650] text-(--atraso-texto)">
          {erro}
        </span>
      ) : null}
    </div>
  )
}

export function DialogoVencimento({
  modo,
  empreendimentoId,
  unidades,
  hoje,
  aoFechar,
  aoSalvar,
}: {
  modo: ModoDoVencimento
  empreendimentoId: string
  unidades: readonly Unidade[]
  hoje: DataCivil
  aoFechar: () => void
  aoSalvar: () => Promise<void> | void
}) {
  const { atual } = useConsultoria()
  const cid = atual.consultoriaId
  const idDoCampo = useId()
  const entrada = useRef<HTMLInputElement>(null)
  // Ids gerados ao abrir: repetir depois de erro de rede devolve o mesmo vencimento e a mesma versão.
  const [id] = useState(() => crypto.randomUUID())
  // Id da versão do PDF: repetir com o mesmo arquivo mantém o id (idempotente); trocar de arquivo
  // gera outro, porque o Storage não sobrescreve o objeto já enviado.
  const [versaoId, setVersaoId] = useState(() => crypto.randomUUID())
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [erroDoArquivo, setErroDoArquivo] = useState<string | null>(null)
  const soPdf = modo.tipo === 'pdf'
  const base =
    modo.tipo === 'renovar' ? modo.anterior : modo.tipo === 'novo' ? null : modo.vencimento

  const tipos = useQuery({
    queryKey: ['tipos-vencimento', cid],
    queryFn: () => listarTiposDeVencimento(cid),
    enabled: !soPdf,
  })
  const licencas = useQuery({
    queryKey: ['licencas-para-vencimento', empreendimentoId],
    queryFn: () => listarLicencasParaVencimento(empreendimentoId),
    enabled: !soPdf,
  })
  const membros = useQuery({
    queryKey: ['membros-ativos', cid],
    queryFn: () => listarMembrosAtivos(cid),
    enabled: !soPdf,
  })

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<Entrada, unknown, Campos>({
    resolver: zodResolver(esquema),
    defaultValues: valoresIniciais(modo),
  })

  const tipoId = useWatch({ control, name: 'tipoId' })
  // Tipo desativado não serve para vencimento novo, mas continua no que já o usa.
  const opcoesDeTipo: TipoDeVencimento[] = (tipos.data ?? []).filter(
    (t) => t.ativo || t.id === base?.tipoId,
  )
  const tipoEscolhido = tipos.data?.find((t) => t.id === tipoId)
  const pdfObrigatorio = modo.tipo !== 'editar' && tipoEscolhido?.exigePdf === true
  const comPdf = modo.tipo !== 'editar'
  // Os campos de lista só aparecem com as listas carregadas: assim cada seleção abre no valor certo.
  const carregando = !soPdf && (tipos.isPending || licencas.isPending || membros.isPending)

  const salvar = useMutation({
    mutationFn: async (campos: Campos | null) => {
      const pdf = arquivo ? { versaoId, arquivo } : null
      if (modo.tipo === 'pdf') {
        if (!pdf) throw new Error('sem PDF')
        await trocarPdfDoVencimento(cid, modo.vencimento, pdf)
        return
      }
      if (!campos) throw new Error('sem dados')
      const dados = paraDados(campos)
      if (modo.tipo === 'novo') await cadastrarVencimento(cid, id, empreendimentoId, dados, pdf)
      else if (modo.tipo === 'renovar') await renovarVencimento(cid, id, modo.anterior, dados, pdf)
      else await editarVencimento(modo.vencimento, dados)
    },
    onSuccess: aoSalvar,
  })

  async function escolher(escolhido: File | undefined) {
    if (!escolhido) return
    const problema = await conferirPdf(escolhido)
    if (problema) {
      setErroDoArquivo(PROBLEMAS[problema])
      return
    }
    setErroDoArquivo(null)
    setArquivo(escolhido)
    setVersaoId(crypto.randomUUID())
  }

  function pdfFalta(): boolean {
    const falta = !arquivo && (soPdf || pdfObrigatorio)
    if (falta) setErroDoArquivo('Anexe o PDF')
    return falta
  }

  const enviar = soPdf
    ? (evento: SyntheticEvent<HTMLFormElement>) => {
        evento.preventDefault()
        if (!pdfFalta()) salvar.mutate(null)
      }
    : (evento: SyntheticEvent<HTMLFormElement>) => {
        // O PDF obrigatório é conferido junto com os outros campos.
        const falta = pdfFalta()
        void handleSubmit((campos) => {
          if (!falta) salvar.mutate(campos)
        })(evento)
      }

  const campoTipo = register('tipoId', {
    onChange: (evento: { target: { value: string } }) => {
      const escolhido = tipos.data?.find((t) => t.id === evento.target.value)
      if (escolhido && modo.tipo === 'novo') {
        setValue('antecedencia', String(escolhido.antecedenciaDias), { shouldValidate: true })
      }
    },
  })
  const responsavelAtual =
    base?.responsavelTecnicoId &&
    !(membros.data ?? []).some((m) => m.id === base.responsavelTecnicoId)
      ? { id: base.responsavelTecnicoId, nome: base.responsavelTecnicoNome ?? 'Responsável atual' }
      : null

  const campoPdf = comPdf ? (
    <div className="flex flex-col gap-(--e-1)">
      <span className="flex min-h-5 items-center rotulo text-(--tinta)" id={`${idDoCampo}-pdf`}>
        {soPdf || pdfObrigatorio ? 'PDF *' : 'PDF'}
      </span>
      <div
        className={cn(
          'flex items-center gap-(--e-2) rounded-(--raio) border border-dashed p-(--e-2) pl-(--e-3)',
          erroDoArquivo ? 'border-(--atraso)' : 'border-(--campo-borda)',
        )}
      >
        <Icone nome="paperclip" className="shrink-0 text-(--icone-2)" />
        <span
          className={cn(
            'min-w-0 flex-1 truncate corpo',
            arquivo ? 'text-(--tinta)' : 'text-(--tinta-2)',
          )}
        >
          {arquivo ? arquivo.name : 'PDF até 25 MB'}
        </span>
        <Botao
          tamanho="compacto"
          aria-describedby={`${idDoCampo}-pdf`}
          disabled={salvar.isPending}
          onClick={() => {
            entrada.current?.click()
          }}
        >
          {arquivo ? 'Trocar' : 'Escolher arquivo'}
        </Botao>
        <input
          ref={entrada}
          type="file"
          accept="application/pdf"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          data-testid="pdf-do-vencimento"
          onChange={(evento) => {
            void escolher(evento.target.files?.[0])
            evento.target.value = ''
          }}
        />
      </div>
      {erroDoArquivo ? (
        <span role="alert" className="text-xs font-[650] text-(--atraso-texto)">
          {erroDoArquivo}
        </span>
      ) : null}
    </div>
  ) : null

  return (
    <Dialogo
      aberto
      largura={soPdf ? 480 : 640}
      aoMudar={(aberto) => {
        if (!aberto) aoFechar()
      }}
      titulo={tituloDoDialogo(modo)}
      acoes={
        <>
          <Botao disabled={salvar.isPending} onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            type="submit"
            form={`${idDoCampo}-form`}
            aparencia="primario"
            disabled={salvar.isPending}
            aria-busy={salvar.isPending || undefined}
          >
            {salvar.isPending ? 'Salvando…' : soPdf ? 'Salvar PDF' : 'Salvar vencimento'}
          </Botao>
        </>
      }
    >
      <form
        id={`${idDoCampo}-form`}
        noValidate
        onSubmit={enviar}
        className="flex flex-col gap-(--e-4)"
      >
        {salvar.isError ? (
          <MensagemSecao role="alert" tom="perigo">
            {mensagemDoErroDoVencimento(salvar.error)}
          </MensagemSecao>
        ) : null}
        {tipos.isError || licencas.isError || membros.isError ? (
          <MensagemSecao role="alert" tom="perigo">
            Não foi possível carregar as listas do formulário.
          </MensagemSecao>
        ) : null}
        {soPdf ? (
          campoPdf
        ) : carregando ? (
          <Carregando rotulo="Carregando o formulário" linhas={3} className="border-0" />
        ) : (
          <>
            <div className="grid gap-(--e-4) sm:grid-cols-2">
              {modo.tipo === 'renovar' ? (
                // Renovar herda tipo e unidade do anterior: aparecem, mas não mudam.
                <>
                  <CampoSelecao rotulo="Tipo *" disabled defaultValue={modo.anterior.tipoId}>
                    <option value={modo.anterior.tipoId}>{modo.anterior.tipoNome}</option>
                  </CampoSelecao>
                  <CampoSelecao
                    rotulo="Unidade"
                    disabled
                    defaultValue={modo.anterior.unidadeId ?? ''}
                  >
                    <option value={modo.anterior.unidadeId ?? ''}>
                      {modo.anterior.unidadeNome ?? 'Sem unidade'}
                    </option>
                  </CampoSelecao>
                </>
              ) : (
                <>
                  <CampoSelecao
                    rotulo="Tipo *"
                    erro={errors.tipoId?.message}
                    disabled={salvar.isPending}
                    {...campoTipo}
                  >
                    {modo.tipo === 'novo' ? <option value="">Selecione</option> : null}
                    {base && !opcoesDeTipo.some((t) => t.id === base.tipoId) ? (
                      <option value={base.tipoId}>{base.tipoNome}</option>
                    ) : null}
                    {opcoesDeTipo.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.ativo ? t.nome : `${t.nome} (desativado)`}
                      </option>
                    ))}
                  </CampoSelecao>
                  <CampoSelecao
                    rotulo="Unidade"
                    disabled={salvar.isPending}
                    {...register('unidadeId')}
                  >
                    <option value="">Sem unidade</option>
                    {unidades.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nome}
                      </option>
                    ))}
                  </CampoSelecao>
                </>
              )}
              <CampoTexto
                rotulo="Número"
                maxLength={60}
                autoComplete="off"
                disabled={salvar.isPending}
                erro={errors.numero?.message}
                {...register('numero')}
              />
              <CampoTexto
                rotulo="Órgão"
                maxLength={120}
                disabled={salvar.isPending}
                erro={errors.orgao?.message}
                {...register('orgao')}
              />
              <Controller
                control={control}
                name="emitidoEm"
                render={({ field }) => (
                  <CampoData
                    rotulo="Emitido em"
                    hoje={hoje}
                    valor={field.value as DataCivil | null}
                    aoMudar={field.onChange}
                    erro={errors.emitidoEm?.message}
                    disabled={salvar.isPending}
                  />
                )}
              />
              <Controller
                control={control}
                name="validoAte"
                render={({ field }) => (
                  <CampoData
                    rotulo="Válido até *"
                    hoje={hoje}
                    valor={field.value as DataCivil | null}
                    aoMudar={field.onChange}
                    erro={errors.validoAte?.message}
                    disabled={salvar.isPending}
                  />
                )}
              />
              <CampoTexto
                rotulo="Validade como no documento"
                maxLength={100}
                disabled={salvar.isPending}
                erro={errors.validadeTexto?.message}
                {...register('validadeTexto')}
              />
              <CampoTexto
                rotulo="Antecedência em dias *"
                inputMode="numeric"
                maxLength={3}
                autoComplete="off"
                disabled={salvar.isPending}
                erro={errors.antecedencia?.message}
                {...register('antecedencia')}
              />
              <CampoSelecao
                rotulo="Licença"
                disabled={salvar.isPending}
                {...register('instrumentoId')}
              >
                <option value="">Nenhuma</option>
                {(licencas.data ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.rotulo}
                  </option>
                ))}
                {base?.instrumentoId &&
                !(licencas.data ?? []).some((l) => l.id === base.instrumentoId) ? (
                  <option value={base.instrumentoId}>{base.licenca ?? 'Licença atual'}</option>
                ) : null}
              </CampoSelecao>
              <CampoSelecao
                rotulo="Responsável técnico"
                disabled={salvar.isPending}
                {...register('responsavelTecnicoId')}
              >
                <option value="">Nenhum</option>
                {(membros.data ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
                {responsavelAtual ? (
                  <option value={responsavelAtual.id}>{responsavelAtual.nome}</option>
                ) : null}
              </CampoSelecao>
            </div>
            {modo.tipo === 'editar' ? null : campoPdf}
            <div className="flex flex-col gap-(--e-1)">
              <label htmlFor={`${idDoCampo}-notas`} className="rotulo text-(--tinta)">
                Notas
              </label>
              <textarea
                id={`${idDoCampo}-notas`}
                className={cn(classeAreaTexto, 'min-h-16')}
                maxLength={2000}
                disabled={salvar.isPending}
                aria-invalid={errors.notas ? true : undefined}
                {...register('notas')}
              />
            </div>
          </>
        )}
      </form>
    </Dialogo>
  )
}
