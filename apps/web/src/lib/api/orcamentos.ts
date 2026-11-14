// Orçamentos, fatia 1 (onda 5; ORC-02, ORC-03, ORC-04). Leitura por funções do banco; escrita só
// por RPC. Nesta fatia tudo é da Gestão: a RLS devolve zero linhas para a Equipe.

import {
  ESCALA_DA_QUANTIDADE,
  FORMAS_DE_RECEBIMENTO,
  profissaoDoCodigo,
  MODOS_DE_DESLOCAMENTO,
  UNIDADES_DE_COBRANCA,
  type CustoDaProfissao,
  type CodigoProfissao,
  type CustoDoMembro,
  type FaixaDePreco,
  type FormaDePreco,
  type ModoDeDeslocamento,
  type PessoaDoRascunho,
  type RemuneracaoDaPessoa,
  type UnidadeDeCobranca,
  type VisitasDoOrcamento,
} from '@gestao-ambiental/domain'

import { aceitaNulo } from '@/lib/api/nulo'
import type { Json } from '@/lib/database.types'
import { obterSupabase } from '@/lib/supabase'

import { lista, objeto, texto, textoOuNulo, type Objeto } from './json'

export type { CustoDaProfissao, CustoDoMembro, FormaDePreco, VisitasDoOrcamento }

export const TAMANHO_PAGINA_ORCAMENTOS = 50

export type SituacaoOrcamento = 'rascunho' | 'enviada' | 'negociacao' | 'aprovada' | 'recusada'
export type TratamentoDespesa = 'incluida' | 'cliente_direto' | 'reembolsavel'

/**
 * Linha da tabela de preços. Hora de profissional (unidade hora): profissão e nível (Biólogo ·
 * Sênior). Serviço (demais unidades): serviço e "Quem faz" opcional (profissão vazia = ninguém).
 */
export interface HoraDeVenda {
  id: string
  /** Na hora, obrigatória; no serviço, '' quando não há "Quem faz". */
  profissao: string
  /** Nível (na hora) ou serviço (nas demais unidades). */
  atividade: string
  valorCentavos: number
  /** De onde veio o valor (ex.: "ACEAMB 2015 corrigida"). */
  fonte: string | null
  /** Unidade de cobrança da linha (ADR-0018): hora, m², hectare, diária, campanha ou pacote. */
  unidade: UnidadeDeCobranca
  /** Tempo sugerido por unidade, em minutos (opcional): sugere as horas do serviço. */
  minutosPorUnidade: number | null
  /** Faixas progressivas (ADR-0018, fatia 4); vazio = preço por unidade. */
  faixas: FaixaDePreco[]
  /** Preço mínimo do serviço, só sobre os honorários (opcional; nunca no pacote). */
  minimoCentavos: number | null
}

export const ROTULO_DO_TRATAMENTO: Record<TratamentoDespesa, string> = {
  incluida: 'Incluída no preço',
  cliente_direto: 'Paga pelo cliente, direto',
  reembolsavel: 'Reembolso com comprovante',
}

export const ROTULO_DA_SITUACAO: Record<SituacaoOrcamento, string> = {
  rascunho: 'Rascunho',
  enviada: 'Enviada',
  negociacao: 'Em negociação',
  aprovada: 'Aprovada',
  recusada: 'Recusada',
}

// ---------------------------------------------------------------------------
// Leitura defensiva do JSON das funções
// ---------------------------------------------------------------------------

function numeroOuNulo(valor: Json | undefined): number | null {
  if (typeof valor === 'number') return valor
  if (typeof valor === 'string' && valor.trim() !== '' && Number.isFinite(Number(valor)))
    return Number(valor)
  return null
}
function numero(valor: Json | undefined): number {
  return numeroOuNulo(valor) ?? 0
}
function textos(valor: Json | undefined): string[] {
  return Array.isArray(valor) ? valor.filter((item) => typeof item === 'string') : []
}
function tratamento(valor: Json | undefined): TratamentoDespesa {
  return valor === 'incluida' || valor === 'reembolsavel' ? valor : 'cliente_direto'
}
function contasDe(valor: Json | undefined): ContaDoMes[] {
  return lista(valor).map((c) => ({
    descricao: texto(c.descricao),
    valorCentavos: numero(c.valor_centavos),
  }))
}
function modoDe(valor: Json | undefined): ModoDeDeslocamento | null {
  return MODOS_DE_DESLOCAMENTO.find((m) => m === valor) ?? null
}
function unidadeDe(valor: Json | undefined): UnidadeDeCobranca {
  return UNIDADES_DE_COBRANCA.find((u) => u === valor) ?? 'hora'
}
/** numeric(18,4) do banco → quantidade × 10.000, sem erro de ponto flutuante. */
function quantidadeDe(valor: Json | undefined): number | null {
  const lido = numeroOuNulo(valor)
  return lido === null ? null : Math.round(lido * ESCALA_DA_QUANTIDADE)
}
/** Tabela de preços como o banco devolve (base de custos e rascunho dos primeiros passos). */
export function horasDe(valor: Json | undefined): HoraDeVenda[] {
  return lista(valor).map((h) => ({
    id: texto(h.id),
    profissao: texto(h.profissao),
    atividade: texto(h.atividade),
    valorCentavos: numero(h.valor_centavos),
    fonte: textoOuNulo(h.fonte),
    unidade: unidadeDe(h.unidade),
    minutosPorUnidade: numeroOuNulo(h.minutos_por_unidade),
    faixas: lista(h.faixas).map((f) => ({
      ateDezMilesimos: quantidadeDe(f.ate),
      valorCentavos: numero(f.valor_centavos),
    })),
    minimoCentavos: numeroOuNulo(h.minimo_centavos),
  }))
}
function duplicadoDe(d: Objeto | null): Orcamento['duplicadoDe'] {
  return d
    ? {
        id: texto(d.id),
        ano: numero(d.ano),
        sequencia: numero(d.sequencia),
        revisao: numero(d.revisao),
      }
    : null
}
function custosDeMembrosDe(valor: Json | undefined): CustoDoMembro[] {
  return lista(valor).map((c) => ({
    membroId: texto(c.membro_id),
    horaCentavos: numero(c.hora_centavos),
  }))
}
function custosDe(valor: Json | undefined): CustoDaProfissao[] {
  return lista(valor).map((c) => ({
    profissao: texto(c.profissao),
    horaTecnicaCentavos: numero(c.hora_tecnica_centavos),
  }))
}
function prospectoDe(valor: Json | undefined): Prospecto | null {
  const p = objeto(valor)
  if (!p) return null
  return {
    nome: texto(p.nome),
    cnpj: textoOuNulo(p.cnpj),
    contato: textoOuNulo(p.contato),
    email: textoOuNulo(p.email),
    telefone: textoOuNulo(p.telefone),
  }
}

