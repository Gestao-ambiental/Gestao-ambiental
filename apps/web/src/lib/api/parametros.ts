// Catálogo comercial (planos e configuração) lido do banco, e a edição pela central (ADR-0026,
// "Parâmetros pela central"). Qualquer pessoa logada lê; só o operador com dois fatores muda.

import {
  RECURSOS_DO_PLANO,
  ehCodigoPlano,
  type CatalogoComercial,
  type CodigoPlano,
  type ConfiguracaoComercial,
  type DataCivil,
  type Plano,
  type RecursoDoPlano,
} from '@gestao-ambiental/domain'

import type { Json } from '@/lib/database.types'
import { obterSupabase } from '@/lib/supabase'

export const TAMANHO_PAGINA_HISTORICO_PARAMETROS = 20

/** O banco devolveu um catálogo incompleto (sem os 3 planos). */
export class CatalogoIncompleto extends Error {
  constructor() {
    super('catalogo_incompleto')
  }
}

/** Planos e configuração vigentes (RPC catalogo_comercial). */
export async function obterCatalogoComercial(): Promise<CatalogoComercial> {
  const { data: linhas, error } = await obterSupabase().rpc('catalogo_comercial')
  if (error) throw error
  const dados = Array.isArray(linhas) ? linhas : []
  const planos: Partial<Record<CodigoPlano, Plano>> = {}
  for (const l of dados) {
    if (!ehCodigoPlano(l.codigo)) continue
    planos[l.codigo] = {
      codigo: l.codigo,
      nome: l.nome,
      mensalCentavos: l.mensal_centavos,
      pessoas: l.pessoas,
      empreendimentos: l.empreendimentos,
      orcamentos: l.orcamentos,
      ia: l.ia,
      // Nulo só em servidores falsos antigos; o banco sempre devolve a lista.
      recursos: RECURSOS_DO_PLANO.filter((r) =>
        ((l.recursos as string[] | null) ?? []).includes(r),
      ),
    }
  }
  const primeira = dados[0]
  const { essencial, equipe, escala } = planos
  if (!primeira || !essencial || !equipe || !escala) throw new CatalogoIncompleto()
  return {
    planos: { essencial, equipe, escala },
    configuracao: {
      fimDoBeta: primeira.fim_do_beta as DataCivil,
      diasDeTestePadrao: primeira.dias_de_teste_padrao,
      adicionalMensalCentavos: primeira.adicional_mensal_centavos,
      mensalidadesNoAnual: primeira.mensalidades_no_anual,
      diasUteisDeTolerancia: primeira.dias_uteis_de_tolerancia,
      moeda: primeira.moeda,
    },
  }
}

/** Central: muda um plano (motivo obrigatório; vale para as próximas cobranças). */
export async function atualizarPlano(plano: Plano, motivo: string): Promise<void> {
  const { error } = await obterSupabase().rpc('central_atualizar_plano', {
    p_codigo: plano.codigo,
    p_nome: plano.nome,
    p_mensal_centavos: plano.mensalCentavos,
    p_pessoas: plano.pessoas,
    p_empreendimentos: plano.empreendimentos,
    p_orcamentos: plano.orcamentos,
    p_ia: plano.ia,
    p_motivo: motivo,
  })
  if (error) throw error
}

/** Central: liga e desliga recursos de um plano (motivo obrigatório; ADR-0030). */
export async function definirRecursosDoPlano(
  codigo: CodigoPlano,
  recursos: readonly RecursoDoPlano[],
  motivo: string,
): Promise<void> {
  const { error } = await obterSupabase().rpc('central_definir_recursos_do_plano', {
    p_codigo: codigo,
    p_recursos: [...recursos],
    p_motivo: motivo,
  })
  if (error) throw error
}

/** Central: muda a configuração comercial (motivo obrigatório). */
export async function atualizarConfiguracaoComercial(
  configuracao: ConfiguracaoComercial,
  motivo: string,
): Promise<void> {
  const { error } = await obterSupabase().rpc('central_atualizar_configuracao_comercial', {
    p_fim_do_beta: configuracao.fimDoBeta,
    p_dias_de_teste_padrao: configuracao.diasDeTestePadrao,
    p_adicional_mensal_centavos: configuracao.adicionalMensalCentavos,
    p_mensalidades_no_anual: configuracao.mensalidadesNoAnual,
    p_dias_uteis_de_tolerancia: configuracao.diasUteisDeTolerancia,
    p_motivo: motivo,
  })
  if (error) throw error
}

export interface MudancaDeParametro {
  id: string
  /** 'configuracao' ou 'plano:<codigo>'. */
  alvo: string
  antes: Record<string, Json | undefined>
  depois: Record<string, Json | undefined>
  motivo: string
  alteradaEm: string
  alteradaPorNome: string
}

function objeto(valor: Json): Record<string, Json | undefined> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor) ? valor : {}
}

/** Central: histórico das mudanças de planos e configuração (mais recente primeiro). */
export async function listarHistoricoDeParametros(
  pagina: number,
): Promise<{ itens: MudancaDeParametro[]; total: number }> {
  const { data: linhas, error } = await obterSupabase().rpc('central_historico_parametros', {
    p_limite: TAMANHO_PAGINA_HISTORICO_PARAMETROS,
    p_deslocamento: pagina * TAMANHO_PAGINA_HISTORICO_PARAMETROS,
  })
  if (error) throw error
  const dados = Array.isArray(linhas) ? linhas : []
  return {
    itens: dados.map((l) => ({
      id: l.id,
      alvo: l.alvo,
      antes: objeto(l.antes),
      depois: objeto(l.depois),
      motivo: l.motivo,
      alteradaEm: l.alterada_em,
      alteradaPorNome: l.alterada_por_nome,
    })),
    total: dados[0]?.total ?? 0,
  }
}
