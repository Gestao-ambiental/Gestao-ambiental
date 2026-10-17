// Regras de acesso e equipe (épico 2; ACC-02, ACC-04). O banco aplica as mesmas regras nas RPCs;
// aqui elas servem para a tela explicar antes (opção desabilitada com motivo), nunca para autorizar.

export type PapelMembro = 'gestao' | 'equipe'
export type SituacaoMembro = 'ativo' | 'desligado'
export type SituacaoConviteGravada = 'pendente' | 'aceito' | 'cancelado'
export type SituacaoConvite = SituacaoConviteGravada | 'expirado'

/** Validade do convite (Protótipo 07: "O convite vale por 7 dias"). O banco usa o mesmo valor. */
export const VALIDADE_CONVITE_DIAS = 7

/**
 * Situação exibida do convite. "Expirado" é calculado: pendente com `expiraEm` (instante ISO)
 * já passado em `agora`. Aceito e cancelado não expiram.
 */
export function situacaoDoConvite(
  convite: { situacao: SituacaoConviteGravada; expiraEm: string },
  agora: Date,
): SituacaoConvite {
  if (convite.situacao !== 'pendente') return convite.situacao
  return Date.parse(convite.expiraEm) <= agora.getTime() ? 'expirado' : 'pendente'
}

export interface VinculoResumo {
  id: string
  papel: PapelMembro
  situacao: SituacaoMembro
}

/** Por que uma ação sobre um vínculo não pode ser feita, ou `null` se pode. */
export type ImpedimentoDoVinculo = 'ultima_gestao' | 'membro_desligado' | null

/**
 * A consultoria precisa de pelo menos uma Gestão ativa: a única Gestão não passa para Equipe
 * nem é desligada. Vínculo desligado não muda de papel (desligar de novo é inofensivo).
 */
export function impedimentoDoVinculo(
  vinculos: readonly VinculoResumo[],
  alvoId: string,
  acao: 'passar_para_equipe' | 'passar_para_gestao' | 'desligar',
): ImpedimentoDoVinculo {
  const alvo = vinculos.find((vinculo) => vinculo.id === alvoId)
  if (!alvo) return null
  if (alvo.situacao === 'desligado') return acao === 'desligar' ? null : 'membro_desligado'
  if (acao === 'passar_para_gestao' || alvo.papel !== 'gestao') return null
  const gestoesAtivas = vinculos.filter(
    (vinculo) => vinculo.situacao === 'ativo' && vinculo.papel === 'gestao',
  ).length
  return gestoesAtivas <= 1 ? 'ultima_gestao' : null
}

/**
 * Consultoria aberta ao entrar (ACC-04): a preferida, se ainda for um vínculo ativo; senão, a
 * única ativa. Com mais de uma ativa e sem preferida válida, `null` (a pessoa escolhe).
 */
export function consultoriaInicial(
  ativas: readonly { consultoriaId: string }[],
  preferidaId: string | null,
): string | null {
  if (preferidaId && ativas.some((vinculo) => vinculo.consultoriaId === preferidaId)) {
    return preferidaId
  }
  return ativas.length === 1 ? (ativas[0]?.consultoriaId ?? null) : null
}