// ---------------------------------------------------------------------------
// Lista
// ---------------------------------------------------------------------------

/** Quem pediu o orçamento sem estar cadastrado (ORC-02). Nunca CPF. */
export interface Prospecto {
  nome: string
  /** 14 caracteres, sem máscara; nulo quando não informado. */
  cnpj: string | null
  contato: string | null
  email: string | null
  telefone: string | null
}

export interface OrcamentoNaLista {
  id: string
  ano: number
  sequencia: number
  revisao: number
  situacao: SituacaoOrcamento
  /** Nome do empreendimento ou, se for de prospecto, do prospecto. */
  empreendimentoNome: string
  /** Orçamento de prospecto, ainda sem empreendimento cadastrado. */
  deProspecto: boolean
  objeto: string
  /** Nulo enquanto o preço está pendente (sem base, sem itens ou despesa incluída a cotar). */
  totalCentavos: number | null
  atualizadoEm: string
  /** Na lixeira desde; nulo na lista. */
  excluidoEm: string | null
  rowVersion: number
}

/**
 * `lixeira`: lista os orçamentos excluídos em vez dos ativos. `situacao`: só os desta situação
 * (nula = todas). A busca acha pelo empreendimento, prospecto, objeto ou trecho do número.
 */
export async function listarOrcamentos(
  consultoriaId: string,
  busca: string,
  pagina: number,
  lixeira = false,
  situacao: SituacaoOrcamento | null = null,
): Promise<{ itens: OrcamentoNaLista[]; total: number }> {
  const { data, error } = await obterSupabase().rpc('listar_orcamentos', {
    p_consultoria_id: consultoriaId,
    p_busca: busca,
    p_limite: TAMANHO_PAGINA_ORCAMENTOS,
    p_deslocamento: pagina * TAMANHO_PAGINA_ORCAMENTOS,
    p_lixeira: lixeira,
    ...(situacao ? { p_situacao: situacao } : {}),
  })
  if (error) throw error
  return {
    itens: data.map((linha) => ({
      id: linha.id,
      ano: linha.ano,
      sequencia: linha.sequencia,
      revisao: linha.revisao,
      situacao: linha.situacao,
      empreendimentoNome: linha.empreendimento_nome,
      // O tipo gerado não sabe: com prospecto, a coluna vem nula (left join).
      deProspecto: (linha.empreendimento_id as string | null) === null,
      objeto: linha.objeto,
      // Nulo com preço pendente (o tipo gerado não sabe: a coluna vem de um case).
      totalCentavos: linha.total_centavos,
      atualizadoEm: linha.atualizado_em,
      // Nulo fora da lixeira (o tipo gerado não sabe).
      excluidoEm: (linha.excluido_em as string | null) ?? null,
      rowVersion: linha.row_version,
    })),
    total: data[0]?.total ?? 0,
  }
}

/** Situação conhecida ou nula (ausente ou desconhecida), para ler a URL (?situacao=…) e o banco. */
export function situacaoOuNula(valor: unknown): SituacaoOrcamento | null {
  return (Object.keys(ROTULO_DA_SITUACAO) as SituacaoOrcamento[]).find((s) => s === valor) ?? null
}

/** Quantos orçamentos de cada situação atendem à busca (contagem das abas). */
export async function contarOrcamentosPorSituacao(
  consultoriaId: string,
  busca: string,
  lixeira = false,
): Promise<Record<SituacaoOrcamento, number>> {
  const { data, error } = await obterSupabase().rpc('contar_orcamentos_por_situacao', {
    p_consultoria_id: consultoriaId,
    p_busca: busca,
    p_lixeira: lixeira,
  })
  if (error) throw error
  const contagem: Record<SituacaoOrcamento, number> = {
    rascunho: 0,
    enviada: 0,
    negociacao: 0,
    aprovada: 0,
    recusada: 0,
  }
  // Situação sem orçamento não vem do banco: fica zero.
  for (const linha of (data as typeof data | null) ?? []) {
    const lida = situacaoOuNula(linha.situacao)
    if (lida) contagem[lida] = numero(linha.quantidade)
  }
  return contagem
}

/** Um grupo dos indicadores: quantos, a soma dos que têm preço e quantos estão sem preço. */
export interface IndicadorDeOrcamentos {
  quantidade: number
  /** Soma só dos orçamentos com preço calculado. */
  valorCentavos: number
  semPreco: number
}

