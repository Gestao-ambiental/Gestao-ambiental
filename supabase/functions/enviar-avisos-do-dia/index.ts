// Edge Function enviar-avisos-do-dia (ADR-0047): resumo diário por e-mail. Chamada pelo pg_cron
// (pg_net) a cada 15 minutos com o header x-cron-token; a regra fica em _shared/avisos-do-dia.ts.
// verify_jwt = false (supabase/config.toml): quem protege é o CRON_TOKEN.
// Segredos: CRON_TOKEN, RESEND_API_KEY, AVISO_REMETENTE e AVISO_ASSINATURA; LINK_DO_BETA opcional.
// Nunca em log: e-mails, nomes, tokens, a chave e o conteúdo.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'

import {
  criarTratadorDosAvisos,
  type GrupoDoResumo,
  type ItemDoResumo,
  type PendenteDoDia,
} from '../_shared/avisos-do-dia.ts'

const url = Deno.env.get('SUPABASE_URL') ?? ''
const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const admin = createClient(url, servico, {
  auth: { persistSession: false, autoRefreshToken: false },
})

interface PendenteDoBanco {
  consultoria_id: string
  consultoria_nome: string
  membro_id: string
  membro_nome: string
  email: string
  papel: 'gestao' | 'equipe'
  dia: string
}

interface ItemDoBanco {
  grupo: GrupoDoResumo
  tipo_linha: string
  id: string
  prazo: string
  dias: number
  codigo: string | null
  titulo: string | null
  empreendimento_nome: string | null
  unidade_nome: string | null
  licenca: string | null
}

Deno.serve(
  criarTratadorDosAvisos({
    env: (nome) => Deno.env.get(nome),
    fetch,
    async pendentes(): Promise<PendenteDoDia[]> {
      const { data, error } = await admin.rpc('avisos_do_dia_pendentes', {})
      if (error) throw new Error('pendentes')
      return ((data ?? []) as PendenteDoBanco[]).map((p) => ({
        consultoriaId: p.consultoria_id,
        consultoriaNome: p.consultoria_nome,
        membroId: p.membro_id,
        membroNome: p.membro_nome,
        email: p.email,
        papel: p.papel,
        dia: p.dia,
      }))
    },
    async itens(consultoriaId, membroId, dia): Promise<ItemDoResumo[]> {
      const { data, error } = await admin.rpc('itens_do_resumo_diario', {
        p_consultoria_id: consultoriaId,
        p_membro_id: membroId,
        p_dia: dia,
      })
      if (error) throw new Error('itens')
      return ((data ?? []) as ItemDoBanco[]).map((i) => ({
        grupo: i.grupo,
        tipoLinha: i.tipo_linha,
        id: i.id,
        prazo: i.prazo,
        dias: Number(i.dias),
        codigo: i.codigo,
        titulo: i.titulo,
        empreendimentoNome: i.empreendimento_nome,
        unidadeNome: i.unidade_nome,
        licenca: i.licenca,
      }))
    },
    async reservar(consultoriaId, membroId, dia) {
      const { data, error } = await admin.rpc('reservar_aviso_do_dia', {
        p_consultoria_id: consultoriaId,
        p_membro_id: membroId,
        p_dia: dia,
      })
      if (error) throw new Error('reservar')
      return typeof data === 'string' ? data : null
    },
    async registrarResultado(id, situacao, provedorId) {
      const { data, error } = await admin.rpc('registrar_aviso_do_dia', {
        p_id: id,
        p_situacao: situacao,
        p_provedor_id: provedorId ?? undefined,
      })
      if (error) throw new Error('registrar')
      return data === true
    },
  }),
)
