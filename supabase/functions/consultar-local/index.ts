// Edge Function consultar-local (docs/estudos/enquadramento-automatico.md).
//
// Recebe { latitude, longitude } de quem está logado e consulta camadas públicas do IMA/SC e do
// SIMGeo de Joinville: município, lote e inscrição imobiliária, zoneamento e restrições (APP,
// inundação, risco, unidades de conservação, terras indígenas e quilombolas). Sem segredos e sem
// banco; nada da consulta vai para o log. As regras ficam em _shared/consulta-de-local.ts.

import { criarTratadorDaConsultaDeLocal } from '../_shared/consulta-de-local.ts'

Deno.serve(criarTratadorDaConsultaDeLocal({ fetch }))