/** Indicadores do topo da lista (fora da lixeira). */
export interface ResumoDosOrcamentos {
  /** Rascunhos. */
  emElaboracao: number
  /** Enviadas e em negociação. */
  aguardandoDecisao: IndicadorDeOrcamentos
  aprovados: IndicadorDeOrcamentos
}

export async function obterResumoDosOrcamentos(
  consultoriaId: string,
): Promise<ResumoDosOrcamentos> {
  const { data, error } = await obterSupabase().rpc('resumo_dos_orcamentos', {
    p_consultoria_id: consultoriaId,
  })
  if (error) throw error
  // A função sempre devolve uma linha; sem ela, tudo zero.
  const linha = (data as typeof data | null)?.[0]
  return {
    emElaboracao: numero(linha?.rascunhos),
    aguardandoDecisao: {
      quantidade: numero(linha?.aguardando),
      valorCentavos: numero(linha?.aguardando_centavos),
      semPreco: numero(linha?.aguardando_sem_preco),
    },
    aprovados: {
      quantidade: numero(linha?.aprovados),
      valorCentavos: numero(linha?.aprovados_centavos),
      semPreco: numero(linha?.aprovados_sem_preco),
    },
  }
}

// ---------------------------------------------------------------------------
// Detalhe
// ---------------------------------------------------------------------------

export interface ItemDoOrcamento {
  id: string
  descricao: string
  /** Duração estimada em minutos inteiros. */
  minutos: number
  /** Parte do item no preço total, calculada pelo banco a cada salvamento (zero se pendente). */
  precoCentavos: number
  custoDiretoExtraCentavos: number
  /** Linha da tabela de hora de venda: preço pela tabela e profissão do custo. */
  horaVendaId: string | null
  /** Membro responsável pelo serviço: o custo usa a hora dele, e ele recebe a etapa depois. */
  responsavelId: string | null
  /** Mês previsto de execução (aaaa-mm-01). */
  mesPrevisto: string | null
  /** Quantidade na unidade da linha de preço (× 10.000); nula na hora e no pacote. */
  quantidadeDezMilesimos: number | null
  /** Preço fechado do pacote ou, sem linha da tabela, o preço digitado do serviço (ADR-0023). */
  precoFechadoCentavos: number | null
  /** O serviço inclui ART ou RRT (fatia 6); nulo = não informado. */
  responsabilidadeTecnica: ResponsabilidadeTecnica | null
  /** Profissional terceirizado no lugar do responsável da equipe (ADR-0028); nulo = equipe. */
  terceiro: TerceiroDoServico | null
}

/** Terceirizado sem login: nome, profissão da lista, cobrança e valor (nulo = a informar). */
export interface TerceiroDoServico {
  nome: string
  profissao: CodigoProfissao | null
  cobranca: 'hora' | 'fechado'
  valorCentavos: number | null
}

export type ResponsabilidadeTecnica = 'art' | 'rrt'

export const ROTULO_DA_RESPONSABILIDADE: Record<ResponsabilidadeTecnica, string> = {
  art: 'ART',
  rrt: 'RRT',
}

/** Mudança manual de situação: quem, quando, de qual para qual e em que revisão. */
export interface MudancaDeSituacao {
  de: SituacaoOrcamento
  para: SituacaoOrcamento
  revisao: number
  membroNome: string | null
  em: string
  observacao: string | null
}

/** Transições que o banco aceita (private.transicao_de_situacao_valida). */
export const PROXIMAS_SITUACOES: Record<SituacaoOrcamento, SituacaoOrcamento[]> = {
  rascunho: ['enviada', 'aprovada'],
  enviada: ['negociacao', 'aprovada', 'recusada', 'rascunho'],
  negociacao: ['aprovada', 'recusada', 'rascunho'],
  aprovada: ['rascunho'],
  recusada: ['negociacao', 'rascunho'],
}

/** O que a tela envia de cada item: o preço sai do banco, nunca da tela. */
export type ItemParaSalvar = Omit<ItemDoOrcamento, 'precoCentavos'>

/** Conta do mês da consultoria (energia, água, internet…). */
export interface ContaDoMes {
  descricao: string
  valorCentavos: number
}

export interface DespesaDoOrcamento {
  id: string
  descricao: string
  /** `null` = a cotar (nunca zero). */
  estimativaCentavos: number | null
  tratamento: TratamentoDespesa
}

export interface ParcelaDoOrcamento {
  id: string
  /** Marco que dispara a parcela (ex.: "Assinatura do contrato"). */
  descricao: string
  /** Dias corridos após o marco. */
  dias: number
  percentualPb: number
}

/** Base de custos copiada para o orçamento. `null` = rateio pendente. */
export interface BaseDoOrcamento {
  horaTecnicaCentavos: number
  custoFixoHoraCentavos: number
  margemDesejadaPb: number
  margemMinimaPb: number
  tributosPb: number
  taxasPb: number
  taxaPorCobrancaCentavos: number
  taxaPorAssinaturaCentavos: number
  valorVisitaCentavos: number
  custoKmCentavos: number
  /** Modo da visita copiado da base; nulo em orçamento antigo (soma visita e km). */
  deslocamentoModo: ModoDeDeslocamento | null
  /** Contas do mês e parte administrativa da equipe: servem à prévia do rateio por conta. */
  custosFixosMensaisCentavos: number
  custosFixosEquipeCentavos: number
  contas: ContaDoMes[]
  /** Tabela de hora de venda e hora técnica por profissão, copiadas da base. */
  horasVenda: HoraDeVenda[]
  custoHoraPorProfissao: CustoDaProfissao[]
  /** Hora de custo de cada membro da equipe (custo do mês ÷ horas no mês). */
  custoHoraPorMembro: CustoDoMembro[]
}

