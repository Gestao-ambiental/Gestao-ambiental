-- Envio cancelado por quem enviou, antes da conferência (Tela 16 v2; DEM-03). Fica num arquivo
-- próprio: valor novo de enum só pode ser usado depois do commit.
alter type public.situacao_evidencia add value if not exists 'cancelada';
