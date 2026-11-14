// Sinal de uso diário (ADR-0024): registra que a pessoa usou uma área do sistema na consultoria.
// Nunca falha para quem usa: erro de rede ou do banco é engolido aqui.

import type { ModuloDeUso } from '@gestao-ambiental/domain'

import { obterSupabase } from '@/lib/supabase'

export async function registrarUso(consultoriaId: string, modulo: ModuloDeUso): Promise<void> {
  try {
    await obterSupabase().rpc('registrar_uso', {
      p_consultoria_id: consultoriaId,
      p_modulo: modulo,
    })
  } catch {
    // Registro de uso é só sinal para a central: sem aviso, sem nova tentativa.
  }
}