export interface Orcamento {
  id: string
  ano: number
  sequencia: number
  revisao: number
  situacao: SituacaoOrcamento
  /** Nulo enquanto o orçamento é de prospecto. */
  empreendimentoId: string | null
  empreendimentoNome: string
  /** Dados de quem pediu sem estar cadastrado; ficam como histórico depois do cadastro. */
  prospecto: Prospecto | null
  objeto: string
  destinatario: string
  prazos: string
  validadeDias: number
  premissas: string[]
  exclusoes: string[]
  /** Texto de apresentação desta proposta; vazio = o padrão da identidade. */
  apresentacao: string
  /** Mudanças de situação, da mais recente para a mais antiga. */
  historicoSituacao: MudancaDeSituacao[]
  /** Margem escolhida no fim do orçamento; nula = margem desejada da base. */
  margemPb: number | null
  formaPreco: FormaDePreco
  visitas: VisitasDoOrcamento
  /** Parte das visitas no preço total, calculada pelo banco. */
  precoVisitasCentavos: number
  base: BaseDoOrcamento | null
  atualizadoEm: string
  /** Na lixeira desde; nulo fora dela. Na lixeira, nada muda até restaurar. */
  excluidoEm: string | null
  rowVersion: number
  /** Orçamento de onde esta cópia veio (fatia 5); nulo quando não é cópia. */
  duplicadoDe: { id: string; ano: number; sequencia: number; revisao: number } | null
  itens: ItemDoOrcamento[]
  despesas: DespesaDoOrcamento[]
  parcelas: ParcelaDoOrcamento[]
}

/** Nulo quando não existe ou a pessoa não tem acesso (a RLS não diz qual dos dois). */
export async function obterOrcamento(id: string): Promise<Orcamento | null> {
  const { data, error } = await obterSupabase().rpc('obter_orcamento', { p_id: id })
  if (error) throw error
  const o = objeto(data)
  if (!o) return null
  const b = objeto(o.base)
  const v = objeto(o.visitas)
  return {
    id: texto(o.id),
    ano: numero(o.ano),
    sequencia: numero(o.sequencia),
    revisao: numero(o.revisao),
    situacao: situacaoOuNula(o.situacao) ?? 'rascunho',
    empreendimentoId: textoOuNulo(o.empreendimento_id),
    empreendimentoNome: texto(o.empreendimento_nome),
    prospecto: prospectoDe(o.prospecto),
    objeto: texto(o.objeto),
    destinatario: textoOuNulo(o.destinatario) ?? '',
    prazos: textoOuNulo(o.prazos) ?? '',
    validadeDias: numero(o.validade_dias),
    premissas: textos(o.premissas),
    exclusoes: textos(o.exclusoes),
    apresentacao: textoOuNulo(o.apresentacao) ?? '',
    historicoSituacao: lista(o.historico_situacao).map((h) => ({
      de: situacaoOuNula(h.de) ?? 'rascunho',
      para: situacaoOuNula(h.para) ?? 'rascunho',
      revisao: numero(h.revisao),
      membroNome: textoOuNulo(h.membro_nome),
      em: texto(h.em),
      observacao: textoOuNulo(h.observacao),
    })),
    margemPb: numeroOuNulo(o.margem_pb),
    formaPreco: o.forma_preco === 'tabela' ? 'tabela' : 'margem',
    visitas: {
      quantidade: numero(v?.quantidade),
      kmPorVisita: numero(v?.km_por_visita),
      outrosPorVisitaCentavos: numero(v?.outros_por_visita_centavos),
    },
    precoVisitasCentavos: numero(o.preco_visitas_centavos),
    base: b
      ? {
          horaTecnicaCentavos: numero(b.hora_tecnica_centavos),
          custoFixoHoraCentavos: numero(b.custo_fixo_hora_centavos),
          margemDesejadaPb: numero(b.margem_desejada_pb),
          margemMinimaPb: numero(b.margem_minima_pb),
          tributosPb: numero(b.tributos_pb),
          taxasPb: numero(b.taxas_pb),
          taxaPorCobrancaCentavos: numero(b.taxa_por_cobranca_centavos),
          taxaPorAssinaturaCentavos: numero(b.taxa_por_assinatura_centavos),
          valorVisitaCentavos: numero(b.valor_visita_centavos),
          custoKmCentavos: numero(b.custo_km_centavos),
          deslocamentoModo: modoDe(b.deslocamento_modo),
          custosFixosMensaisCentavos: numero(b.custos_fixos_mensais_centavos),
          custosFixosEquipeCentavos: numero(b.custos_fixos_equipe_centavos),
          contas: contasDe(b.custos_fixos_detalhe),
          horasVenda: horasDe(b.horas_venda),
          custoHoraPorProfissao: custosDe(b.custo_hora_profissao),
          custoHoraPorMembro: custosDeMembrosDe(b.custo_hora_membro),
        }
      : null,
    atualizadoEm: texto(o.atualizado_em),
    excluidoEm: textoOuNulo(o.excluido_em),
    rowVersion: numero(o.row_version),
    duplicadoDe: duplicadoDe(objeto(o.duplicado_de)),
    itens: lista(o.itens).map((i) => ({
      id: texto(i.id),
      descricao: texto(i.descricao),
      minutos: numero(i.minutos),
      precoCentavos: numero(i.preco_centavos),
      custoDiretoExtraCentavos: numero(i.custo_direto_extra_centavos),
      horaVendaId: textoOuNulo(i.hora_venda_id),
      responsavelId: textoOuNulo(i.responsavel_id),
      mesPrevisto: textoOuNulo(i.mes_previsto),
      quantidadeDezMilesimos: quantidadeDe(i.quantidade),
      precoFechadoCentavos: numeroOuNulo(i.preco_fechado_centavos),
      responsabilidadeTecnica:
        i.responsabilidade_tecnica === 'art' || i.responsabilidade_tecnica === 'rrt'
          ? i.responsabilidade_tecnica
          : null,
      terceiro: terceiroDe(i),
    })),
    despesas: lista(o.despesas).map((d) => ({
      id: texto(d.id),
      descricao: texto(d.descricao),
      estimativaCentavos: numeroOuNulo(d.estimativa_centavos),
      tratamento: tratamento(d.tratamento),
    })),
    parcelas: lista(o.parcelas).map((p) => ({
      id: texto(p.id),
      descricao: texto(p.descricao),
      dias: numero(p.dias),
      percentualPb: numero(p.percentual_pb),
    })),
  }
}

// ---------------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------------

/** Para quem é o orçamento: um empreendimento cadastrado ou um prospecto. */
export type ParaQuem = { empreendimentoId: string } | { prospecto: Prospecto }

function prospectoParaRpc(p: Prospecto) {
  return { nome: p.nome, cnpj: p.cnpj, contato: p.contato, email: p.email, telefone: p.telefone }
}

/** Cria o rascunho com o id gerado na tela: repetir não duplica. */
export async function criarOrcamento(
  id: string,
  consultoriaId: string,
  paraQuem: ParaQuem,
  objetoDoOrcamento: string,
): Promise<string> {
  const { data, error } = await obterSupabase().rpc('criar_orcamento', {
    p_id: id,
    p_consultoria_id: consultoriaId,
    p_empreendimento_id: aceitaNulo(
      'empreendimentoId' in paraQuem ? paraQuem.empreendimentoId : null,
    ),
    p_objeto: objetoDoOrcamento,
    ...('prospecto' in paraQuem ? { p_prospecto: prospectoParaRpc(paraQuem.prospecto) } : {}),
  })
  if (error) throw error
  return data
}

/**
 * Cadastra o prospecto como empreendimento e liga o orçamento a ele. Com CNPJ já cadastrado, o
 * banco liga ao existente. O id nasce na tela: repetir não duplica. Devolve o empreendimento.
 */
export async function cadastrarEmpreendimentoDoProspecto(
  orcamentoId: string,
  novoEmpreendimentoId: string,
): Promise<string> {
  const { data, error } = await obterSupabase().rpc('cadastrar_empreendimento_do_prospecto', {
    p_orcamento_id: orcamentoId,
    p_empreendimento_id: novoEmpreendimentoId,
  })
  if (error) throw error
  return data
}

export interface DadosDoRascunho {
  objeto: string
  destinatario: string
  prazos: string
  validadeDias: number
  premissas: string[]
  exclusoes: string[]
  apresentacao: string
  /** Nula: usa a margem desejada da base. */
  margemPb: number | null
  formaPreco: FormaDePreco
  visitas: VisitasDoOrcamento
  /** Só para orçamento de prospecto ainda sem empreendimento. */
  prospecto?: Prospecto
  itens: ItemParaSalvar[]
  despesas: DespesaDoOrcamento[]
  parcelas: ParcelaDoOrcamento[]
}

/** Salva o rascunho inteiro. Devolve a nova versão (controle otimista). */
export async function salvarOrcamento(
  id: string,
  rowVersion: number,
  dados: DadosDoRascunho,
): Promise<number> {
  const { data, error } = await obterSupabase().rpc('salvar_orcamento', {
    p_id: id,
    p_row_version: rowVersion,
    p_dados: {
      objeto: dados.objeto,
      destinatario: dados.destinatario,
      prazos: dados.prazos,
      validade_dias: dados.validadeDias,
      premissas: dados.premissas,
      exclusoes: dados.exclusoes,
      apresentacao: dados.apresentacao,
      margem_pb: dados.margemPb,
      forma_preco: dados.formaPreco,
      ...(dados.prospecto ? { prospecto: prospectoParaRpc(dados.prospecto) } : {}),
      visitas: {
        quantidade: dados.visitas.quantidade,
        km_por_visita: dados.visitas.kmPorVisita,
        outros_por_visita_centavos: dados.visitas.outrosPorVisitaCentavos,
      },
      itens: dados.itens.map((i) => ({
        id: i.id,
        descricao: i.descricao,
        minutos: i.minutos,
        custo_direto_extra_centavos: i.custoDiretoExtraCentavos,
        hora_venda_id: i.horaVendaId,
        responsavel_id: i.responsavelId,
        mes_previsto: i.mesPrevisto,
        // Texto com até 4 casas: o banco guarda numeric(18,4) exato.
        quantidade:
          i.quantidadeDezMilesimos === null
            ? null
            : textoDaQuantidadeParaOBanco(i.quantidadeDezMilesimos),
        preco_fechado_centavos: i.precoFechadoCentavos,
        responsabilidade_tecnica: i.responsabilidadeTecnica,
        // Terceirizado (ADR-0028): só vai quando o serviço tem um.
        ...(i.terceiro
          ? {
              terceiro_nome: i.terceiro.nome,
              terceiro_profissao: i.terceiro.profissao,
              terceiro_cobranca: i.terceiro.cobranca,
              terceiro_valor_centavos: i.terceiro.valorCentavos,
            }
          : {}),
      })),
      despesas: dados.despesas.map((d) => ({
        id: d.id,
        descricao: d.descricao,
        estimativa_centavos: d.estimativaCentavos,
        tratamento: d.tratamento,
      })),
      parcelas: dados.parcelas.map((p) => ({
        id: p.id,
        descricao: p.descricao,
        dias: p.dias,
        percentual_pb: p.percentualPb,
      })),
    },
  })
  if (error) throw error
  return data
}

// ---------------------------------------------------------------------------
// Base de custos
// ---------------------------------------------------------------------------

/**
 * Pessoa da equipe e como ela recebe (ADR-0018, fatia 3). Dado restrito: só a Gestão. Os valores
 * de remuneração seguem `RemuneracaoDaPessoa` (packages/domain): ausente é nulo, nunca zero.
 */
export interface PessoaDaBase extends RemuneracaoDaPessoa {
  id: string
  descricao: string
  /** Sócio com pró-labore: só identifica a remuneração dos sócios. */
  socio: boolean
  /** Profissão (Eng. ambiental, Biólogo…): agrupa o custo da hora por profissão. */
  profissao: string | null
  /** Membro da consultoria (com login): recebe os serviços dos orçamentos. */
  membroId: string
}

export interface BaseDeCustosDaConsultoria {
  /** Com equipe, é derivada pelo banco; o valor enviado é ignorado. */
  horaTecnicaCentavos: number
  /** Custos fixos digitados (com equipe: sem a remuneração de quem está nela). */
  custosFixosMensaisCentavos: number
  /** Derivado: parte administrativa da remuneração da equipe, que entra no rateio. */
  custosFixosEquipeCentavos: number
  /** Com equipe, são derivadas pelo banco; o valor enviado é ignorado. */
  horasFaturaveisMes: number
  margemDesejadaPb: number
  margemMinimaPb: number
  tributosPb: number
  taxasPb: number
  taxaPorCobrancaCentavos: number
  taxaPorAssinaturaCentavos: number
  /** Vazio: hora técnica e horas faturáveis digitadas. */
  equipe: PessoaDaBase[]
  /** Contas do mês. Com contas, o custo fixo mensal é a soma delas (o banco confere). */
  contas: ContaDoMes[]
  valorVisitaCentavos: number
  /** Derivado pelo banco ao salvar (combustível ÷ consumo + acréscimo); o enviado só vale sem modo. */
  custoKmCentavos: number
  /** "visita" ou "km"; nulo em base salva antes da escolha (deduzir com modoDeDeslocamento). */
  deslocamentoModo: ModoDeDeslocamento | null
  /** Consumo do carro (km/l), preço do litro e acréscimo por km: dão o valor do km. */
  consumoKmPorLitro: number | null
  precoCombustivelCentavos: number | null
  acrescimoKmCentavos: number | null
  /** Tabela de hora de venda, para orçamentos pela tabela. */
  horasVenda: HoraDeVenda[]
  /** Derivado pelo banco ao salvar; a tela só mostra. */
  custoHoraPorProfissao: CustoDaProfissao[]
  /** Versão da base lida (os primeiros passos dizem de qual versão partiram). */
  rowVersion?: number
}

/** Nulo quando ainda não foi configurada. */
export async function obterBaseDeCustos(
  consultoriaId: string,
): Promise<BaseDeCustosDaConsultoria | null> {
  const { data, error } = await obterSupabase().rpc('obter_base_de_custos', {
    p_consultoria_id: consultoriaId,
  })
  if (error) throw error
  const b = objeto(data)
  if (!b) return null
  return {
    horaTecnicaCentavos: numero(b.hora_tecnica_centavos),
    custosFixosMensaisCentavos: numero(b.custos_fixos_mensais_centavos),
    custosFixosEquipeCentavos: numero(b.custos_fixos_equipe_centavos),
    horasFaturaveisMes: numero(b.horas_faturaveis_mes),
    margemDesejadaPb: numero(b.margem_desejada_pb),
    margemMinimaPb: numero(b.margem_minima_pb),
    tributosPb: numero(b.tributos_pb),
    taxasPb: numero(b.taxas_pb),
    taxaPorCobrancaCentavos: numero(b.taxa_por_cobranca_centavos),
    taxaPorAssinaturaCentavos: numero(b.taxa_por_assinatura_centavos),
    equipe: lista(b.equipe).map((p) => ({
      id: texto(p.id),
      descricao: texto(p.descricao),
      membroId: texto(p.membro_id),
      socio: p.socio === true,
      profissao: textoOuNulo(p.profissao),
      forma: FORMAS_DE_RECEBIMENTO.find((f) => f === p.tipo_recebimento) ?? null,
      // Na diária e no projeto o banco deriva o custo do mês: a tela usa os campos próprios.
      custoMensalCentavos:
        p.tipo_recebimento === 'diaria' || p.tipo_recebimento === 'projeto'
          ? null
          : numeroOuNulo(p.custo_mensal_centavos),
      horasNoMes: p.tipo_recebimento === 'diaria' ? null : numeroOuNulo(p.horas_disponiveis_mes),
      custoDiariaCentavos: numeroOuNulo(p.custo_diaria_centavos),
      horasPorDiaria: numeroOuNulo(p.horas_por_diaria),
      diasNoMes: numeroOuNulo(p.dias_no_mes),
      custoProjetoCentavos: numeroOuNulo(p.custo_projeto_centavos),
      horasDoProjeto: numeroOuNulo(p.horas_projeto),
    })),
    contas: contasDe(b.custos_fixos_detalhe),
    valorVisitaCentavos: numero(b.valor_visita_centavos),
    custoKmCentavos: numero(b.custo_km_centavos),
    deslocamentoModo: modoDe(b.deslocamento_modo),
    consumoKmPorLitro: numeroOuNulo(b.consumo_km_por_litro),
    precoCombustivelCentavos: numeroOuNulo(b.preco_combustivel_centavos),
    acrescimoKmCentavos: numeroOuNulo(b.acrescimo_km_centavos),
    horasVenda: horasDe(b.horas_venda),
    custoHoraPorProfissao: custosDe(b.custo_hora_profissao),
    rowVersion: numero(b.row_version),
  }
}

export async function salvarBaseDeCustos(
  consultoriaId: string,
  base: BaseDeCustosDaConsultoria,
): Promise<void> {
  const { error } = await obterSupabase().rpc('salvar_base_de_custos', {
    p_consultoria_id: consultoriaId,
    p_hora_tecnica_centavos: base.horaTecnicaCentavos,
    p_custos_fixos_mensais_centavos: base.custosFixosMensaisCentavos,
    p_horas_faturaveis_mes: base.horasFaturaveisMes,
    p_margem_desejada_pb: base.margemDesejadaPb,
    p_margem_minima_pb: base.margemMinimaPb,
    p_tributos_pb: base.tributosPb,
    p_taxas_pb: base.taxasPb,
    p_taxa_por_cobranca_centavos: base.taxaPorCobrancaCentavos,
    p_taxa_por_assinatura_centavos: base.taxaPorAssinaturaCentavos,
    p_equipe: base.equipe.map(pessoaDaEquipeParaOBanco),
    p_custos_fixos: base.contas.map((c) => ({
      descricao: c.descricao,
      valor_centavos: c.valorCentavos,
    })),
    p_valor_visita_centavos: base.valorVisitaCentavos,
    p_custo_km_centavos: base.custoKmCentavos,
    p_deslocamento_modo: aceitaNulo(base.deslocamentoModo),
    p_consumo_km_por_litro: aceitaNulo(base.consumoKmPorLitro),
    p_preco_combustivel_centavos: aceitaNulo(base.precoCombustivelCentavos),
    p_acrescimo_km_centavos: aceitaNulo(base.acrescimoKmCentavos),
    p_horas_venda: horasDeVendaParaOBanco(base.horasVenda),
  })
  if (error) throw error
}

/** Pessoa da equipe como o banco espera (salvar_base_de_custos e o rascunho dos primeiros passos). */
export function pessoaDaEquipeParaOBanco(p: PessoaDoRascunho) {
  return {
    id: p.id,
    membro_id: p.membroId,
    socio: p.socio,
    profissao: p.profissao,
    tipo_recebimento: p.forma,
    custo_mensal_centavos: p.custoMensalCentavos,
    horas_disponiveis_mes: p.horasNoMes,
    custo_diaria_centavos: p.custoDiariaCentavos,
    horas_por_diaria: p.horasPorDiaria,
    dias_no_mes: p.diasNoMes,
    custo_projeto_centavos: p.custoProjetoCentavos,
    horas_projeto: p.horasDoProjeto,
  }
}

/** Tabela de preços como o banco espera (salvar_base_de_custos e o rascunho dos primeiros passos). */
export function horasDeVendaParaOBanco(horas: readonly HoraDeVenda[]) {
  return horas.map((h) => ({
    id: h.id,
    profissao: h.profissao,
    atividade: h.atividade,
    valor_centavos: h.valorCentavos,
    fonte: h.fonte,
    unidade: h.unidade,
    minutos_por_unidade: h.minutosPorUnidade,
    minimo_centavos: h.minimoCentavos,
    faixas: h.faixas.map((f) => ({
      ate: f.ateDezMilesimos === null ? null : textoDaQuantidadeParaOBanco(f.ateDezMilesimos),
      valor_centavos: f.valorCentavos,
    })),
  }))
}

/** Jornada da equipe e horas já comprometidas em orçamentos aprovados, por membro e mês. */
export interface CargaDaEquipe {
  /** horasMes nulo = capacidade desconhecida. */
  jornada: { membroId: string; horasMes: number | null }[]
  comprometido: { membroId: string; mes: string; minutos: number }[]
}

export async function obterCargaDaEquipe(consultoriaId: string): Promise<CargaDaEquipe> {
  const { data, error } = await obterSupabase().rpc('carga_da_equipe', {
    p_consultoria_id: consultoriaId,
  })
  if (error) throw error
  const c = objeto(data)
  return {
    jornada: lista(c?.jornada).map((j) => ({
      membroId: texto(j.membro_id),
      horasMes: numeroOuNulo(j.horas_mes),
    })),
    comprometido: lista(c?.comprometido).map((x) => ({
      membroId: texto(x.membro_id),
      mes: texto(x.mes),
      minutos: numero(x.minutos),
    })),
  }
}

/** Manda para a lixeira (exclusão lógica). Aprovado não pode. Devolve a versão nova. */
export async function excluirOrcamento(id: string, rowVersion: number): Promise<number> {
  const { data, error } = await obterSupabase().rpc('excluir_orcamento', {
    p_id: id,
    p_row_version: rowVersion,
  })
  if (error) throw error
  return data
}

/** Tira da lixeira e devolve à lista. Devolve a versão nova. */
export async function restaurarOrcamento(id: string, rowVersion: number): Promise<number> {
  const { data, error } = await obterSupabase().rpc('restaurar_orcamento', {
    p_id: id,
    p_row_version: rowVersion,
  })
  if (error) throw error
  return data
}

/** 125000 → "12.5000": a quantidade como o banco espera (ponto decimal, 4 casas). */
export function textoDaQuantidadeParaOBanco(dezMilesimos: number): string {
  const inteiro = Math.floor(dezMilesimos / ESCALA_DA_QUANTIDADE)
  const fracao = dezMilesimos % ESCALA_DA_QUANTIDADE
  return `${String(inteiro)}.${String(fracao).padStart(4, '0')}`
}

// ---------------------------------------------------------------------------
// Modelos próprios e duplicação (ADR-0018, fatia 5; P7)
// ---------------------------------------------------------------------------

export const TAMANHO_PAGINA_MODELOS = 50

/**
 * Modelo de serviço da consultoria: escopo, unidade e horas; sem cliente. Só o preço digitado do
 * serviço (sem linha da tabela) vai junto (ADR-0023).
 */
export interface ModeloDeOrcamento {
  id: string
  nome: string
  objeto: string
  itens: {
    descricao: string
    minutos: number
    /** Linha da tabela de preços; o preço vale o da tabela no momento de aplicar. */
    horaVendaId: string | null
    unidade: UnidadeDeCobranca
    /** Preço digitado do serviço, quando ele não usa a tabela. */
    precoDigitadoCentavos: number | null
  }[]
  /** Entram a cotar. */
  despesas: { descricao: string; tratamento: TratamentoDespesa }[]
  premissas: string[]
  exclusoes: string[]
  rowVersion: number
}

export async function listarModelosDeOrcamento(
  consultoriaId: string,
  busca = '',
  pagina = 0,
): Promise<{ itens: ModeloDeOrcamento[]; total: number }> {
  const { data, error } = await obterSupabase().rpc('listar_modelos_de_orcamento', {
    p_consultoria_id: consultoriaId,
    p_busca: busca,
    p_limite: TAMANHO_PAGINA_MODELOS,
    p_deslocamento: pagina * TAMANHO_PAGINA_MODELOS,
  })
  if (error) throw error
  const r = objeto(data)
  return {
    total: numero(r?.total),
    itens: lista(r?.itens).map((m) => ({
      id: texto(m.id),
      nome: texto(m.nome),
      objeto: texto(m.objeto),
      itens: lista(m.itens).map((i) => ({
        descricao: texto(i.descricao),
        minutos: numero(i.minutos),
        horaVendaId: textoOuNulo(i.hora_venda_id),
        unidade: unidadeDe(i.unidade),
        precoDigitadoCentavos: numeroOuNulo(i.preco_digitado_centavos),
      })),
      despesas: lista(m.despesas).map((d) => ({
        descricao: texto(d.descricao),
        tratamento: tratamento(d.tratamento),
      })),
      premissas: textos(m.premissas),
      exclusoes: textos(m.exclusoes),
      rowVersion: numero(m.row_version),
    })),
  }
}

/** Salva o orçamento (como está no banco) como modelo. Repetir com o mesmo id não duplica. */
export async function salvarModeloDeOrcamento(
  orcamentoId: string,
  modeloId: string,
  nome: string,
): Promise<string> {
  const { data, error } = await obterSupabase().rpc('salvar_modelo_de_orcamento', {
    p_orcamento_id: orcamentoId,
    p_modelo_id: modeloId,
    p_nome: nome,
  })
  if (error) throw error
  return data
}

export async function excluirModeloDeOrcamento(id: string, rowVersion: number): Promise<void> {
  const { error } = await obterSupabase().rpc('excluir_modelo_de_orcamento', {
    p_id: id,
    p_row_version: rowVersion,
  })
  if (error) throw error
}

/** Novo rascunho a partir deste orçamento; os preços dele só vão junto se pedido. */
export async function duplicarOrcamento(
  id: string,
  novoId: string,
  copiarPrecos: boolean,
): Promise<string> {
  const { data, error } = await obterSupabase().rpc('duplicar_orcamento', {
    p_id: id,
    p_novo_id: novoId,
    p_copiar_precos: copiarPrecos,
  })
  if (error) throw error
  return data
}

/** Muda a situação à mão (ORC-04). Reabrir (voltar a rascunho) cria a revisão seguinte. */
export async function mudarSituacaoOrcamento(
  id: string,
  rowVersion: number,
  para: SituacaoOrcamento,
  observacao: string,
): Promise<number> {
  const { data, error } = await obterSupabase().rpc('mudar_situacao_orcamento', {
    p_id: id,
    p_row_version: rowVersion,
    p_para: para,
    p_observacao: observacao,
  })
  if (error) throw error
  return data
}

/** Quem contrata e onde, para a proposta (Protótipo 21). Nulo: prospecto ou sem acesso. */
export interface ContratanteDaProposta {
  empreendimentoNome: string
  /** 14 caracteres, sem máscara. */
  empreendimentoCnpj: string | null
  /** Cliente contratante, quando o empreendimento tem um. */
  clienteNome: string | null
  /** Unidades do empreendimento, pelo nome; o orçamento não aponta uma delas. */
  unidades: { nome: string; endereco: string | null }[]
}

export async function obterContratanteDaProposta(
  id: string,
): Promise<ContratanteDaProposta | null> {
  const { data, error } = await obterSupabase().rpc('obter_contratante_da_proposta', { p_id: id })
  if (error) throw error
  const c = objeto(data)
  if (!c) return null
  return {
    empreendimentoNome: texto(c.empreendimento_nome),
    empreendimentoCnpj: textoOuNulo(c.empreendimento_cnpj),
    clienteNome: textoOuNulo(c.cliente_nome),
    unidades: lista(c.unidades).map((u) => ({
      nome: texto(u.nome),
      endereco: textoOuNulo(u.endereco),
    })),
  }
}

/** Terceirizado do item lido do banco; sem nome, o serviço é da equipe. */
function terceiroDe(i: Objeto): TerceiroDoServico | null {
  const nome = textoOuNulo(i.terceiro_nome)
  if (!nome) return null
  return {
    nome,
    profissao: profissaoDoCodigo(i.terceiro_profissao),
    cobranca: i.terceiro_cobranca === 'fechado' ? 'fechado' : 'hora',
    valorCentavos: numeroOuNulo(i.terceiro_valor_centavos),
  }
}
