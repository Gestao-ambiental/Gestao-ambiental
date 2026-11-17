
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "acesso_suporte": {
                  Row: {
                    "aberto_por": string | null,"autorizado_por": string | null,"categoria": string | null,"consultoria_id": string,"fim_previsto": string,"id": string,"inicio": string,"modo": string,"motivo": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "aberto_por"?: string | null,"autorizado_por"?: string | null,"categoria"?: string | null,"consultoria_id": string,"fim_previsto": string,"id": string,"inicio"?: string,"modo": string,"motivo"?: string | null
                  }
                  Update: {
                    "aberto_por"?: string | null,"autorizado_por"?: string | null,"categoria"?: string | null,"consultoria_id"?: string,"fim_previsto"?: string,"id"?: string,"inicio"?: string,"modo"?: string,"motivo"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "acesso_suporte_autorizado_por_fk"
      columns: ["consultoria_id","autorizado_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "acesso_suporte_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    }
                  ]
                },"acesso_suporte_evento": {
                  Row: {
                    "acesso_id": string,"consultoria_id": string,"id": string,"instante": string,"membro_id": string | null,"tipo": string,"usuario_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "acesso_id": string,"consultoria_id": string,"id"?: string,"instante"?: string,"membro_id"?: string | null,"tipo": string,"usuario_id"?: string | null
                  }
                  Update: {
                    "acesso_id"?: string,"consultoria_id"?: string,"id"?: string,"instante"?: string,"membro_id"?: string | null,"tipo"?: string,"usuario_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "acesso_suporte_evento_acesso_fk"
      columns: ["consultoria_id","acesso_id"]
isOneToOne: false
      referencedRelation: "acesso_suporte"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "acesso_suporte_evento_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "acesso_suporte_evento_membro_fk"
      columns: ["consultoria_id","membro_id"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"adicional_confirmado": {
                  Row: {
                    "adicionais_centavos": number,"confirmado_em": string,"confirmado_por": string,"consultoria_id": string,"id": string,"limite": number,"plano": string,"quantidade": number,"recurso": string
                  }
                  ComputedFields: never
                  Insert: {
                    "adicionais_centavos": number,"confirmado_em"?: string,"confirmado_por": string,"consultoria_id": string,"id"?: string,"limite": number,"plano": string,"quantidade": number,"recurso": string
                  }
                  Update: {
                    "adicionais_centavos"?: number,"confirmado_em"?: string,"confirmado_por"?: string,"consultoria_id"?: string,"id"?: string,"limite"?: number,"plano"?: string,"quantidade"?: number,"recurso"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "adicional_confirmado_autor_fk"
      columns: ["consultoria_id","confirmado_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "adicional_confirmado_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    }
                  ]
                },"alvara": {
                  Row: {
                    "anterior_id": string | null,"consultoria_id": string,"criado_em": string,"criado_por": string,"documento_id": string,"empreendimento_id": string,"excluido_em": string | null,"excluido_por": string | null,"id": string,"notas": string | null,"numero": string | null,"orgao": string | null,"row_version": number,"unidade_id": string,"validade": string
                  }
                  ComputedFields: never
                  Insert: {
                    "anterior_id"?: string | null,"consultoria_id": string,"criado_em"?: string,"criado_por": string,"documento_id": string,"empreendimento_id": string,"excluido_em"?: string | null,"excluido_por"?: string | null,"id"?: string,"notas"?: string | null,"numero"?: string | null,"orgao"?: string | null,"row_version"?: number,"unidade_id": string,"validade": string
                  }
                  Update: {
                    "anterior_id"?: string | null,"consultoria_id"?: string,"criado_em"?: string,"criado_por"?: string,"documento_id"?: string,"empreendimento_id"?: string,"excluido_em"?: string | null,"excluido_por"?: string | null,"id"?: string,"notas"?: string | null,"numero"?: string | null,"orgao"?: string | null,"row_version"?: number,"unidade_id"?: string,"validade"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "alvara_anterior_fk"
      columns: ["consultoria_id","anterior_id"]
isOneToOne: false
      referencedRelation: "alvara"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "alvara_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "alvara_criado_por_fk"
      columns: ["consultoria_id","criado_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "alvara_documento_fk"
      columns: ["consultoria_id","documento_id"]
isOneToOne: false
      referencedRelation: "documento"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "alvara_excluido_por_fk"
      columns: ["consultoria_id","excluido_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "alvara_unidade_fk"
      columns: ["consultoria_id","empreendimento_id","unidade_id"]
isOneToOne: false
      referencedRelation: "unidade"
      referencedColumns: ["consultoria_id","empreendimento_id","id"]
    }
                  ]
                },"assinatura": {
                  Row: {
                    "asaas_assinatura_id": string | null,"asaas_cliente_id": string | null,"atualizada_em": string,"cancelada_em": string | null,"ciclo": string,"ciclo_agendado": string | null,"consultoria_id": string,"criada_em": string,"forma": string,"id": string,"moeda": string,"mudanca_em": string | null,"plano": string,"plano_agendado": string | null,"proximo_vencimento": string | null,"row_version": number,"situacao_asaas": string,"valida_ate": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "asaas_assinatura_id"?: string | null,"asaas_cliente_id"?: string | null,"atualizada_em"?: string,"cancelada_em"?: string | null,"ciclo": string,"ciclo_agendado"?: string | null,"consultoria_id": string,"criada_em"?: string,"forma": string,"id"?: string,"moeda"?: string,"mudanca_em"?: string | null,"plano": string,"plano_agendado"?: string | null,"proximo_vencimento"?: string | null,"row_version"?: number,"situacao_asaas"?: string,"valida_ate"?: string | null
                  }
                  Update: {
                    "asaas_assinatura_id"?: string | null,"asaas_cliente_id"?: string | null,"atualizada_em"?: string,"cancelada_em"?: string | null,"ciclo"?: string,"ciclo_agendado"?: string | null,"consultoria_id"?: string,"criada_em"?: string,"forma"?: string,"id"?: string,"moeda"?: string,"mudanca_em"?: string | null,"plano"?: string,"plano_agendado"?: string | null,"proximo_vencimento"?: string | null,"row_version"?: number,"situacao_asaas"?: string,"valida_ate"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "assinatura_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: true
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    }
                  ]
                },"auditoria": {
                  Row: {
                    "acao": Database["public"]['Enums']["acao_auditoria"],"antes": Json | null,"ator_membro_id": string | null,"consultoria_id": string,"depois": Json | null,"entidade": string,"entidade_id": string,"id": number,"instante": string,"motivo": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "acao": Database["public"]['Enums']["acao_auditoria"],"antes"?: Json | null,"ator_membro_id"?: string | null,"consultoria_id": string,"depois"?: Json | null,"entidade": string,"entidade_id": string,"id"?: never,"instante"?: string,"motivo"?: string | null
                  }
                  Update: {
                    "acao"?: Database["public"]['Enums']["acao_auditoria"],"antes"?: Json | null,"ator_membro_id"?: string | null,"consultoria_id"?: string,"depois"?: Json | null,"entidade"?: string,"entidade_id"?: string,"id"?: never,"instante"?: string,"motivo"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "auditoria_ator_fk"
      columns: ["consultoria_id","ator_membro_id"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "auditoria_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    }
                  ]
                },"cdf": {
                  Row: {
                    "atualizado_em": string,"consultoria_id": string,"criado_em": string,"criado_por": string,"destinador_cnpj": string | null,"destinador_nome": string,"documento_id": string | null,"emitido_em": string,"empreendimento_id": string,"excluido_em": string | null,"excluido_por": string | null,"id": string,"numero": string,"observacao": string | null,"periodo_fim": string,"periodo_inicio": string,"row_version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "atualizado_em"?: string,"consultoria_id": string,"criado_em"?: string,"criado_por": string,"destinador_cnpj"?: string | null,"destinador_nome": string,"documento_id"?: string | null,"emitido_em": string,"empreendimento_id": string,"excluido_em"?: string | null,"excluido_por"?: string | null,"id"?: string,"numero": string,"observacao"?: string | null,"periodo_fim": string,"periodo_inicio": string,"row_version"?: number
                  }
                  Update: {
                    "atualizado_em"?: string,"consultoria_id"?: string,"criado_em"?: string,"criado_por"?: string,"destinador_cnpj"?: string | null,"destinador_nome"?: string,"documento_id"?: string | null,"emitido_em"?: string,"empreendimento_id"?: string,"excluido_em"?: string | null,"excluido_por"?: string | null,"id"?: string,"numero"?: string,"observacao"?: string | null,"periodo_fim"?: string,"periodo_inicio"?: string,"row_version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "cdf_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cdf_criado_por_fk"
      columns: ["consultoria_id","criado_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "cdf_documento_fk"
      columns: ["consultoria_id","documento_id"]
isOneToOne: false
      referencedRelation: "documento"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "cdf_empreendimento_fk"
      columns: ["consultoria_id","empreendimento_id"]
isOneToOne: false
      referencedRelation: "empreendimento"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "cdf_excluido_por_fk"
      columns: ["consultoria_id","excluido_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"cdf_mtr": {
                  Row: {
                    "cdf_id": string,"consultoria_id": string,"empreendimento_id": string,"id": string,"mtr_id": string,"mtr_item_id": string,"quantidade": number | null,"unidade": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "cdf_id": string,"consultoria_id": string,"empreendimento_id": string,"id"?: string,"mtr_id": string,"mtr_item_id": string,"quantidade"?: number | null,"unidade"?: string | null
                  }
                  Update: {
                    "cdf_id"?: string,"consultoria_id"?: string,"empreendimento_id"?: string,"id"?: string,"mtr_id"?: string,"mtr_item_id"?: string,"quantidade"?: number | null,"unidade"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "cdf_mtr_cdf_fk"
      columns: ["consultoria_id","empreendimento_id","cdf_id"]
isOneToOne: false
      referencedRelation: "cdf"
      referencedColumns: ["consultoria_id","empreendimento_id","id"]
    },{
      foreignKeyName: "cdf_mtr_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "cdf_mtr_item_fk"
      columns: ["consultoria_id","mtr_id","mtr_item_id"]
isOneToOne: false
      referencedRelation: "mtr_item"
      referencedColumns: ["consultoria_id","mtr_id","id"]
    },{
      foreignKeyName: "cdf_mtr_mtr_fk"
      columns: ["consultoria_id","empreendimento_id","mtr_id"]
isOneToOne: false
      referencedRelation: "mtr"
      referencedColumns: ["consultoria_id","empreendimento_id","id"]
    }
                  ]
                },"cliente": {
                  Row: {
                    "consultoria_id": string,"criado_em": string,"id": string,"nome": string,"nome_normalizado": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "consultoria_id": string,"criado_em"?: string,"id"?: string,"nome": string,"nome_normalizado"?: never
                  }
                  Update: {
                    "consultoria_id"?: string,"criado_em"?: string,"id"?: string,"nome"?: string,"nome_normalizado"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "cliente_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    }
                  ]
                },"cobranca": {
                  Row: {
                    "asaas_assinatura_id": string | null,"asaas_cobranca_id": string | null,"assinatura_id": string,"atualizada_em": string,"consultoria_id": string,"criada_em": string,"forma": string | null,"id": string,"invoice_url": string | null,"moeda": string,"pago_em": string | null,"situacao": string,"tipo": string,"valor_centavos": number,"vencimento": string
                  }
                  ComputedFields: never
                  Insert: {
                    "asaas_assinatura_id"?: string | null,"asaas_cobranca_id"?: string | null,"assinatura_id": string,"atualizada_em"?: string,"consultoria_id": string,"criada_em"?: string,"forma"?: string | null,"id"?: string,"invoice_url"?: string | null,"moeda"?: string,"pago_em"?: string | null,"situacao": string,"tipo": string,"valor_centavos": number,"vencimento": string
                  }
                  Update: {
                    "asaas_assinatura_id"?: string | null,"asaas_cobranca_id"?: string | null,"assinatura_id"?: string,"atualizada_em"?: string,"consultoria_id"?: string,"criada_em"?: string,"forma"?: string | null,"id"?: string,"invoice_url"?: string | null,"moeda"?: string,"pago_em"?: string | null,"situacao"?: string,"tipo"?: string,"valor_centavos"?: number,"vencimento"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "cobranca_assinatura_fk"
      columns: ["consultoria_id","assinatura_id"]
isOneToOne: false
      referencedRelation: "assinatura"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "cobranca_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    }
                  ]
                },"condicao_comercial_historico": {
                  Row: {
                    "alterada_em": string,"alterada_por": string,"consultoria_id": string,"id": string,"motivo": string,"tipo": string,"valor_anterior": string,"valor_novo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "alterada_em"?: string,"alterada_por": string,"consultoria_id": string,"id"?: string,"motivo": string,"tipo": string,"valor_anterior": string,"valor_novo": string
                  }
                  Update: {
                    "alterada_em"?: string,"alterada_por"?: string,"consultoria_id"?: string,"id"?: string,"motivo"?: string,"tipo"?: string,"valor_anterior"?: string,"valor_novo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "condicao_comercial_historico_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    }
                  ]
                },"condicionante": {
                  Row: {
                    "aceita_sem_edicao": boolean | null,"codigo": string,"consultoria_id": string,"criado_em": string,"extracao_id": string | null,"fonte_pagina": number | null,"id": string,"instrumento_id": string,"origem": string,"pai_id": string | null,"posicao": number,"proposta_ia": Json | null,"responsavel_id": string | null,"revisao": Database["public"]['Enums']["revisao_condicionante"],"versao_vigente_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "aceita_sem_edicao"?: boolean | null,"codigo": string,"consultoria_id": string,"criado_em"?: string,"extracao_id"?: string | null,"fonte_pagina"?: number | null,"id"?: string,"instrumento_id": string,"origem"?: string,"pai_id"?: string | null,"posicao": number,"proposta_ia"?: Json | null,"responsavel_id"?: string | null,"revisao"?: Database["public"]['Enums']["revisao_condicionante"],"versao_vigente_id"?: string | null
                  }
                  Update: {
                    "aceita_sem_edicao"?: boolean | null,"codigo"?: string,"consultoria_id"?: string,"criado_em"?: string,"extracao_id"?: string | null,"fonte_pagina"?: number | null,"id"?: string,"instrumento_id"?: string,"origem"?: string,"pai_id"?: string | null,"posicao"?: number,"proposta_ia"?: Json | null,"responsavel_id"?: string | null,"revisao"?: Database["public"]['Enums']["revisao_condicionante"],"versao_vigente_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "condicionante_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "condicionante_extracao_fk"
      columns: ["consultoria_id","extracao_id"]
isOneToOne: false
      referencedRelation: "extracao_ia"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "condicionante_instrumento_fk"
      columns: ["consultoria_id","instrumento_id"]
isOneToOne: false
      referencedRelation: "instrumento"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "condicionante_pai_fk"
      columns: ["consultoria_id","instrumento_id","pai_id"]
isOneToOne: false
      referencedRelation: "condicionante"
      referencedColumns: ["consultoria_id","instrumento_id","id"]
    },{
      foreignKeyName: "condicionante_responsavel_fk"
      columns: ["consultoria_id","responsavel_id"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "condicionante_versao_vigente_fk"
      columns: ["consultoria_id","versao_vigente_id"]
isOneToOne: false
      referencedRelation: "condicionante_versao"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"condicionante_versao": {
                  Row: {
                    "condicionante_id": string,"consultoria_id": string,"contagem": Database["public"]['Enums']["contagem_prazo"],"criado_em": string,"data_referencia": string | null,"fonte_regra": string | null,"id": string,"intervalo_ciclo": number | null,"natureza": Database["public"]['Enums']["natureza_condicionante"],"numero": number,"prazo_confirmado_em": string | null,"prazo_confirmado_por": string | null,"primeira_data": string | null,"recorrencia": Database["public"]['Enums']["recorrencia_prazo"] | null,"texto_literal": string,"titulo": string,"unidade_ciclo": Database["public"]['Enums']["unidade_ciclo"] | null
                  }
                  ComputedFields: never
                  Insert: {
                    "condicionante_id": string,"consultoria_id": string,"contagem"?: Database["public"]['Enums']["contagem_prazo"],"criado_em"?: string,"data_referencia"?: string | null,"fonte_regra"?: string | null,"id"?: string,"intervalo_ciclo"?: number | null,"natureza": Database["public"]['Enums']["natureza_condicionante"],"numero"?: number,"prazo_confirmado_em"?: string | null,"prazo_confirmado_por"?: string | null,"primeira_data"?: string | null,"recorrencia"?: Database["public"]['Enums']["recorrencia_prazo"] | null,"texto_literal"?: string,"titulo": string,"unidade_ciclo"?: Database["public"]['Enums']["unidade_ciclo"] | null
                  }
                  Update: {
                    "condicionante_id"?: string,"consultoria_id"?: string,"contagem"?: Database["public"]['Enums']["contagem_prazo"],"criado_em"?: string,"data_referencia"?: string | null,"fonte_regra"?: string | null,"id"?: string,"intervalo_ciclo"?: number | null,"natureza"?: Database["public"]['Enums']["natureza_condicionante"],"numero"?: number,"prazo_confirmado_em"?: string | null,"prazo_confirmado_por"?: string | null,"primeira_data"?: string | null,"recorrencia"?: Database["public"]['Enums']["recorrencia_prazo"] | null,"texto_literal"?: string,"titulo"?: string,"unidade_ciclo"?: Database["public"]['Enums']["unidade_ciclo"] | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "condicionante_versao_condicionante_fk"
      columns: ["consultoria_id","condicionante_id"]
isOneToOne: false
      referencedRelation: "condicionante"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "condicionante_versao_confirmado_por_fk"
      columns: ["consultoria_id","prazo_confirmado_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "condicionante_versao_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    }
                  ]
                },"conferencia": {
                  Row: {
                    "conferente_id": string,"consultoria_id": string,"decidida_em": string,"decisao": Database["public"]['Enums']["decisao_conferencia"],"evidencia_id": string,"id": string,"motivo": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "conferente_id": string,"consultoria_id": string,"decidida_em"?: string,"decisao": Database["public"]['Enums']["decisao_conferencia"],"evidencia_id": string,"id"?: string,"motivo"?: string | null
                  }
                  Update: {
                    "conferente_id"?: string,"consultoria_id"?: string,"decidida_em"?: string,"decisao"?: Database["public"]['Enums']["decisao_conferencia"],"evidencia_id"?: string,"id"?: string,"motivo"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "conferencia_conferente_fk"
      columns: ["consultoria_id","conferente_id"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "conferencia_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "conferencia_evidencia_fk"
      columns: ["consultoria_id","evidencia_id"]
isOneToOne: false
      referencedRelation: "evidencia"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"consultoria": {
                  Row: {
                    "conferencia_independente": boolean,"criada_em": string,"fuso": string,"id": string,"nome": string,"row_version": number,"situacao": Database["public"]['Enums']["situacao_consultoria"],"situacao_alterada_em": string | null,"situacao_alterada_por": string | null,"situacao_motivo": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "conferencia_independente"?: boolean,"criada_em"?: string,"fuso"?: string,"id"?: string,"nome": string,"row_version"?: number,"situacao"?: Database["public"]['Enums']["situacao_consultoria"],"situacao_alterada_em"?: string | null,"situacao_alterada_por"?: string | null,"situacao_motivo"?: string | null
                  }
                  Update: {
                    "conferencia_independente"?: boolean,"criada_em"?: string,"fuso"?: string,"id"?: string,"nome"?: string,"row_version"?: number,"situacao"?: Database["public"]['Enums']["situacao_consultoria"],"situacao_alterada_em"?: string | null,"situacao_alterada_por"?: string | null,"situacao_motivo"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"consultoria_condicao_comercial": {
                  Row: {
                    "alterada_em": string,"alterada_por": string | null,"consultoria_id": string,"contrato_ate": string | null,"dias_de_teste": number,"id": string,"interna": boolean,"plano_contrato": string | null,"row_version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "alterada_em"?: string,"alterada_por"?: string | null,"consultoria_id": string,"contrato_ate"?: string | null,"dias_de_teste"?: number,"id"?: string,"interna"?: boolean,"plano_contrato"?: string | null,"row_version"?: number
                  }
                  Update: {
                    "alterada_em"?: string,"alterada_por"?: string | null,"consultoria_id"?: string,"contrato_ate"?: string | null,"dias_de_teste"?: number,"id"?: string,"interna"?: boolean,"plano_contrato"?: string | null,"row_version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "consultoria_condicao_comercial_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: true
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    }
                  ]
                },"consultoria_identidade": {
                  Row: {
                    "atualizado_em": string,"atualizado_por": string,"cnpj": string | null,"consultoria_id": string,"email": string | null,"endereco": string | null,"id": string,"logo_documento_id": string | null,"razao_social": string | null,"row_version": number,"site": string | null,"telefone": string | null,"texto_apresentacao": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "atualizado_em"?: string,"atualizado_por": string,"cnpj"?: string | null,"consultoria_id": string,"email"?: string | null,"endereco"?: string | null,"id"?: string,"logo_documento_id"?: string | null,"razao_social"?: string | null,"row_version"?: number,"site"?: string | null,"telefone"?: string | null,"texto_apresentacao"?: string | null
                  }
                  Update: {
                    "atualizado_em"?: string,"atualizado_por"?: string,"cnpj"?: string | null,"consultoria_id"?: string,"email"?: string | null,"endereco"?: string | null,"id"?: string,"logo_documento_id"?: string | null,"razao_social"?: string | null,"row_version"?: number,"site"?: string | null,"telefone"?: string | null,"texto_apresentacao"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "consultoria_identidade_autor_fk"
      columns: ["consultoria_id","atualizado_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "consultoria_identidade_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: true
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "consultoria_identidade_logo_fk"
      columns: ["consultoria_id","logo_documento_id"]
isOneToOne: false
      referencedRelation: "documento"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"consultoria_situacao_historico": {
                  Row: {
                    "alterada_em": string,"alterada_por": string,"chave": string,"consultoria_id": string,"id": string,"motivo": string,"row_version_resultante": number,"situacao_anterior": Database["public"]['Enums']["situacao_consultoria"],"situacao_nova": Database["public"]['Enums']["situacao_consultoria"]
                  }
                  ComputedFields: never
                  Insert: {
                    "alterada_em"?: string,"alterada_por": string,"chave": string,"consultoria_id": string,"id"?: string,"motivo": string,"row_version_resultante": number,"situacao_anterior": Database["public"]['Enums']["situacao_consultoria"],"situacao_nova": Database["public"]['Enums']["situacao_consultoria"]
                  }
                  Update: {
                    "alterada_em"?: string,"alterada_por"?: string,"chave"?: string,"consultoria_id"?: string,"id"?: string,"motivo"?: string,"row_version_resultante"?: number,"situacao_anterior"?: Database["public"]['Enums']["situacao_consultoria"],"situacao_nova"?: Database["public"]['Enums']["situacao_consultoria"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "consultoria_situacao_historico_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    }
                  ]
                },"convite": {
                  Row: {
                    "aceito_em": string | null,"aceito_por": string | null,"cancelado_em": string | null,"consultoria_id": string,"convidado_por": string,"criado_em": string,"email": string,"enviado_em": string,"expira_em": string,"id": string,"papel": Database["public"]['Enums']["papel_membro"],"situacao": Database["public"]['Enums']["situacao_convite"],"token_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "aceito_em"?: string | null,"aceito_por"?: string | null,"cancelado_em"?: string | null,"consultoria_id": string,"convidado_por": string,"criado_em"?: string,"email": string,"enviado_em"?: string,"expira_em": string,"id"?: string,"papel": Database["public"]['Enums']["papel_membro"],"situacao"?: Database["public"]['Enums']["situacao_convite"],"token_hash": string
                  }
                  Update: {
                    "aceito_em"?: string | null,"aceito_por"?: string | null,"cancelado_em"?: string | null,"consultoria_id"?: string,"convidado_por"?: string,"criado_em"?: string,"email"?: string,"enviado_em"?: string,"expira_em"?: string,"id"?: string,"papel"?: Database["public"]['Enums']["papel_membro"],"situacao"?: Database["public"]['Enums']["situacao_convite"],"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "convite_aceito_por_fk"
      columns: ["consultoria_id","aceito_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "convite_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "convite_convidado_por_fk"
      columns: ["consultoria_id","convidado_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"documento": {
                  Row: {
                    "consultoria_id": string,"criado_em": string,"entidade": string,"excluido_em": string | null,"id": string,"versao_vigente_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "consultoria_id": string,"criado_em"?: string,"entidade": string,"excluido_em"?: string | null,"id"?: string,"versao_vigente_id"?: string | null
                  }
                  Update: {
                    "consultoria_id"?: string,"criado_em"?: string,"entidade"?: string,"excluido_em"?: string | null,"id"?: string,"versao_vigente_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "documento_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "documento_versao_vigente_fk"
      columns: ["consultoria_id","versao_vigente_id"]
isOneToOne: false
      referencedRelation: "documento_versao"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"documento_versao": {
                  Row: {
                    "autor_id": string,"caminho": string,"consultoria_id": string,"criado_em": string,"documento_id": string,"id": string,"mime": string,"nome_original": string,"numero": number,"sha256": string,"tamanho_bytes": number
                  }
                  ComputedFields: never
                  Insert: {
                    "autor_id": string,"caminho": string,"consultoria_id": string,"criado_em"?: string,"documento_id": string,"id"?: string,"mime": string,"nome_original": string,"numero": number,"sha256": string,"tamanho_bytes": number
                  }
                  Update: {
                    "autor_id"?: string,"caminho"?: string,"consultoria_id"?: string,"criado_em"?: string,"documento_id"?: string,"id"?: string,"mime"?: string,"nome_original"?: string,"numero"?: number,"sha256"?: string,"tamanho_bytes"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "documento_versao_autor_fk"
      columns: ["consultoria_id","autor_id"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "documento_versao_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "documento_versao_documento_fk"
      columns: ["consultoria_id","documento_id"]
isOneToOne: false
      referencedRelation: "documento"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"empreendimento": {
                  Row: {
                    "cliente_id": string | null,"cnpj": string | null,"consultoria_id": string,"criado_em": string,"criado_por": string,"id": string,"nome": string,"nome_normalizado": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "cliente_id"?: string | null,"cnpj"?: string | null,"consultoria_id": string,"criado_em"?: string,"criado_por": string,"id"?: string,"nome": string,"nome_normalizado"?: never
                  }
                  Update: {
                    "cliente_id"?: string | null,"cnpj"?: string | null,"consultoria_id"?: string,"criado_em"?: string,"criado_por"?: string,"id"?: string,"nome"?: string,"nome_normalizado"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "empreendimento_cliente_fk"
      columns: ["consultoria_id","cliente_id"]
isOneToOne: false
      referencedRelation: "cliente"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "empreendimento_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "empreendimento_criado_por_fk"
      columns: ["consultoria_id","criado_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"etapa": {
                  Row: {
                    "concluida_em": string | null,"concluida_por": string | null,"consultoria_id": string,"criada_em": string,"criada_por": string,"horas_estimadas": number | null,"id": string,"meta": string | null,"modo": Database["public"]['Enums']["modo_etapa"],"ocorrencia_id": string,"posicao": number,"responsavel_externo": string | null,"responsavel_id": string | null,"titulo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "concluida_em"?: string | null,"concluida_por"?: string | null,"consultoria_id": string,"criada_em"?: string,"criada_por": string,"horas_estimadas"?: number | null,"id"?: string,"meta"?: string | null,"modo"?: Database["public"]['Enums']["modo_etapa"],"ocorrencia_id": string,"posicao": number,"responsavel_externo"?: string | null,"responsavel_id"?: string | null,"titulo": string
                  }
                  Update: {
                    "concluida_em"?: string | null,"concluida_por"?: string | null,"consultoria_id"?: string,"criada_em"?: string,"criada_por"?: string,"horas_estimadas"?: number | null,"id"?: string,"meta"?: string | null,"modo"?: Database["public"]['Enums']["modo_etapa"],"ocorrencia_id"?: string,"posicao"?: number,"responsavel_externo"?: string | null,"responsavel_id"?: string | null,"titulo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "etapa_concluida_por_fk"
      columns: ["consultoria_id","concluida_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "etapa_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "etapa_criada_por_fk"
      columns: ["consultoria_id","criada_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "etapa_ocorrencia_fk"
      columns: ["consultoria_id","ocorrencia_id"]
isOneToOne: false
      referencedRelation: "ocorrencia"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "etapa_responsavel_fk"
      columns: ["consultoria_id","responsavel_id"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"evidencia": {
                  Row: {
                    "consultoria_id": string,"data_execucao": string,"documento_versao_id": string,"enviada_em": string,"enviada_por": string,"id": string,"numero": number,"ocorrencia_id": string,"situacao": Database["public"]['Enums']["situacao_evidencia"]
                  }
                  ComputedFields: never
                  Insert: {
                    "consultoria_id": string,"data_execucao": string,"documento_versao_id": string,"enviada_em"?: string,"enviada_por": string,"id"?: string,"numero": number,"ocorrencia_id": string,"situacao"?: Database["public"]['Enums']["situacao_evidencia"]
                  }
                  Update: {
                    "consultoria_id"?: string,"data_execucao"?: string,"documento_versao_id"?: string,"enviada_em"?: string,"enviada_por"?: string,"id"?: string,"numero"?: number,"ocorrencia_id"?: string,"situacao"?: Database["public"]['Enums']["situacao_evidencia"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "evidencia_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "evidencia_enviada_por_fk"
      columns: ["consultoria_id","enviada_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "evidencia_ocorrencia_fk"
      columns: ["consultoria_id","ocorrencia_id"]
isOneToOne: false
      referencedRelation: "ocorrencia"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "evidencia_versao_fk"
      columns: ["consultoria_id","documento_versao_id"]
isOneToOne: false
      referencedRelation: "documento_versao"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"extracao_ia": {
                  Row: {
                    "concluida_em": string | null,"consultoria_id": string,"custo_micros": number | null,"detalhe": string | null,"documento_versao_id": string,"duracao_ms": number | null,"id": string,"iniciada_em": string,"instrumento_id": string,"itens_propostos": number | null,"modelo": string | null,"moeda": string,"motivo": string | null,"paginas": number | null,"resultado": Json | null,"situacao": string,"solicitada_por": string,"tokens_entrada": number | null,"tokens_saida": number | null,"versao_prompt": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "concluida_em"?: string | null,"consultoria_id": string,"custo_micros"?: number | null,"detalhe"?: string | null,"documento_versao_id": string,"duracao_ms"?: number | null,"id": string,"iniciada_em"?: string,"instrumento_id": string,"itens_propostos"?: number | null,"modelo"?: string | null,"moeda"?: string,"motivo"?: string | null,"paginas"?: number | null,"resultado"?: Json | null,"situacao"?: string,"solicitada_por": string,"tokens_entrada"?: number | null,"tokens_saida"?: number | null,"versao_prompt"?: string | null
                  }
                  Update: {
                    "concluida_em"?: string | null,"consultoria_id"?: string,"custo_micros"?: number | null,"detalhe"?: string | null,"documento_versao_id"?: string,"duracao_ms"?: number | null,"id"?: string,"iniciada_em"?: string,"instrumento_id"?: string,"itens_propostos"?: number | null,"modelo"?: string | null,"moeda"?: string,"motivo"?: string | null,"paginas"?: number | null,"resultado"?: Json | null,"situacao"?: string,"solicitada_por"?: string,"tokens_entrada"?: number | null,"tokens_saida"?: number | null,"versao_prompt"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "extracao_ia_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "extracao_ia_instrumento_fk"
      columns: ["consultoria_id","instrumento_id"]
isOneToOne: false
      referencedRelation: "instrumento"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "extracao_ia_solicitada_por_fk"
      columns: ["consultoria_id","solicitada_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "extracao_ia_versao_fk"
      columns: ["consultoria_id","documento_versao_id"]
isOneToOne: false
      referencedRelation: "documento_versao"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"instrumento": {
                  Row: {
                    "antecedencia_renovacao_dias": number,"assinado_em": string | null,"assinado_em_texto": string | null,"ativado_em": string | null,"ativado_por": string | null,"chave_ativacao": string | null,"consultoria_id": string,"criado_em": string,"criado_por": string,"documento_id": string | null,"emitido_em": string | null,"emitido_em_texto": string | null,"empreendimento_id": string,"id": string,"marco": Database["public"]['Enums']["marco_instrumento"] | null,"numero": string | null,"orgao": string | null,"publicado_em": string | null,"publicado_em_texto": string | null,"recebido_em": string | null,"recebido_em_texto": string | null,"row_version": number,"situacao": Database["public"]['Enums']["situacao_instrumento"],"tipo_id": string | null,"unidade_id": string,"validade": string | null,"validade_texto": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "antecedencia_renovacao_dias"?: number,"assinado_em"?: string | null,"assinado_em_texto"?: string | null,"ativado_em"?: string | null,"ativado_por"?: string | null,"chave_ativacao"?: string | null,"consultoria_id": string,"criado_em"?: string,"criado_por": string,"documento_id"?: string | null,"emitido_em"?: string | null,"emitido_em_texto"?: string | null,"empreendimento_id": string,"id"?: string,"marco"?: Database["public"]['Enums']["marco_instrumento"] | null,"numero"?: string | null,"orgao"?: string | null,"publicado_em"?: string | null,"publicado_em_texto"?: string | null,"recebido_em"?: string | null,"recebido_em_texto"?: string | null,"row_version"?: number,"situacao"?: Database["public"]['Enums']["situacao_instrumento"],"tipo_id"?: string | null,"unidade_id": string,"validade"?: string | null,"validade_texto"?: string | null
                  }
                  Update: {
                    "antecedencia_renovacao_dias"?: number,"assinado_em"?: string | null,"assinado_em_texto"?: string | null,"ativado_em"?: string | null,"ativado_por"?: string | null,"chave_ativacao"?: string | null,"consultoria_id"?: string,"criado_em"?: string,"criado_por"?: string,"documento_id"?: string | null,"emitido_em"?: string | null,"emitido_em_texto"?: string | null,"empreendimento_id"?: string,"id"?: string,"marco"?: Database["public"]['Enums']["marco_instrumento"] | null,"numero"?: string | null,"orgao"?: string | null,"publicado_em"?: string | null,"publicado_em_texto"?: string | null,"recebido_em"?: string | null,"recebido_em_texto"?: string | null,"row_version"?: number,"situacao"?: Database["public"]['Enums']["situacao_instrumento"],"tipo_id"?: string | null,"unidade_id"?: string,"validade"?: string | null,"validade_texto"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "instrumento_ativado_por_fk"
      columns: ["consultoria_id","ativado_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "instrumento_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "instrumento_criado_por_fk"
      columns: ["consultoria_id","criado_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "instrumento_documento_fk"
      columns: ["consultoria_id","documento_id"]
isOneToOne: false
      referencedRelation: "documento"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "instrumento_tipo_fk"
      columns: ["consultoria_id","tipo_id"]
isOneToOne: false
      referencedRelation: "tipo_instrumento"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "instrumento_unidade_fk"
      columns: ["consultoria_id","empreendimento_id","unidade_id"]
isOneToOne: false
      referencedRelation: "unidade"
      referencedColumns: ["consultoria_id","empreendimento_id","id"]
    }
                  ]
                },"linha_de_base": {
                  Row: {
                    "consultoria_id": string,"horas_semana_conferindo": number,"id": string,"licencas_ativas": number,"minutos_por_condicionante": number,"respondido_em": string,"respondido_por": string,"surpresas_por_mes": number
                  }
                  ComputedFields: never
                  Insert: {
                    "consultoria_id": string,"horas_semana_conferindo": number,"id"?: string,"licencas_ativas": number,"minutos_por_condicionante": number,"respondido_em"?: string,"respondido_por": string,"surpresas_por_mes": number
                  }
                  Update: {
                    "consultoria_id"?: string,"horas_semana_conferindo"?: number,"id"?: string,"licencas_ativas"?: number,"minutos_por_condicionante"?: number,"respondido_em"?: string,"respondido_por"?: string,"surpresas_por_mes"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "linha_de_base_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "linha_de_base_respondido_por_fk"
      columns: ["consultoria_id","respondido_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"membro": {
                  Row: {
                    "cargo": string | null,"cargo_antigo": string | null,"consultoria_id": string,"criado_em": string,"ctf_numero": string | null,"ctf_valido_ate": string | null,"desligado_em": string | null,"email": string,"foto_documento_id": string | null,"genero": string | null,"id": string,"nome": string,"outras_profissoes": (unknown)[],"papel": Database["public"]['Enums']["papel_membro"],"profissao": string | null,"profissao_em_curso": boolean,"situacao": Database["public"]['Enums']["situacao_membro"],"usuario_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "cargo"?: string | null,"cargo_antigo"?: string | null,"consultoria_id": string,"criado_em"?: string,"ctf_numero"?: string | null,"ctf_valido_ate"?: string | null,"desligado_em"?: string | null,"email": string,"foto_documento_id"?: string | null,"genero"?: string | null,"id"?: string,"nome": string,"outras_profissoes"?: (unknown)[],"papel": Database["public"]['Enums']["papel_membro"],"profissao"?: string | null,"profissao_em_curso"?: boolean,"situacao"?: Database["public"]['Enums']["situacao_membro"],"usuario_id": string
                  }
                  Update: {
                    "cargo"?: string | null,"cargo_antigo"?: string | null,"consultoria_id"?: string,"criado_em"?: string,"ctf_numero"?: string | null,"ctf_valido_ate"?: string | null,"desligado_em"?: string | null,"email"?: string,"foto_documento_id"?: string | null,"genero"?: string | null,"id"?: string,"nome"?: string,"outras_profissoes"?: (unknown)[],"papel"?: Database["public"]['Enums']["papel_membro"],"profissao"?: string | null,"profissao_em_curso"?: boolean,"situacao"?: Database["public"]['Enums']["situacao_membro"],"usuario_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "membro_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "membro_foto_fk"
      columns: ["consultoria_id","foto_documento_id"]
isOneToOne: false
      referencedRelation: "documento"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"mtr": {
                  Row: {
                    "atualizado_em": string,"consultoria_id": string,"criado_em": string,"criado_por": string,"destinador_cnpj": string | null,"destinador_nome": string,"documento_id": string | null,"emitido_em": string,"empreendimento_id": string,"excluido_em": string | null,"excluido_por": string | null,"id": string,"numero": string,"observacao": string | null,"row_version": number,"situacao": string,"transportador_cnpj": string | null,"transportador_nome": string
                  }
                  ComputedFields: never
                  Insert: {
                    "atualizado_em"?: string,"consultoria_id": string,"criado_em"?: string,"criado_por": string,"destinador_cnpj"?: string | null,"destinador_nome": string,"documento_id"?: string | null,"emitido_em": string,"empreendimento_id": string,"excluido_em"?: string | null,"excluido_por"?: string | null,"id"?: string,"numero": string,"observacao"?: string | null,"row_version"?: number,"situacao"?: string,"transportador_cnpj"?: string | null,"transportador_nome": string
                  }
                  Update: {
                    "atualizado_em"?: string,"consultoria_id"?: string,"criado_em"?: string,"criado_por"?: string,"destinador_cnpj"?: string | null,"destinador_nome"?: string,"documento_id"?: string | null,"emitido_em"?: string,"empreendimento_id"?: string,"excluido_em"?: string | null,"excluido_por"?: string | null,"id"?: string,"numero"?: string,"observacao"?: string | null,"row_version"?: number,"situacao"?: string,"transportador_cnpj"?: string | null,"transportador_nome"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "mtr_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "mtr_criado_por_fk"
      columns: ["consultoria_id","criado_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "mtr_documento_fk"
      columns: ["consultoria_id","documento_id"]
isOneToOne: false
      referencedRelation: "documento"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "mtr_empreendimento_fk"
      columns: ["consultoria_id","empreendimento_id"]
isOneToOne: false
      referencedRelation: "empreendimento"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "mtr_excluido_por_fk"
      columns: ["consultoria_id","excluido_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"mtr_item": {
                  Row: {
                    "classe": string | null,"consultoria_id": string,"id": string,"mtr_id": string,"posicao": number,"quantidade": number,"residuo_codigo": string,"residuo_descricao": string,"unidade": string
                  }
                  ComputedFields: never
                  Insert: {
                    "classe"?: string | null,"consultoria_id": string,"id"?: string,"mtr_id": string,"posicao": number,"quantidade": number,"residuo_codigo": string,"residuo_descricao": string,"unidade": string
                  }
                  Update: {
                    "classe"?: string | null,"consultoria_id"?: string,"id"?: string,"mtr_id"?: string,"posicao"?: number,"quantidade"?: number,"residuo_codigo"?: string,"residuo_descricao"?: string,"unidade"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "mtr_item_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "mtr_item_mtr_fk"
      columns: ["consultoria_id","mtr_id"]
isOneToOne: false
      referencedRelation: "mtr"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"obrigacao_residuo": {
                  Row: {
                    "ativa": boolean,"atualizado_em": string,"atualizado_por": string,"consultoria_id": string,"empreendimento_id": string,"id": string,"observacao": string | null,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ativa"?: boolean,"atualizado_em"?: string,"atualizado_por": string,"consultoria_id": string,"empreendimento_id": string,"id"?: string,"observacao"?: string | null,"tipo": string
                  }
                  Update: {
                    "ativa"?: boolean,"atualizado_em"?: string,"atualizado_por"?: string,"consultoria_id"?: string,"empreendimento_id"?: string,"id"?: string,"observacao"?: string | null,"tipo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "obrigacao_residuo_atualizado_por_fk"
      columns: ["consultoria_id","atualizado_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "obrigacao_residuo_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "obrigacao_residuo_empreendimento_fk"
      columns: ["consultoria_id","empreendimento_id"]
isOneToOne: false
      referencedRelation: "empreendimento"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"ocorrencia": {
                  Row: {
                    "chave_idempotencia": string,"ciclo": number,"concluida_em": string | null,"concluida_por": string | null,"concluida_sem_evidencia": boolean,"condicionante_versao_id": string | null,"conferente_id": string | null,"consultoria_id": string,"criado_em": string,"id": string,"instrumento_id": string,"meta_interna": string | null,"prazo_oficial_atual": string,"prazo_oficial_original": string,"responsavel_id": string | null,"row_version": number,"situacao": Database["public"]['Enums']["situacao_ocorrencia"]
                  }
                  ComputedFields: never
                  Insert: {
                    "chave_idempotencia": string,"ciclo": number,"concluida_em"?: string | null,"concluida_por"?: string | null,"concluida_sem_evidencia"?: boolean,"condicionante_versao_id"?: string | null,"conferente_id"?: string | null,"consultoria_id": string,"criado_em"?: string,"id"?: string,"instrumento_id": string,"meta_interna"?: string | null,"prazo_oficial_atual": string,"prazo_oficial_original": string,"responsavel_id"?: string | null,"row_version"?: number,"situacao"?: Database["public"]['Enums']["situacao_ocorrencia"]
                  }
                  Update: {
                    "chave_idempotencia"?: string,"ciclo"?: number,"concluida_em"?: string | null,"concluida_por"?: string | null,"concluida_sem_evidencia"?: boolean,"condicionante_versao_id"?: string | null,"conferente_id"?: string | null,"consultoria_id"?: string,"criado_em"?: string,"id"?: string,"instrumento_id"?: string,"meta_interna"?: string | null,"prazo_oficial_atual"?: string,"prazo_oficial_original"?: string,"responsavel_id"?: string | null,"row_version"?: number,"situacao"?: Database["public"]['Enums']["situacao_ocorrencia"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "ocorrencia_concluida_por_fk"
      columns: ["consultoria_id","concluida_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "ocorrencia_conferente_fk"
      columns: ["consultoria_id","conferente_id"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "ocorrencia_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ocorrencia_instrumento_fk"
      columns: ["consultoria_id","instrumento_id"]
isOneToOne: false
      referencedRelation: "instrumento"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "ocorrencia_responsavel_fk"
      columns: ["consultoria_id","responsavel_id"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "ocorrencia_versao_fk"
      columns: ["consultoria_id","condicionante_versao_id"]
isOneToOne: false
      referencedRelation: "condicionante_versao"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"ocorrencia_historico": {
                  Row: {
                    "ator_id": string | null,"consultoria_id": string,"detalhe": string | null,"evidencia_numero": number | null,"id": number,"instante": string,"ocorrencia_id": string,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "ator_id"?: string | null,"consultoria_id": string,"detalhe"?: string | null,"evidencia_numero"?: number | null,"id"?: never,"instante"?: string,"ocorrencia_id": string,"tipo": string
                  }
                  Update: {
                    "ator_id"?: string | null,"consultoria_id"?: string,"detalhe"?: string | null,"evidencia_numero"?: number | null,"id"?: never,"instante"?: string,"ocorrencia_id"?: string,"tipo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ocorrencia_historico_ator_fk"
      columns: ["consultoria_id","ator_id"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "ocorrencia_historico_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ocorrencia_historico_ocorrencia_fk"
      columns: ["consultoria_id","ocorrencia_id"]
isOneToOne: false
      referencedRelation: "ocorrencia"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"orcamento": {
                  Row: {
                    "ano": number,"apresentacao": string | null,"atualizado_em": string,"base_custo_fixo_hora_centavos": number | null,"base_custo_hora_membro": Json | null,"base_custo_hora_profissao": Json | null,"base_custo_km_centavos": number | null,"base_custos_fixos_detalhe": Json | null,"base_custos_fixos_equipe_centavos": number | null,"base_custos_fixos_mensais_centavos": number | null,"base_deslocamento_modo": string | null,"base_hora_tecnica_centavos": number | null,"base_horas_venda": Json | null,"base_margem_desejada_pb": number | null,"base_margem_minima_pb": number | null,"base_registrada_em": string | null,"base_taxa_por_assinatura_centavos": number | null,"base_taxa_por_cobranca_centavos": number | null,"base_taxas_pb": number | null,"base_tributos_pb": number | null,"base_valor_visita_centavos": number | null,"consultoria_id": string,"criado_em": string,"criado_por": string,"destinatario": string | null,"duplicado_de": string | null,"empreendimento_id": string | null,"excluido_em": string | null,"excluido_por": string | null,"exclusoes": (string)[],"forma_preco": string,"id": string,"km_por_visita": number,"margem_pb": number | null,"moeda": string,"objeto": string,"outros_por_visita_centavos": number,"prazos": string | null,"preco_visitas_centavos": number,"premissas": (string)[],"prospecto_cnpj": string | null,"prospecto_contato": string | null,"prospecto_email": string | null,"prospecto_nome": string | null,"prospecto_telefone": string | null,"revisao": number,"row_version": number,"sequencia": number,"situacao": Database["public"]['Enums']["situacao_orcamento"],"validade_dias": number,"visitas": number
                  }
                  ComputedFields: never
                  Insert: {
                    "ano": number,"apresentacao"?: string | null,"atualizado_em"?: string,"base_custo_fixo_hora_centavos"?: number | null,"base_custo_hora_membro"?: Json | null,"base_custo_hora_profissao"?: Json | null,"base_custo_km_centavos"?: number | null,"base_custos_fixos_detalhe"?: Json | null,"base_custos_fixos_equipe_centavos"?: number | null,"base_custos_fixos_mensais_centavos"?: number | null,"base_deslocamento_modo"?: string | null,"base_hora_tecnica_centavos"?: number | null,"base_horas_venda"?: Json | null,"base_margem_desejada_pb"?: number | null,"base_margem_minima_pb"?: number | null,"base_registrada_em"?: string | null,"base_taxa_por_assinatura_centavos"?: number | null,"base_taxa_por_cobranca_centavos"?: number | null,"base_taxas_pb"?: number | null,"base_tributos_pb"?: number | null,"base_valor_visita_centavos"?: number | null,"consultoria_id": string,"criado_em"?: string,"criado_por": string,"destinatario"?: string | null,"duplicado_de"?: string | null,"empreendimento_id"?: string | null,"excluido_em"?: string | null,"excluido_por"?: string | null,"exclusoes"?: (string)[],"forma_preco"?: string,"id"?: string,"km_por_visita"?: number,"margem_pb"?: number | null,"moeda"?: string,"objeto": string,"outros_por_visita_centavos"?: number,"prazos"?: string | null,"preco_visitas_centavos"?: number,"premissas"?: (string)[],"prospecto_cnpj"?: string | null,"prospecto_contato"?: string | null,"prospecto_email"?: string | null,"prospecto_nome"?: string | null,"prospecto_telefone"?: string | null,"revisao"?: number,"row_version"?: number,"sequencia": number,"situacao"?: Database["public"]['Enums']["situacao_orcamento"],"validade_dias"?: number,"visitas"?: number
                  }
                  Update: {
                    "ano"?: number,"apresentacao"?: string | null,"atualizado_em"?: string,"base_custo_fixo_hora_centavos"?: number | null,"base_custo_hora_membro"?: Json | null,"base_custo_hora_profissao"?: Json | null,"base_custo_km_centavos"?: number | null,"base_custos_fixos_detalhe"?: Json | null,"base_custos_fixos_equipe_centavos"?: number | null,"base_custos_fixos_mensais_centavos"?: number | null,"base_deslocamento_modo"?: string | null,"base_hora_tecnica_centavos"?: number | null,"base_horas_venda"?: Json | null,"base_margem_desejada_pb"?: number | null,"base_margem_minima_pb"?: number | null,"base_registrada_em"?: string | null,"base_taxa_por_assinatura_centavos"?: number | null,"base_taxa_por_cobranca_centavos"?: number | null,"base_taxas_pb"?: number | null,"base_tributos_pb"?: number | null,"base_valor_visita_centavos"?: number | null,"consultoria_id"?: string,"criado_em"?: string,"criado_por"?: string,"destinatario"?: string | null,"duplicado_de"?: string | null,"empreendimento_id"?: string | null,"excluido_em"?: string | null,"excluido_por"?: string | null,"exclusoes"?: (string)[],"forma_preco"?: string,"id"?: string,"km_por_visita"?: number,"margem_pb"?: number | null,"moeda"?: string,"objeto"?: string,"outros_por_visita_centavos"?: number,"prazos"?: string | null,"preco_visitas_centavos"?: number,"premissas"?: (string)[],"prospecto_cnpj"?: string | null,"prospecto_contato"?: string | null,"prospecto_email"?: string | null,"prospecto_nome"?: string | null,"prospecto_telefone"?: string | null,"revisao"?: number,"row_version"?: number,"sequencia"?: number,"situacao"?: Database["public"]['Enums']["situacao_orcamento"],"validade_dias"?: number,"visitas"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "orcamento_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orcamento_criado_por_fk"
      columns: ["consultoria_id","criado_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "orcamento_duplicado_de_fk"
      columns: ["consultoria_id","duplicado_de"]
isOneToOne: false
      referencedRelation: "orcamento"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "orcamento_empreendimento_fk"
      columns: ["consultoria_id","empreendimento_id"]
isOneToOne: false
      referencedRelation: "empreendimento"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "orcamento_excluido_por_fk"
      columns: ["consultoria_id","excluido_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"orcamento_aceite": {
                  Row: {
                    "aprovado_por": string,"consultoria_id": string,"conteudo_sha256": string,"data_aceite": string,"id": string,"metodo": string | null,"orcamento_id": string,"referencia": string,"registrado_em": string,"registrado_por": string,"revisao": number
                  }
                  ComputedFields: never
                  Insert: {
                    "aprovado_por": string,"consultoria_id": string,"conteudo_sha256": string,"data_aceite": string,"id"?: string,"metodo"?: string | null,"orcamento_id": string,"referencia": string,"registrado_em"?: string,"registrado_por": string,"revisao": number
                  }
                  Update: {
                    "aprovado_por"?: string,"consultoria_id"?: string,"conteudo_sha256"?: string,"data_aceite"?: string,"id"?: string,"metodo"?: string | null,"orcamento_id"?: string,"referencia"?: string,"registrado_em"?: string,"registrado_por"?: string,"revisao"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "orcamento_aceite_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orcamento_aceite_orcamento_fk"
      columns: ["consultoria_id","orcamento_id"]
isOneToOne: false
      referencedRelation: "orcamento"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "orcamento_aceite_registrado_por_fk"
      columns: ["consultoria_id","registrado_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"orcamento_base_custos": {
                  Row: {
                    "acrescimo_km_centavos": number | null,"atualizado_em": string,"atualizado_por": string,"consultoria_id": string,"consumo_km_por_litro": number | null,"custo_hora_membro": NonNullable<Json>,"custo_hora_profissao": NonNullable<Json>,"custo_km_centavos": number,"custos_fixos_detalhe": NonNullable<Json>,"custos_fixos_equipe_centavos": number,"custos_fixos_mensais_centavos": number,"deslocamento_modo": string | null,"hora_tecnica_centavos": number,"horas_faturaveis_mes": number,"horas_venda": NonNullable<Json>,"id": string,"margem_desejada_pb": number,"margem_minima_pb": number,"moeda": string,"piso_hora_centavos": number,"preco_combustivel_centavos": number | null,"row_version": number,"taxa_por_assinatura_centavos": number,"taxa_por_cobranca_centavos": number,"taxas_pb": number,"tributos_pb": number,"valor_visita_centavos": number
                  }
                  ComputedFields: never
                  Insert: {
                    "acrescimo_km_centavos"?: number | null,"atualizado_em"?: string,"atualizado_por": string,"consultoria_id": string,"consumo_km_por_litro"?: number | null,"custo_hora_membro"?: NonNullable<Json>,"custo_hora_profissao"?: NonNullable<Json>,"custo_km_centavos"?: number,"custos_fixos_detalhe"?: NonNullable<Json>,"custos_fixos_equipe_centavos"?: number,"custos_fixos_mensais_centavos": number,"deslocamento_modo"?: string | null,"hora_tecnica_centavos": number,"horas_faturaveis_mes": number,"horas_venda"?: NonNullable<Json>,"id"?: string,"margem_desejada_pb": number,"margem_minima_pb": number,"moeda"?: string,"piso_hora_centavos"?: number,"preco_combustivel_centavos"?: number | null,"row_version"?: number,"taxa_por_assinatura_centavos"?: number,"taxa_por_cobranca_centavos"?: number,"taxas_pb"?: number,"tributos_pb": number,"valor_visita_centavos"?: number
                  }
                  Update: {
                    "acrescimo_km_centavos"?: number | null,"atualizado_em"?: string,"atualizado_por"?: string,"consultoria_id"?: string,"consumo_km_por_litro"?: number | null,"custo_hora_membro"?: NonNullable<Json>,"custo_hora_profissao"?: NonNullable<Json>,"custo_km_centavos"?: number,"custos_fixos_detalhe"?: NonNullable<Json>,"custos_fixos_equipe_centavos"?: number,"custos_fixos_mensais_centavos"?: number,"deslocamento_modo"?: string | null,"hora_tecnica_centavos"?: number,"horas_faturaveis_mes"?: number,"horas_venda"?: NonNullable<Json>,"id"?: string,"margem_desejada_pb"?: number,"margem_minima_pb"?: number,"moeda"?: string,"piso_hora_centavos"?: number,"preco_combustivel_centavos"?: number | null,"row_version"?: number,"taxa_por_assinatura_centavos"?: number,"taxa_por_cobranca_centavos"?: number,"taxas_pb"?: number,"tributos_pb"?: number,"valor_visita_centavos"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "orcamento_base_custos_atualizado_por_fk"
      columns: ["consultoria_id","atualizado_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "orcamento_base_custos_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: true
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    }
                  ]
                },"orcamento_base_equipe": {
                  Row: {
                    "consultoria_id": string,"custo_diaria_centavos": number | null,"custo_mensal_centavos": number | null,"custo_projeto_centavos": number | null,"descricao": string,"dias_no_mes": number | null,"horas_disponiveis_mes": number | null,"horas_por_diaria": number | null,"horas_projeto": number | null,"id": string,"membro_id": string | null,"ordem": number,"pelo_piso": boolean,"profissao": string | null,"socio": boolean,"tipo_recebimento": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "consultoria_id": string,"custo_diaria_centavos"?: number | null,"custo_mensal_centavos"?: number | null,"custo_projeto_centavos"?: number | null,"descricao": string,"dias_no_mes"?: number | null,"horas_disponiveis_mes"?: number | null,"horas_por_diaria"?: number | null,"horas_projeto"?: number | null,"id"?: string,"membro_id"?: string | null,"ordem": number,"pelo_piso"?: boolean,"profissao"?: string | null,"socio"?: boolean,"tipo_recebimento"?: string | null
                  }
                  Update: {
                    "consultoria_id"?: string,"custo_diaria_centavos"?: number | null,"custo_mensal_centavos"?: number | null,"custo_projeto_centavos"?: number | null,"descricao"?: string,"dias_no_mes"?: number | null,"horas_disponiveis_mes"?: number | null,"horas_por_diaria"?: number | null,"horas_projeto"?: number | null,"id"?: string,"membro_id"?: string | null,"ordem"?: number,"pelo_piso"?: boolean,"profissao"?: string | null,"socio"?: boolean,"tipo_recebimento"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "orcamento_base_equipe_base_fk"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "orcamento_base_custos"
      referencedColumns: ["consultoria_id"]
    },{
      foreignKeyName: "orcamento_base_equipe_membro_fk"
      columns: ["consultoria_id","membro_id"]
isOneToOne: true
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"orcamento_configuracao_preferencia": {
                  Row: {
                    "consultoria_id": string,"dispensado_em": string | null,"id": string,"membro_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "consultoria_id": string,"dispensado_em"?: string | null,"id"?: string,"membro_id": string
                  }
                  Update: {
                    "consultoria_id"?: string,"dispensado_em"?: string | null,"id"?: string,"membro_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "orcamento_configuracao_preferencia_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orcamento_configuracao_preferencia_membro_fk"
      columns: ["consultoria_id","membro_id"]
isOneToOne: true
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"orcamento_configuracao_rascunho": {
                  Row: {
                    "atualizado_em": string,"atualizado_por": string,"base_row_version": number,"consultoria_id": string,"criado_por": string,"dados": NonNullable<Json>,"etapa": number,"id": string,"row_version": number,"ultima_operacao": string | null,"ultimo_passo": number | null,"ultimo_payload": Json | null
                  }
                  ComputedFields: never
                  Insert: {
                    "atualizado_em"?: string,"atualizado_por": string,"base_row_version"?: number,"consultoria_id": string,"criado_por": string,"dados"?: NonNullable<Json>,"etapa"?: number,"id"?: string,"row_version"?: number,"ultima_operacao"?: string | null,"ultimo_passo"?: number | null,"ultimo_payload"?: Json | null
                  }
                  Update: {
                    "atualizado_em"?: string,"atualizado_por"?: string,"base_row_version"?: number,"consultoria_id"?: string,"criado_por"?: string,"dados"?: NonNullable<Json>,"etapa"?: number,"id"?: string,"row_version"?: number,"ultima_operacao"?: string | null,"ultimo_passo"?: number | null,"ultimo_payload"?: Json | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "orcamento_configuracao_rascunho_atualizado_por_fk"
      columns: ["consultoria_id","atualizado_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "orcamento_configuracao_rascunho_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: true
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orcamento_configuracao_rascunho_criado_por_fk"
      columns: ["consultoria_id","criado_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"orcamento_despesa": {
                  Row: {
                    "consultoria_id": string,"descricao": string,"estimativa_centavos": number | null,"id": string,"orcamento_id": string,"ordem": number,"tratamento": Database["public"]['Enums']["tratamento_despesa"]
                  }
                  ComputedFields: never
                  Insert: {
                    "consultoria_id": string,"descricao": string,"estimativa_centavos"?: number | null,"id"?: string,"orcamento_id": string,"ordem": number,"tratamento": Database["public"]['Enums']["tratamento_despesa"]
                  }
                  Update: {
                    "consultoria_id"?: string,"descricao"?: string,"estimativa_centavos"?: number | null,"id"?: string,"orcamento_id"?: string,"ordem"?: number,"tratamento"?: Database["public"]['Enums']["tratamento_despesa"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "orcamento_despesa_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orcamento_despesa_orcamento_fk"
      columns: ["consultoria_id","orcamento_id"]
isOneToOne: false
      referencedRelation: "orcamento"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"orcamento_item": {
                  Row: {
                    "consultoria_id": string,"custo_direto_extra_centavos": number,"descricao": string,"hora_venda_id": string | null,"id": string,"mes_previsto": string | null,"minutos": number,"orcamento_id": string,"ordem": number,"preco_automatico": boolean,"preco_centavos": number,"preco_fechado_centavos": number | null,"quantidade": number | null,"responsabilidade_tecnica": string | null,"responsavel_id": string | null,"terceiro_cobranca": string | null,"terceiro_nome": string | null,"terceiro_profissao": string | null,"terceiro_valor_centavos": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "consultoria_id": string,"custo_direto_extra_centavos"?: number,"descricao": string,"hora_venda_id"?: string | null,"id"?: string,"mes_previsto"?: string | null,"minutos"?: number,"orcamento_id": string,"ordem": number,"preco_automatico"?: boolean,"preco_centavos"?: number,"preco_fechado_centavos"?: number | null,"quantidade"?: number | null,"responsabilidade_tecnica"?: string | null,"responsavel_id"?: string | null,"terceiro_cobranca"?: string | null,"terceiro_nome"?: string | null,"terceiro_profissao"?: string | null,"terceiro_valor_centavos"?: number | null
                  }
                  Update: {
                    "consultoria_id"?: string,"custo_direto_extra_centavos"?: number,"descricao"?: string,"hora_venda_id"?: string | null,"id"?: string,"mes_previsto"?: string | null,"minutos"?: number,"orcamento_id"?: string,"ordem"?: number,"preco_automatico"?: boolean,"preco_centavos"?: number,"preco_fechado_centavos"?: number | null,"quantidade"?: number | null,"responsabilidade_tecnica"?: string | null,"responsavel_id"?: string | null,"terceiro_cobranca"?: string | null,"terceiro_nome"?: string | null,"terceiro_profissao"?: string | null,"terceiro_valor_centavos"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "orcamento_item_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orcamento_item_orcamento_fk"
      columns: ["consultoria_id","orcamento_id"]
isOneToOne: false
      referencedRelation: "orcamento"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "orcamento_item_responsavel_fk"
      columns: ["consultoria_id","responsavel_id"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"orcamento_modelo": {
                  Row: {
                    "atualizado_em": string,"consultoria_id": string,"criado_em": string,"criado_por": string,"despesas": NonNullable<Json>,"excluido_em": string | null,"excluido_por": string | null,"exclusoes": (string)[],"id": string,"itens": NonNullable<Json>,"nome": string,"objeto": string,"orcamento_origem_id": string | null,"premissas": (string)[],"row_version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "atualizado_em"?: string,"consultoria_id": string,"criado_em"?: string,"criado_por": string,"despesas"?: NonNullable<Json>,"excluido_em"?: string | null,"excluido_por"?: string | null,"exclusoes"?: (string)[],"id": string,"itens": NonNullable<Json>,"nome": string,"objeto": string,"orcamento_origem_id"?: string | null,"premissas"?: (string)[],"row_version"?: number
                  }
                  Update: {
                    "atualizado_em"?: string,"consultoria_id"?: string,"criado_em"?: string,"criado_por"?: string,"despesas"?: NonNullable<Json>,"excluido_em"?: string | null,"excluido_por"?: string | null,"exclusoes"?: (string)[],"id"?: string,"itens"?: NonNullable<Json>,"nome"?: string,"objeto"?: string,"orcamento_origem_id"?: string | null,"premissas"?: (string)[],"row_version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "orcamento_modelo_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orcamento_modelo_criado_por_fk"
      columns: ["consultoria_id","criado_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "orcamento_modelo_excluido_por_fk"
      columns: ["consultoria_id","excluido_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "orcamento_modelo_origem_fk"
      columns: ["consultoria_id","orcamento_origem_id"]
isOneToOne: false
      referencedRelation: "orcamento"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"orcamento_parcela": {
                  Row: {
                    "consultoria_id": string,"descricao": string,"dias": number,"id": string,"orcamento_id": string,"ordem": number,"percentual_pb": number
                  }
                  ComputedFields: never
                  Insert: {
                    "consultoria_id": string,"descricao": string,"dias"?: number,"id"?: string,"orcamento_id": string,"ordem": number,"percentual_pb": number
                  }
                  Update: {
                    "consultoria_id"?: string,"descricao"?: string,"dias"?: number,"id"?: string,"orcamento_id"?: string,"ordem"?: number,"percentual_pb"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "orcamento_parcela_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "orcamento_parcela_orcamento_fk"
      columns: ["consultoria_id","orcamento_id"]
isOneToOne: false
      referencedRelation: "orcamento"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"orcamento_situacao": {
                  Row: {
                    "consultoria_id": string,"de": Database["public"]['Enums']["situacao_orcamento"],"em": string,"id": string,"membro_id": string,"observacao": string | null,"orcamento_id": string,"para": Database["public"]['Enums']["situacao_orcamento"],"revisao": number
                  }
                  ComputedFields: never
                  Insert: {
                    "consultoria_id": string,"de": Database["public"]['Enums']["situacao_orcamento"],"em"?: string,"id"?: string,"membro_id": string,"observacao"?: string | null,"orcamento_id": string,"para": Database["public"]['Enums']["situacao_orcamento"],"revisao": number
                  }
                  Update: {
                    "consultoria_id"?: string,"de"?: Database["public"]['Enums']["situacao_orcamento"],"em"?: string,"id"?: string,"membro_id"?: string,"observacao"?: string | null,"orcamento_id"?: string,"para"?: Database["public"]['Enums']["situacao_orcamento"],"revisao"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "orcamento_situacao_membro_fk"
      columns: ["consultoria_id","membro_id"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "orcamento_situacao_orcamento_fk"
      columns: ["consultoria_id","orcamento_id"]
isOneToOne: false
      referencedRelation: "orcamento"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"plano_renovacao": {
                  Row: {
                    "acompanhamento_dias": number | null,"antecedencia_dias": number,"consultoria_id": string,"criado_em": string,"dias_limite_protocolo": number,"id": string,"instrumento_id": string,"protocolado_em": string | null,"protocolo_numero": string | null,"protocolo_registrado_em": string | null,"protocolo_registrado_por": string | null,"protocolo_versao_id": string | null,"row_version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "acompanhamento_dias"?: number | null,"antecedencia_dias"?: number,"consultoria_id": string,"criado_em"?: string,"dias_limite_protocolo"?: number,"id"?: string,"instrumento_id": string,"protocolado_em"?: string | null,"protocolo_numero"?: string | null,"protocolo_registrado_em"?: string | null,"protocolo_registrado_por"?: string | null,"protocolo_versao_id"?: string | null,"row_version"?: number
                  }
                  Update: {
                    "acompanhamento_dias"?: number | null,"antecedencia_dias"?: number,"consultoria_id"?: string,"criado_em"?: string,"dias_limite_protocolo"?: number,"id"?: string,"instrumento_id"?: string,"protocolado_em"?: string | null,"protocolo_numero"?: string | null,"protocolo_registrado_em"?: string | null,"protocolo_registrado_por"?: string | null,"protocolo_versao_id"?: string | null,"row_version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "plano_renovacao_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "plano_renovacao_instrumento_fk"
      columns: ["consultoria_id","instrumento_id"]
isOneToOne: false
      referencedRelation: "instrumento"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "plano_renovacao_protocolo_versao_fk"
      columns: ["consultoria_id","protocolo_versao_id"]
isOneToOne: false
      referencedRelation: "documento_versao"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "plano_renovacao_registrado_por_fk"
      columns: ["consultoria_id","protocolo_registrado_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"registro_profissional": {
                  Row: {
                    "confirmado_em": string | null,"confirmado_por": string | null,"conselho": string,"consultoria_id": string,"declarado_em": string,"declarado_por": string,"id": string,"membro_id": string,"numero": string,"profissao": string,"removido_em": string | null,"removido_por": string | null,"row_version": number,"uf": string | null,"valido_ate": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "confirmado_em"?: string | null,"confirmado_por"?: string | null,"conselho": string,"consultoria_id": string,"declarado_em"?: string,"declarado_por": string,"id"?: string,"membro_id": string,"numero": string,"profissao": string,"removido_em"?: string | null,"removido_por"?: string | null,"row_version"?: number,"uf"?: string | null,"valido_ate"?: string | null
                  }
                  Update: {
                    "confirmado_em"?: string | null,"confirmado_por"?: string | null,"conselho"?: string,"consultoria_id"?: string,"declarado_em"?: string,"declarado_por"?: string,"id"?: string,"membro_id"?: string,"numero"?: string,"profissao"?: string,"removido_em"?: string | null,"removido_por"?: string | null,"row_version"?: number,"uf"?: string | null,"valido_ate"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "registro_profissional_confirmado_por_fk"
      columns: ["consultoria_id","confirmado_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "registro_profissional_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "registro_profissional_declarado_por_fk"
      columns: ["consultoria_id","declarado_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "registro_profissional_membro_fk"
      columns: ["consultoria_id","membro_id"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "registro_profissional_removido_por_fk"
      columns: ["consultoria_id","removido_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"resumo_do_mes_envio": {
                  Row: {
                    "consultoria_id": string,"destinatarios": number,"enviado_em": string,"mes": string
                  }
                  ComputedFields: never
                  Insert: {
                    "consultoria_id": string,"destinatarios": number,"enviado_em"?: string,"mes": string
                  }
                  Update: {
                    "consultoria_id"?: string,"destinatarios"?: number,"enviado_em"?: string,"mes"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "resumo_do_mes_envio_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    }
                  ]
                },"tarefa_cronometrada": {
                  Row: {
                    "consultoria_id": string,"id": string,"instante": string,"membro_id": string,"quantidade": number,"segundos_ativos": number,"tipo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "consultoria_id": string,"id"?: string,"instante"?: string,"membro_id": string,"quantidade": number,"segundos_ativos": number,"tipo": string
                  }
                  Update: {
                    "consultoria_id"?: string,"id"?: string,"instante"?: string,"membro_id"?: string,"quantidade"?: number,"segundos_ativos"?: number,"tipo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tarefa_cronometrada_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tarefa_cronometrada_membro_fk"
      columns: ["consultoria_id","membro_id"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"tarefa_servico": {
                  Row: {
                    "concluida_em": string | null,"concluida_por": string | null,"consultoria_id": string,"criada_em": string,"criada_por": string,"fora_da_revisao": boolean,"gerada_do_item": boolean,"id": string,"minutos_estimados": number | null,"orcamento_id": string,"orcamento_item_id": string | null,"ordem": number,"prazo_interno": string | null,"responsavel_id": string | null,"row_version": number,"situacao": Database["public"]['Enums']["situacao_tarefa_servico"],"titulo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "concluida_em"?: string | null,"concluida_por"?: string | null,"consultoria_id": string,"criada_em"?: string,"criada_por": string,"fora_da_revisao"?: boolean,"gerada_do_item": boolean,"id"?: string,"minutos_estimados"?: number | null,"orcamento_id": string,"orcamento_item_id"?: string | null,"ordem": number,"prazo_interno"?: string | null,"responsavel_id"?: string | null,"row_version"?: number,"situacao"?: Database["public"]['Enums']["situacao_tarefa_servico"],"titulo": string
                  }
                  Update: {
                    "concluida_em"?: string | null,"concluida_por"?: string | null,"consultoria_id"?: string,"criada_em"?: string,"criada_por"?: string,"fora_da_revisao"?: boolean,"gerada_do_item"?: boolean,"id"?: string,"minutos_estimados"?: number | null,"orcamento_id"?: string,"orcamento_item_id"?: string | null,"ordem"?: number,"prazo_interno"?: string | null,"responsavel_id"?: string | null,"row_version"?: number,"situacao"?: Database["public"]['Enums']["situacao_tarefa_servico"],"titulo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tarefa_servico_concluida_por_fk"
      columns: ["consultoria_id","concluida_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "tarefa_servico_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tarefa_servico_criada_por_fk"
      columns: ["consultoria_id","criada_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "tarefa_servico_item_fk"
      columns: ["consultoria_id","orcamento_item_id"]
isOneToOne: true
      referencedRelation: "orcamento_item"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "tarefa_servico_orcamento_fk"
      columns: ["consultoria_id","orcamento_id"]
isOneToOne: false
      referencedRelation: "orcamento"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "tarefa_servico_responsavel_fk"
      columns: ["consultoria_id","responsavel_id"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"tipo_instrumento": {
                  Row: {
                    "consultoria_id": string,"criado_em": string,"id": string,"nome": string,"sigla": string,"sigla_normalizada": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "consultoria_id": string,"criado_em"?: string,"id"?: string,"nome": string,"sigla": string,"sigla_normalizada"?: never
                  }
                  Update: {
                    "consultoria_id"?: string,"criado_em"?: string,"id"?: string,"nome"?: string,"sigla"?: string,"sigla_normalizada"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "tipo_instrumento_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    }
                  ]
                },"unidade": {
                  Row: {
                    "consultoria_id": string,"criado_em": string,"empreendimento_id": string,"endereco": string | null,"id": string,"nome": string
                  }
                  ComputedFields: never
                  Insert: {
                    "consultoria_id": string,"criado_em"?: string,"empreendimento_id": string,"endereco"?: string | null,"id"?: string,"nome": string
                  }
                  Update: {
                    "consultoria_id"?: string,"criado_em"?: string,"empreendimento_id"?: string,"endereco"?: string | null,"id"?: string,"nome"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "unidade_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "unidade_empreendimento_fk"
      columns: ["consultoria_id","empreendimento_id"]
isOneToOne: false
      referencedRelation: "empreendimento"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"uso_diario": {
                  Row: {
                    "consultoria_id": string,"dia": string,"membro_id": string,"modulo": string,"primeiro_em": string,"ultimo_em": string
                  }
                  ComputedFields: never
                  Insert: {
                    "consultoria_id": string,"dia": string,"membro_id": string,"modulo": string,"primeiro_em"?: string,"ultimo_em"?: string
                  }
                  Update: {
                    "consultoria_id"?: string,"dia"?: string,"membro_id"?: string,"modulo"?: string,"primeiro_em"?: string,"ultimo_em"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "uso_diario_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "uso_diario_membro_fk"
      columns: ["consultoria_id","membro_id"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"vistoria": {
                  Row: {
                    "consultoria_id": string,"criada_em": string,"criada_por": string,"data_planejada": string,"duracao_minutos": number | null,"enviada_em": string | null,"enviada_por": string | null,"hora_planejada": string | null,"id": string,"iniciada_em": string | null,"objetivo": string | null,"observacao": string | null,"ocorrencia_id": string,"responsavel_id": string,"row_version": number,"situacao": Database["public"]['Enums']["situacao_vistoria"],"titulo": string
                  }
                  ComputedFields: never
                  Insert: {
                    "consultoria_id": string,"criada_em"?: string,"criada_por": string,"data_planejada": string,"duracao_minutos"?: number | null,"enviada_em"?: string | null,"enviada_por"?: string | null,"hora_planejada"?: string | null,"id": string,"iniciada_em"?: string | null,"objetivo"?: string | null,"observacao"?: string | null,"ocorrencia_id": string,"responsavel_id": string,"row_version"?: number,"situacao"?: Database["public"]['Enums']["situacao_vistoria"],"titulo": string
                  }
                  Update: {
                    "consultoria_id"?: string,"criada_em"?: string,"criada_por"?: string,"data_planejada"?: string,"duracao_minutos"?: number | null,"enviada_em"?: string | null,"enviada_por"?: string | null,"hora_planejada"?: string | null,"id"?: string,"iniciada_em"?: string | null,"objetivo"?: string | null,"observacao"?: string | null,"ocorrencia_id"?: string,"responsavel_id"?: string,"row_version"?: number,"situacao"?: Database["public"]['Enums']["situacao_vistoria"],"titulo"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "vistoria_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vistoria_criada_por_fk"
      columns: ["consultoria_id","criada_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "vistoria_enviada_por_fk"
      columns: ["consultoria_id","enviada_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "vistoria_ocorrencia_fk"
      columns: ["consultoria_id","ocorrencia_id"]
isOneToOne: false
      referencedRelation: "ocorrencia"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "vistoria_responsavel_fk"
      columns: ["consultoria_id","responsavel_id"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"vistoria_decisao": {
                  Row: {
                    "conferente_id": string,"consultoria_id": string,"decidida_em": string,"decisao": Database["public"]['Enums']["decisao_conferencia"],"id": string,"motivo": string | null,"vistoria_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "conferente_id": string,"consultoria_id": string,"decidida_em"?: string,"decisao": Database["public"]['Enums']["decisao_conferencia"],"id"?: string,"motivo"?: string | null,"vistoria_id": string
                  }
                  Update: {
                    "conferente_id"?: string,"consultoria_id"?: string,"decidida_em"?: string,"decisao"?: Database["public"]['Enums']["decisao_conferencia"],"id"?: string,"motivo"?: string | null,"vistoria_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "vistoria_decisao_conferente_fk"
      columns: ["consultoria_id","conferente_id"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "vistoria_decisao_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vistoria_decisao_vistoria_fk"
      columns: ["consultoria_id","vistoria_id"]
isOneToOne: false
      referencedRelation: "vistoria"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"vistoria_foto": {
                  Row: {
                    "autor_id": string,"caminho": string,"capturada_em": string,"consultoria_id": string,"criada_em": string,"excluida_em": string | null,"excluida_por": string | null,"id": string,"item_id": string,"latitude": number | null,"legenda": string | null,"local_manual": string | null,"local_origem": string,"longitude": number | null,"mime": string,"nome_original": string,"precisao_m": number | null,"sha256": string,"tamanho_bytes": number,"vistoria_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "autor_id": string,"caminho": string,"capturada_em": string,"consultoria_id": string,"criada_em"?: string,"excluida_em"?: string | null,"excluida_por"?: string | null,"id": string,"item_id": string,"latitude"?: number | null,"legenda"?: string | null,"local_manual"?: string | null,"local_origem": string,"longitude"?: number | null,"mime": string,"nome_original": string,"precisao_m"?: number | null,"sha256": string,"tamanho_bytes": number,"vistoria_id": string
                  }
                  Update: {
                    "autor_id"?: string,"caminho"?: string,"capturada_em"?: string,"consultoria_id"?: string,"criada_em"?: string,"excluida_em"?: string | null,"excluida_por"?: string | null,"id"?: string,"item_id"?: string,"latitude"?: number | null,"legenda"?: string | null,"local_manual"?: string | null,"local_origem"?: string,"longitude"?: number | null,"mime"?: string,"nome_original"?: string,"precisao_m"?: number | null,"sha256"?: string,"tamanho_bytes"?: number,"vistoria_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "vistoria_foto_autor_fk"
      columns: ["consultoria_id","autor_id"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "vistoria_foto_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vistoria_foto_excluida_por_fk"
      columns: ["consultoria_id","excluida_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "vistoria_foto_item_fk"
      columns: ["consultoria_id","vistoria_id","item_id"]
isOneToOne: false
      referencedRelation: "vistoria_item"
      referencedColumns: ["consultoria_id","vistoria_id","id"]
    },{
      foreignKeyName: "vistoria_foto_vistoria_fk"
      columns: ["consultoria_id","vistoria_id"]
isOneToOne: false
      referencedRelation: "vistoria"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                },"vistoria_item": {
                  Row: {
                    "comentario": string | null,"consultoria_id": string,"descricao": string | null,"id": string,"posicao": number,"registrado_em": string | null,"registrado_por": string | null,"resultado": Database["public"]['Enums']["resultado_item_vistoria"],"titulo": string,"vistoria_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "comentario"?: string | null,"consultoria_id": string,"descricao"?: string | null,"id"?: string,"posicao": number,"registrado_em"?: string | null,"registrado_por"?: string | null,"resultado"?: Database["public"]['Enums']["resultado_item_vistoria"],"titulo": string,"vistoria_id": string
                  }
                  Update: {
                    "comentario"?: string | null,"consultoria_id"?: string,"descricao"?: string | null,"id"?: string,"posicao"?: number,"registrado_em"?: string | null,"registrado_por"?: string | null,"resultado"?: Database["public"]['Enums']["resultado_item_vistoria"],"titulo"?: string,"vistoria_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "vistoria_item_consultoria_id_fkey"
      columns: ["consultoria_id"]
isOneToOne: false
      referencedRelation: "consultoria"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "vistoria_item_registrado_por_fk"
      columns: ["consultoria_id","registrado_por"]
isOneToOne: false
      referencedRelation: "membro"
      referencedColumns: ["consultoria_id","id"]
    },{
      foreignKeyName: "vistoria_item_vistoria_fk"
      columns: ["consultoria_id","vistoria_id"]
isOneToOne: false
      referencedRelation: "vistoria"
      referencedColumns: ["consultoria_id","id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "abrir_acesso_de_emergencia":
{ Args: { "p_categoria": string,"p_consultoria_id": string,"p_id": string,"p_motivo": string }; Returns: string
                           },
"aceitar_convite":
{ Args: { "p_token": string }; Returns: string
                           },
"adicionar_foto_da_vistoria":
{ Args: { "p_caminho": string,"p_capturada_em": string,"p_foto_id": string,"p_item_id": string,"p_latitude": number,"p_legenda": string,"p_local_manual": string,"p_local_origem": string,"p_longitude": number,"p_nome_original": string,"p_precisao_m": number,"p_sha256": string }; Returns: string
                           },
"adicionar_tarefa_servico":
{ Args: { "p_id": string,"p_minutos": number,"p_orcamento_id": string,"p_prazo_interno": string,"p_responsavel_id": string,"p_titulo": string }; Returns: string
                           },
"alterar_papel":
{ Args: { "p_membro_id": string,"p_papel": Database["public"]['Enums']["papel_membro"] }; Returns: undefined
                           },
"anexar_pdf_residuo":
{ Args: { "p_caminho": string,"p_entidade": string,"p_nome_original": string,"p_registro_id": string,"p_sha256": string,"p_versao_id": string }; Returns: string
                           },
"aprovar_orcamento":
{ Args: { "p_aprovado_por": string,"p_data_aceite": string,"p_gerar_tarefas"?: boolean,"p_id": string,"p_metodo"?: string,"p_referencia": string,"p_row_version": number,"p_tarefas"?: Json }; Returns: number
                           },
"assinar_plano_simulado":
{ Args: { "p_ciclo": string,"p_consultoria_id": string,"p_forma": string,"p_plano": string }; Returns: {
              "cobranca_id": string,"mudanca_em": string
            }[]
                           },
"ativar_plano":
{ Args: { "p_chave": string,"p_instrumento_id": string,"p_row_version": number }; Returns: number
                           },
"atribuir_a_todos":
{ Args: { "p_instrumento_id": string,"p_membro_id": string }; Returns: undefined
                           },
"atribuir_ocorrencia":
{ Args: { "p_membro_id": string,"p_ocorrencia_id": string,"p_row_version": number }; Returns: number
                           },
"autorizar_acesso_de_suporte":
{ Args: { "p_consultoria_id": string,"p_horas": number,"p_id": string,"p_motivo"?: string }; Returns: string
                           },
"avisos_de_suporte_pendentes":
{ Args: { "p_consultoria_id": string }; Returns: {
              "categoria": string,"fim_previsto": string,"id": string,"inicio": string,"motivo": string,"operador_nome": string
            }[]
                           },
"cadastrar_empreendimento_do_prospecto":
{ Args: { "p_empreendimento_id": string,"p_orcamento_id": string }; Returns: string
                           },
"cancelar_convite":
{ Args: { "p_convite_id": string }; Returns: undefined
                           },
"cancelar_plano_simulado":
{ Args: { "p_consultoria_id": string }; Returns: string
                           },
"cancelar_vistoria":
{ Args: { "p_id": string,"p_motivo": string,"p_row_version": number }; Returns: number
                           },
"carga_da_equipe":
{ Args: { "p_consultoria_id": string }; Returns: Json
                           },
"catalogo_comercial":
{ Args: Record<PropertyKey, never>; Returns: {
              "adicional_mensal_centavos": number,"codigo": string,"dias_de_teste_padrao": number,"dias_uteis_de_tolerancia": number,"empreendimentos": number,"fim_do_beta": string,"ia": boolean,"mensal_centavos": number,"mensalidades_no_anual": number,"moeda": string,"nome": string,"orcamentos": boolean,"ordem": number,"pessoas": number,"recursos": (string)[]
            }[]
                           },
"central_acessos_de_suporte":
{ Args: { "p_consultoria_id": string,"p_deslocamento"?: number,"p_limite"?: number }; Returns: {
              "aberto_por_nome": string,"ativo": boolean,"autorizado_por_nome": string,"aviso_visto_em": string,"aviso_visto_por_nome": string,"categoria": string,"encerrado_em": string,"encerrado_por_nome": string,"encerramento": string,"entradas": Json,"fim_previsto": string,"id": string,"inicio": string,"modo": string,"motivo": string,"total": number
            }[]
                           },
"central_ajustar_dias_de_teste":
{ Args: { "p_consultoria_id": string,"p_dias": number,"p_motivo": string,"p_row_version": number }; Returns: number
                           },
"central_alertas_sem_uso":
{ Args: { "p_deslocamento"?: number,"p_dias"?: number,"p_limite"?: number }; Returns: {
              "criada_em": string,"fuso": string,"id": string,"nome": string,"pessoas_ativas": number,"situacao": Database["public"]['Enums']["situacao_consultoria"],"total": number,"ultimo_uso_em": string
            }[]
                           },
"central_atualizar_configuracao_comercial":
{ Args: { "p_adicional_mensal_centavos": number,"p_dias_de_teste_padrao": number,"p_dias_uteis_de_tolerancia": number,"p_fim_do_beta": string,"p_mensalidades_no_anual": number,"p_motivo": string }; Returns: undefined
                           },
"central_atualizar_plano":
{ Args: { "p_codigo": string,"p_empreendimentos": number,"p_ia": boolean,"p_mensal_centavos": number,"p_motivo": string,"p_nome": string,"p_orcamentos": boolean,"p_pessoas": number }; Returns: undefined
                           },
"central_cobrancas":
{ Args: { "p_consultoria_id": string,"p_deslocamento"?: number,"p_limite"?: number }; Returns: {
              "forma": string,"id": string,"invoice_url": string,"pago_em": string,"situacao": string,"tipo": string,"total": number,"valor_centavos": number,"vencimento": string
            }[]
                           },
"central_definir_plano_contrato":
{ Args: { "p_ate": string,"p_consultoria_id": string,"p_motivo": string,"p_plano": string,"p_row_version": number }; Returns: number
                           },
"central_definir_recursos_do_plano":
{ Args: { "p_codigo": string,"p_motivo": string,"p_recursos": (string)[] }; Returns: undefined
                           },
"central_detalhar_consultoria":
{ Args: { "p_consultoria_id": string }; Returns: {
              "criada_em": string,"empreendimentos": number,"fuso": string,"gestao": Json,"id": string,"licencas": number,"nome": string,"orcamentos": number,"pessoas_ativas": number,"row_version": number,"situacao": Database["public"]['Enums']["situacao_consultoria"],"situacao_alterada_em": string,"situacao_alterada_por_nome": string,"situacao_motivo": string
            }[]
                           },
"central_financeiro_lista":
{ Args: { "p_deslocamento"?: number,"p_grupo"?: string,"p_limite"?: number }; Returns: {
              "ciclo": string,"em_atraso_desde": string,"id": string,"mensal_centavos": number,"nome": string,"plano": string,"situacao": string,"teste_ate": string,"total": number
            }[]
                           },
"central_historico_comercial":
{ Args: { "p_consultoria_id": string,"p_deslocamento"?: number,"p_limite"?: number }; Returns: {
              "alterada_em": string,"alterada_por_nome": string,"id": string,"motivo": string,"tipo": string,"total": number,"valor_anterior": string,"valor_novo": string
            }[]
                           },
"central_historico_parametros":
{ Args: { "p_deslocamento"?: number,"p_limite"?: number }; Returns: {
              "alterada_em": string,"alterada_por_nome": string,"alvo": string,"antes": Json,"depois": Json,"id": string,"motivo": string,"total": number
            }[]
                           },
"central_historico_situacao":
{ Args: { "p_consultoria_id": string,"p_deslocamento"?: number,"p_limite"?: number }; Returns: {
              "alterada_em": string,"alterada_por_nome": string,"id": string,"motivo": string,"situacao_anterior": Database["public"]['Enums']["situacao_consultoria"],"situacao_nova": Database["public"]['Enums']["situacao_consultoria"],"total": number
            }[]
                           },
"central_horas_poupadas":
{ Args: { "p_consultoria_id"?: string,"p_meses"?: number }; Returns: {
              "consultorias_com_dados": number,"consultorias_juntando": number,"estimado": boolean,"horas_acompanhamento": number,"horas_cadastro": number,"horas_total": number,"mes": string,"reais_centavos": number
            }[]
                           },
"central_lista_de_espera":
{ Args: { "p_deslocamento"?: number,"p_limite"?: number,"p_so_pendentes"?: boolean }; Returns: {
              "contatado_em": string,"contato": string,"convidado_em": string,"criada_em": string,"id": string,"nome": string,"tipo_contato": string,"total": number
            }[]
                           },
"central_listar_consultorias":
{ Args: { "p_busca"?: string,"p_deslocamento"?: number,"p_limite"?: number,"p_situacao"?: Database["public"]['Enums']["situacao_consultoria"] }; Returns: {
              "criada_em": string,"empreendimentos": number,"fuso": string,"gestao": Json,"id": string,"licencas": number,"nome": string,"orcamentos": number,"pessoas_ativas": number,"situacao": Database["public"]['Enums']["situacao_consultoria"],"situacao_alterada_em": string,"total": number,"ultimo_uso_em": string
            }[]
                           },
"central_listar_pessoas":
{ Args: { "p_consultoria_id": string,"p_deslocamento"?: number,"p_limite"?: number }; Returns: {
              "criado_em": string,"desligado_em": string,"dias_com_uso_30": number,"email": string,"membro_id": string,"nome": string,"papel": Database["public"]['Enums']["papel_membro"],"situacao": Database["public"]['Enums']["situacao_membro"],"total": number,"ultimo_uso_em": string
            }[]
                           },
"central_marcar_conta_interna":
{ Args: { "p_consultoria_id": string,"p_interna": boolean,"p_motivo": string,"p_row_version": number }; Returns: number
                           },
"central_marcar_contatado":
{ Args: { "p_contatado": boolean,"p_id": string }; Returns: undefined
                           },
"central_metricas_de_valor":
{ Args: { "p_consultoria_id"?: string,"p_meses"?: number }; Returns: {
              "antecedencia_media": number,"atrasadas": number,"carga_celulas": number,"carga_entregas": number,"carga_pico": number,"concluidas": number,"concluidas_com_evidencia": number,"condicionantes_ativas": number,"condicionantes_com_responsavel": number,"criadas": number,"dias_ate_decisao": number,"dias_ate_envio": number,"dias_de_atraso": number,"mes": string,"meta_cumpridas": number,"meta_previstas": number,"nao_planejadas": number,"orcamentos_aprovados": number,"orcamentos_criados": number,"orcamentos_decididos": number,"orcamentos_enviados": number,"orcamentos_pelos_custos": number,"orcamentos_preco_digitado": number,"prazo_cumpridas": number,"prazo_previstas": number,"renovacoes_protegidas": number,"renovacoes_vencendo": number,"ticket_medio_aprovado_centavos": number,"urgencias": number
            }[]
                           },
"central_mudar_situacao":
{ Args: { "p_chave": string,"p_consultoria_id": string,"p_motivo": string,"p_row_version": number,"p_situacao": Database["public"]['Enums']["situacao_consultoria"] }; Returns: number
                           },
"central_plano_da_consultoria":
{ Args: { "p_consultoria_id": string }; Returns: {
              "bloqueio_em": string,"ciclo": string,"ciclo_agendado": string,"condicao_row_version": number,"contrato_ate": string,"convites_pendentes": number,"criada_em": string,"dias_de_teste": number,"em_atraso_desde": string,"empreendimentos": number,"fim_do_beta": string,"forma": string,"hoje": string,"interna": boolean,"mudanca_em": string,"pessoas": number,"plano": string,"plano_agendado": string,"plano_contrato": string,"proximo_vencimento": string,"situacao": string,"situacao_asaas": string,"somente_leitura": boolean,"teste_ate": string,"valida_ate": string,"vencimentos_em_aberto": Json
            }[]
                           },
"central_registrar_convite":
{ Args: { "p_id": string }; Returns: {
              "contato": string,"nome": string,"tipo_contato": string
            }[]
                           },
"central_resumo_de_uso":
{ Args: { "p_minutos_agora"?: number }; Returns: {
              "agora": number,"ultimos_30_dias": number,"ultimos_7_dias": number
            }[]
                           },
"central_resumo_do_mes":
{ Args: { "p_consultoria_id": string,"p_mes"?: string }; Returns: {
              "consultoria_id": string,"consultoria_nome": string,"horas_estimadas": boolean,"horas_total": number,"juntando_dados": boolean,"mes": string,"mes_do_resumo": string,"prazo_cumpridas": number,"prazo_previstas": number,"reais_centavos": number,"renovacoes_protegidas": number,"renovacoes_vencendo": number
            }[]
                           },
"central_resumo_financeiro":
{ Args: Record<PropertyKey, never>; Returns: {
              "anuais": number,"beta": number,"bloqueadas": number,"cancelados": number,"em_atraso": number,"em_teste": number,"internas": number,"mensais": number,"mrr_centavos": number,"pagantes": number,"por_contrato": number,"receita_equipe_centavos": number,"receita_escala_centavos": number,"receita_essencial_centavos": number,"teste_acabando": number,"teste_encerrado": number,"ticket_medio_centavos": number
            }[]
                           },
"central_simular_atraso":
{ Args: { "p_consultoria_id": string,"p_dias"?: number }; Returns: string
                           },
"central_simular_pagamento":
{ Args: { "p_consultoria_id": string }; Returns: number
                           },
"central_uso_por_modulo":
{ Args: { "p_consultoria_id": string }; Returns: {
              "dias": number,"modulo": string,"ultimo_uso_em": string
            }[]
                           },
"completar_cadastro":
{ Args: { "p_em_curso"?: boolean,"p_genero": string,"p_profissao": string }; Returns: undefined
                           },
"concluir_etapa":
{ Args: { "p_etapa_id": string }; Returns: undefined
                           },
"concluir_extracao_ia":
{ Args: { "p_custo_micros": number,"p_duracao_ms": number,"p_id": string,"p_modelo": string,"p_paginas": number,"p_resultado": Json,"p_tokens_entrada": number,"p_tokens_saida": number,"p_versao_prompt": string }; Returns: number
                           },
"concluir_ocorrencia":
{ Args: { "p_ocorrencia_id": string,"p_row_version": number }; Returns: number
                           },
"concluir_sem_evidencia":
{ Args: { "p_justificativa": string,"p_ocorrencia_id": string,"p_row_version": number }; Returns: number
                           },
"conferencia_residuos":
{ Args: { "p_consultoria_id": string,"p_empreendimento_id"?: string }; Returns: {
              "cdfs": Json,"dias": number,"diferenca": number,"emitido_em": string,"empreendimento_id": string,"empreendimento_nome": string,"mtr_id": string,"mtr_item_id": string,"numero": string,"quantidade_cdf": number,"quantidade_mtr": number,"residuo_codigo": string,"residuo_descricao": string,"tipo": string,"unidade": string,"unidades_cdf": Json
            }[]
                           },
"conferir_evidencia":
{ Args: { "p_decisao": Database["public"]['Enums']["decisao_conferencia"],"p_evidencia_id": string,"p_motivo": string }; Returns: undefined
                           },
"conferir_vistoria":
{ Args: { "p_decisao": Database["public"]['Enums']["decisao_conferencia"],"p_id": string,"p_motivo": string,"p_row_version": number }; Returns: number
                           },
"confirmar_adicional":
{ Args: { "p_consultoria_id": string,"p_recurso": string }; Returns: {
              "adicionais_centavos": number,"limite": number,"quantidade": number,"recurso": string
            }[]
                           },
"confirmar_prazo":
{ Args: { "p_condicionante_id": string,"p_contagem": Database["public"]['Enums']["contagem_prazo"],"p_data_referencia": string,"p_fonte_regra": string,"p_intervalo": number,"p_primeira_data": string,"p_recorrencia": Database["public"]['Enums']["recorrencia_prazo"],"p_unidade": Database["public"]['Enums']["unidade_ciclo"] }; Returns: undefined
                           },
"confirmar_registro_profissional":
{ Args: { "p_registro_id": string,"p_row_version": number }; Returns: number
                           },
"consultar_convite":
{ Args: { "p_token": string }; Returns: {
              "consultoria_fuso": string,"consultoria_nome": string,"conta_com_senha": boolean,"convidado_por_nome": string,"email": string,"expira_em": string,"papel": Database["public"]['Enums']["papel_membro"],"situacao": string
            }[]
                           },
"contar_orcamentos_por_situacao":
{ Args: { "p_busca"?: string,"p_consultoria_id": string,"p_lixeira"?: boolean }; Returns: {
              "quantidade": number,"situacao": Database["public"]['Enums']["situacao_orcamento"]
            }[]
                           },
"contar_prazos":
{ Args: { "p_aba"?: string,"p_consultoria_id": string,"p_empreendimento_id"?: string,"p_responsavel_id"?: string,"p_sem_responsavel"?: boolean,"p_tipo_id"?: string }; Returns: {
              "atrasadas": number,"hoje": number,"proximos_7": number,"sem_responsavel": number,"total": number
            }[]
                           },
"criar_consultoria":
{ Args: { "p_id": string,"p_nome": string }; Returns: string
                           },
"criar_convite":
{ Args: { "p_consultoria_id": string,"p_email": string,"p_papel": Database["public"]['Enums']["papel_membro"] }; Returns: {
              "convite_id": string,"token": string
            }[]
                           },
"criar_empreendimento":
{ Args: { "p_cliente"?: string,"p_cnpj"?: string,"p_consultoria_id": string,"p_id": string,"p_nome": string,"p_primeira_unidade"?: string }; Returns: string
                           },
"criar_etapa":
{ Args: { "p_horas": number,"p_id": string,"p_meta": string,"p_modo": Database["public"]['Enums']["modo_etapa"],"p_ocorrencia_id": string,"p_responsavel_externo": string,"p_responsavel_id": string,"p_titulo": string }; Returns: string
                           },
"criar_instrumento":
{ Args: { "p_id": string,"p_unidade_id": string }; Returns: string
                           },
"criar_orcamento":
{ Args: { "p_consultoria_id": string,"p_empreendimento_id": string,"p_id": string,"p_objeto": string,"p_prospecto"?: Json }; Returns: string
                           },
"criar_tipo_instrumento":
{ Args: { "p_consultoria_id": string,"p_nome": string,"p_sigla": string }; Returns: string
                           },
"criar_unidade":
{ Args: { "p_empreendimento_id": string,"p_endereco"?: string,"p_id": string,"p_nome": string }; Returns: string
                           },
"criar_vistoria":
{ Args: { "p_data": string,"p_duracao_minutos": number,"p_hora": string,"p_id": string,"p_itens": Json,"p_objetivo": string,"p_ocorrencia_id": string,"p_responsavel_id": string,"p_titulo": string }; Returns: string
                           },
"dados_do_aviso_de_emergencia":
{ Args: { "p_acesso_id": string }; Returns: {
              "acesso_id": string,"categoria": string,"consultoria_fuso": string,"consultoria_id": string,"consultoria_nome": string,"fim_previsto": string,"inicio": string,"motivo": string,"operador_nome": string
            }[]
                           },
"declarar_registro_profissional":
{ Args: { "p_conselho": string,"p_membro_id": string,"p_numero": string,"p_profissao": string,"p_uf"?: string,"p_valido_ate"?: string }; Returns: string
                           },
"definir_acompanhamento":
{ Args: { "p_dias": number,"p_plano_id": string,"p_row_version": number }; Returns: number
                           },
"definir_antecedencia_renovacao":
{ Args: { "p_antecedencia": number,"p_plano_id": string,"p_row_version": number }; Returns: number
                           },
"definir_cadastro_federal":
{ Args: { "p_membro_id": string,"p_numero"?: string,"p_valido_ate"?: string }; Returns: undefined
                           },
"definir_meu_genero":
{ Args: { "p_genero": string }; Returns: undefined
                           },
"definir_obrigacao_residuo":
{ Args: { "p_ativa": boolean,"p_empreendimento_id": string,"p_observacao"?: string,"p_tipo": string }; Returns: string
                           },
"definir_profissao_e_cargo":
{ Args: { "p_cargo": string,"p_membro_id": string,"p_outras_profissoes"?: (string)[],"p_profissao": string,"p_profissao_em_curso"?: boolean }; Returns: undefined
                           },
"definir_responsavel":
{ Args: { "p_condicionante_id": string,"p_membro_id": string }; Returns: undefined
                           },
"descartar_rascunho_configuracao_orcamento":
{ Args: { "p_consultoria_id": string,"p_row_version": number }; Returns: undefined
                           },
"desfazer_confirmacao_prazo":
{ Args: { "p_condicionante_id": string }; Returns: undefined
                           },
"designar_conferente":
{ Args: { "p_membro_id": string,"p_ocorrencia_id": string }; Returns: undefined
                           },
"desligar_membro":
{ Args: { "p_membro_id": string,"p_motivo"?: string }; Returns: undefined
                           },
"dispensar_convite_configuracao_orcamento":
{ Args: { "p_consultoria_id": string }; Returns: undefined
                           },
"duplicar_orcamento":
{ Args: { "p_copiar_precos"?: boolean,"p_id": string,"p_novo_id": string }; Returns: string
                           },
"editar_alvara":
{ Args: { "p_alvara_id": string,"p_notas"?: string,"p_numero"?: string,"p_orgao"?: string,"p_row_version": number,"p_validade": string }; Returns: number
                           },
"editar_cdf":
{ Args: { "p_destinador_cnpj": string,"p_destinador_nome": string,"p_emitido_em": string,"p_id": string,"p_mtrs": Json,"p_numero": string,"p_observacao"?: string,"p_periodo_fim": string,"p_periodo_inicio": string,"p_row_version": number }; Returns: number
                           },
"editar_empreendimento":
{ Args: { "p_cliente": string,"p_cnpj": string,"p_id": string,"p_nome": string }; Returns: undefined
                           },
"editar_mtr":
{ Args: { "p_destinador_cnpj": string,"p_destinador_nome": string,"p_emitido_em": string,"p_id": string,"p_itens": Json,"p_numero": string,"p_observacao"?: string,"p_row_version": number,"p_situacao": string,"p_transportador_cnpj": string,"p_transportador_nome": string }; Returns: number
                           },
"editar_tarefa_servico":
{ Args: { "p_id": string,"p_minutos": number,"p_prazo_interno": string,"p_responsavel_id": string,"p_row_version": number,"p_titulo": string }; Returns: number
                           },
"editar_unidade":
{ Args: { "p_endereco": string,"p_id": string,"p_nome": string }; Returns: undefined
                           },
"empreendimentos_parecidos":
{ Args: { "p_cnpj"?: string,"p_consultoria_id": string,"p_ignorar"?: string,"p_nome": string }; Returns: {
              "id": string,"mesmo_cnpj": boolean,"mesmo_nome": boolean,"nome": string
            }[]
                           },
"encerrar_acesso_de_suporte":
{ Args: { "p_acesso_id": string }; Returns: undefined
                           },
"entrar_como_suporte":
{ Args: { "p_consultoria_id": string }; Returns: string
                           },
"entrar_lista_de_espera":
{ Args: { "p_contato": string,"p_nome": string }; Returns: undefined
                           },
"enviar_evidencia":
{ Args: { "p_caminho": string,"p_data_execucao": string,"p_evidencia_id": string,"p_nome_original": string,"p_ocorrencia_id": string,"p_sha256": string,"p_versao_id": string }; Returns: number
                           },
"enviar_vistoria":
{ Args: { "p_id": string,"p_row_version": number }; Returns: number
                           },
"excluir_alvara":
{ Args: { "p_alvara_id": string,"p_row_version": number }; Returns: undefined
                           },
"excluir_cdf":
{ Args: { "p_id": string,"p_row_version": number }; Returns: undefined
                           },
"excluir_foto_da_vistoria":
{ Args: { "p_foto_id": string }; Returns: undefined
                           },
"excluir_modelo_de_orcamento":
{ Args: { "p_id": string,"p_row_version": number }; Returns: undefined
                           },
"excluir_mtr":
{ Args: { "p_id": string,"p_row_version": number }; Returns: undefined
                           },
"excluir_orcamento":
{ Args: { "p_id": string,"p_row_version": number }; Returns: number
                           },
"falhar_extracao_ia":
{ Args: { "p_custo_micros": number,"p_detalhe": string,"p_duracao_ms": number,"p_id": string,"p_modelo": string,"p_motivo": string,"p_paginas": number,"p_tokens_entrada": number,"p_tokens_saida": number,"p_versao_prompt": string }; Returns: undefined
                           },
"iniciar_extracao_ia":
{ Args: { "p_id": string,"p_instrumento_id": string }; Returns: {
              "caminho": string,"itens_propostos": number,"mime": string,"motivo": string,"nova": boolean,"situacao": string,"tamanho_bytes": number,"tipos": (string)[]
            }[]
                           },
"iniciar_vistoria":
{ Args: { "p_id": string }; Returns: number
                           },
"lista_de_espera_marcar_avisados":
{ Args: { "p_ids": (string)[] }; Returns: number
                           },
"lista_de_espera_pendente_de_aviso":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"listar_aceites_do_orcamento":
{ Args: { "p_orcamento_id": string }; Returns: {
              "aprovado_por": string,"conteudo_sha256": string,"data_aceite": string,"metodo": string,"referencia": string,"registrado_em": string,"registrado_por_nome": string,"revisao": number
            }[]
                           },
"listar_acessos_de_suporte":
{ Args: { "p_consultoria_id": string,"p_deslocamento"?: number,"p_limite"?: number }; Returns: {
              "aberto_por_nome": string,"ativo": boolean,"autorizado_por_nome": string,"aviso_visto_em": string,"aviso_visto_por_nome": string,"categoria": string,"encerrado_em": string,"encerrado_por_nome": string,"encerramento": string,"entradas": Json,"fim_previsto": string,"id": string,"inicio": string,"modo": string,"motivo": string,"total": number
            }[]
                           },
"listar_aguardando_conferencia":
{ Args: { "p_consultoria_id": string,"p_deslocamento"?: number,"p_limite"?: number }; Returns: {
              "codigo": string,"conferente_nome": string,"empreendimento_nome": string,"enviada_em": string,"evidencia_numero": number,"ocorrencia_id": string,"responsavel_nome": string,"titulo": string,"total": number
            }[]
                           },
"listar_calendario":
{ Args: { "p_ate": string,"p_consultoria_id": string,"p_de": string,"p_responsavel_id"?: string,"p_sem_responsavel"?: boolean,"p_unidade_id"?: string }; Returns: {
              "codigo": string,"data": string,"dias": number,"empreendimento_nome": string,"id": string,"instrumento_id": string,"licenca": string,"responsavel_nome": string,"sem_responsavel": boolean,"tipo_evento": string,"titulo": string,"unidade_nome": string
            }[]
                           },
"listar_cdfs":
{ Args: { "p_ate"?: string,"p_busca"?: string,"p_consultoria_id": string,"p_de"?: string,"p_deslocamento"?: number,"p_empreendimento_id"?: string,"p_limite"?: number }; Returns: {
              "criado_em": string,"destinador_cnpj": string,"destinador_nome": string,"emitido_em": string,"empreendimento_id": string,"empreendimento_nome": string,"id": string,"mtrs": Json,"numero": string,"observacao": string,"pdf_caminho": string,"pdf_nome": string,"periodo_fim": string,"periodo_inicio": string,"row_version": number,"total": number
            }[]
                           },
"listar_empreendimentos":
{ Args: { "p_busca"?: string,"p_consultoria_id": string,"p_deslocamento"?: number,"p_limite"?: number }; Returns: {
              "cliente_nome": string,"cnpj": string,"criado_em": string,"id": string,"licencas": Json,"nome": string,"total": number,"unidades": number
            }[]
                           },
"listar_modelos_de_orcamento":
{ Args: { "p_busca"?: string,"p_consultoria_id": string,"p_deslocamento"?: number,"p_limite"?: number }; Returns: Json
                           },
"listar_mtrs":
{ Args: { "p_ate"?: string,"p_busca"?: string,"p_consultoria_id": string,"p_de"?: string,"p_deslocamento"?: number,"p_empreendimento_id"?: string,"p_limite"?: number,"p_sem_cdf"?: boolean,"p_situacao"?: string }; Returns: {
              "cdfs": Json,"criado_em": string,"destinador_cnpj": string,"destinador_nome": string,"emitido_em": string,"empreendimento_id": string,"empreendimento_nome": string,"id": string,"itens": Json,"numero": string,"observacao": string,"pdf_caminho": string,"pdf_nome": string,"row_version": number,"situacao": string,"tem_cdf": boolean,"total": number,"transportador_cnpj": string,"transportador_nome": string
            }[]
                           },
"listar_orcamentos":
{ Args: { "p_busca"?: string,"p_consultoria_id": string,"p_deslocamento"?: number,"p_limite"?: number,"p_lixeira"?: boolean,"p_situacao"?: Database["public"]['Enums']["situacao_orcamento"] }; Returns: {
              "ano": number,"atualizado_em": string,"empreendimento_id": string,"empreendimento_nome": string,"excluido_em": string,"id": string,"objeto": string,"revisao": number,"row_version": number,"sequencia": number,"situacao": Database["public"]['Enums']["situacao_orcamento"],"total": number,"total_centavos": number
            }[]
                           },
"listar_prazos":
{ Args: { "p_aba"?: string,"p_consultoria_id": string,"p_deslocamento"?: number,"p_empreendimento_id"?: string,"p_faixa"?: string,"p_limite"?: number,"p_ordem"?: string,"p_responsavel_id"?: string,"p_sem_responsavel"?: boolean,"p_tipo_id"?: string }; Returns: {
              "codigo": string,"dias": number,"empreendimento_id": string,"empreendimento_nome": string,"id": string,"instrumento_id": string,"licenca": string,"prazo": string,"responsavel_id": string,"responsavel_nome": string,"row_version": number,"situacao_ocorrencia": Database["public"]['Enums']["situacao_ocorrencia"],"tipo_linha": string,"titulo": string,"total": number,"unidade_nome": string
            }[]
                           },
"listar_renovacoes":
{ Args: { "p_consultoria_id": string,"p_deslocamento"?: number,"p_limite"?: number }; Returns: {
              "acompanhamento_dias": number,"antecedencia_dias": number,"dias_limite_protocolo": number,"empreendimento_id": string,"empreendimento_nome": string,"hoje": string,"id": string,"instrumento_id": string,"licenca": string,"orgao": string,"protocolado_em": string,"protocolo_numero": string,"total": number,"unidade_nome": string,"validade": string
            }[]
                           },
"listar_tarefas_servico":
{ Args: { "p_abertas"?: boolean,"p_ate"?: string,"p_consultoria_id": string,"p_de"?: string,"p_orcamento_id"?: string,"p_responsavel_id"?: string,"p_sem_responsavel"?: boolean }; Returns: {
              "dias": number,"empreendimento_nome": string,"fora_da_revisao": boolean,"id": string,"minutos_estimados": number,"orcamento_ano": number,"orcamento_id": string,"orcamento_item_id": string,"orcamento_revisao": number,"orcamento_sequencia": number,"ordem": number,"prazo_interno": string,"responsavel_id": string,"responsavel_nome": string,"row_version": number,"situacao": Database["public"]['Enums']["situacao_tarefa_servico"],"titulo": string
            }[]
                           },
"listar_vistorias":
{ Args: { "p_deslocamento"?: number,"p_limite"?: number,"p_ocorrencia_id"?: string,"p_somente_minhas"?: boolean }; Returns: {
              "condicionante_codigo": string,"condicionante_titulo": string,"consultoria_id": string,"data_planejada": string,"duracao_minutos": number,"empreendimento_id": string,"empreendimento_nome": string,"enviada_em": string,"hoje": string,"hora_planejada": string,"id": string,"iniciada_em": string,"itens_registrados": number,"licenca": string,"ocorrencia_id": string,"responsavel_id": string,"responsavel_nome": string,"row_version": number,"situacao": Database["public"]['Enums']["situacao_vistoria"],"titulo": string,"total": number,"total_itens": number,"unidade_id": string,"unidade_nome": string
            }[]
                           },
"marcar_aviso_de_suporte_visto":
{ Args: { "p_acesso_id": string }; Returns: undefined
                           },
"meus_acessos_de_suporte":
{ Args: Record<PropertyKey, never>; Returns: {
              "acesso_id": string,"consultoria_fuso": string,"consultoria_id": string,"consultoria_nome": string,"fim_previsto": string,"modo": string
            }[]
                           },
"meus_vinculos":
{ Args: Record<PropertyKey, never>; Returns: {
              "consultoria_fuso": string,"consultoria_id": string,"consultoria_nome": string,"desligado_em": string,"membro_id": string,"papel": Database["public"]['Enums']["papel_membro"],"situacao": Database["public"]['Enums']["situacao_membro"]
            }[]
                           },
"mover_condicionante":
{ Args: { "p_id": string,"p_pai_id": string }; Returns: undefined
                           },
"mudar_situacao_orcamento":
{ Args: { "p_id": string,"p_observacao"?: string,"p_para": string,"p_row_version": number }; Returns: number
                           },
"mudar_situacao_tarefa_servico":
{ Args: { "p_id": string,"p_para": string,"p_row_version": number }; Returns: number
                           },
"obrigacoes_residuo":
{ Args: { "p_empreendimento_id": string }; Returns: {
              "ativa": boolean,"atualizado_em": string,"obrigacao_id": string,"observacao": string,"tipo": string
            }[]
                           },
"obter_base_de_custos":
{ Args: { "p_consultoria_id": string }; Returns: Json
                           },
"obter_contratante_da_proposta":
{ Args: { "p_id": string }; Returns: Json
                           },
"obter_identidade_da_consultoria":
{ Args: { "p_consultoria_id": string }; Returns: Json
                           },
"obter_ocorrencia":
{ Args: { "p_id": string }; Returns: {
              "ciclo": number,"codigo": string,"concluida_em": string,"concluida_por_nome": string,"concluida_sem_evidencia": boolean,"conferencia_independente": boolean,"conferente_id": string,"conferente_nome": string,"consultoria_id": string,"data_referencia": string,"empreendimento_id": string,"empreendimento_nome": string,"hoje": string,"id": string,"instrumento_id": string,"licenca": string,"meta_interna": string,"prazo_ciclo_anterior": string,"prazo_oficial_atual": string,"prazo_oficial_original": string,"responsavel_id": string,"responsavel_nome": string,"row_version": number,"situacao": Database["public"]['Enums']["situacao_ocorrencia"],"texto_literal": string,"titulo": string,"unidade_nome": string
            }[]
                           },
"obter_orcamento":
{ Args: { "p_id": string }; Returns: Json
                           },
"obter_plano_renovacao":
{ Args: { "p_instrumento_id": string }; Returns: {
              "acompanhamento_dias": number,"antecedencia_dias": number,"comprovante_caminho": string,"comprovante_nome": string,"comprovante_tamanho": number,"consultoria_id": string,"dias_limite_protocolo": number,"empreendimento_id": string,"empreendimento_nome": string,"hoje": string,"id": string,"instrumento_id": string,"licenca": string,"orgao": string,"protocolado_em": string,"protocolo_numero": string,"registrado_em": string,"registrado_por_nome": string,"row_version": number,"unidade_nome": string,"validade": string
            }[]
                           },
"obter_rascunho_configuracao_orcamento":
{ Args: { "p_consultoria_id": string }; Returns: Json
                           },
"obter_vistoria":
{ Args: { "p_id": string }; Returns: {
              "ciclo": number,"condicionante_codigo": string,"condicionante_titulo": string,"conferencia_independente": boolean,"conferente_nome": string,"consultoria_id": string,"criada_em": string,"criada_por_nome": string,"data_planejada": string,"duracao_minutos": number,"empreendimento_id": string,"empreendimento_nome": string,"enviada_em": string,"enviada_por_nome": string,"hoje": string,"hora_planejada": string,"id": string,"iniciada_em": string,"instrumento_id": string,"licenca": string,"meta_interna": string,"objetivo": string,"observacao": string,"ocorrencia_id": string,"ocorrencia_situacao": Database["public"]['Enums']["situacao_ocorrencia"],"pode_conferir": boolean,"pode_registrar": boolean,"prazo_oficial_atual": string,"responsavel_id": string,"responsavel_nome": string,"row_version": number,"situacao": Database["public"]['Enums']["situacao_vistoria"],"titulo": string,"ultima_decisao": Database["public"]['Enums']["decisao_conferencia"],"ultima_decisao_conferente_nome": string,"ultima_decisao_em": string,"ultima_decisao_motivo": string,"unidade_endereco": string,"unidade_id": string,"unidade_nome": string
            }[]
                           },
"pagar_cobranca_simulada":
{ Args: { "p_cobranca_id": string }; Returns: undefined
                           },
"painel_residuos":
{ Args: { "p_ate"?: string,"p_consultoria_id": string,"p_de"?: string,"p_empreendimento_id"?: string }; Returns: {
              "destinador_nome": string,"empreendimento_id": string,"empreendimento_nome": string,"mes": string,"mtrs": number,"quantidade": number,"residuo_codigo": string,"residuo_descricao": string,"unidade": string
            }[]
                           },
"prazos_obrigacoes_residuo":
{ Args: { "p_ate"?: string,"p_consultoria_id": string,"p_de"?: string,"p_empreendimento_id"?: string }; Returns: {
              "dias": number,"empreendimento_id": string,"empreendimento_nome": string,"inicio": string,"obrigacao_id": string,"observacao": string,"prazo": string,"referencia": string,"tipo": string
            }[]
                           },
"publicar_configuracao_orcamento":
{ Args: { "p_consultoria_id": string,"p_row_version": number }; Returns: number
                           },
"reabrir_ocorrencia":
{ Args: { "p_motivo": string,"p_ocorrencia_id": string,"p_row_version": number }; Returns: number
                           },
"recurso_liberado":
{ Args: { "p_consultoria_id": string,"p_recurso": string }; Returns: boolean
                           },
"reenviar_convite":
{ Args: { "p_convite_id": string }; Returns: string
                           },
"registrar_alvara":
{ Args: { "p_anterior_id"?: string,"p_caminho": string,"p_nome_original": string,"p_notas"?: string,"p_numero"?: string,"p_orgao"?: string,"p_sha256": string,"p_unidade_id": string,"p_validade": string,"p_versao_id": string }; Returns: string
                           },
"registrar_cdf":
{ Args: { "p_destinador_cnpj": string,"p_destinador_nome": string,"p_emitido_em": string,"p_empreendimento_id": string,"p_id": string,"p_mtrs": Json,"p_numero": string,"p_observacao"?: string,"p_periodo_fim": string,"p_periodo_inicio": string }; Returns: string
                           },
"registrar_envio_do_resumo":
{ Args: { "p_consultoria_id": string,"p_destinatarios": number,"p_mes": string }; Returns: boolean
                           },
"registrar_foto_membro":
{ Args: { "p_caminho": string,"p_membro_id": string,"p_nome_original": string,"p_sha256": string,"p_versao_id": string }; Returns: string
                           },
"registrar_item_da_vistoria":
{ Args: { "p_comentario": string,"p_item_id": string,"p_resultado": Database["public"]['Enums']["resultado_item_vistoria"] }; Returns: undefined
                           },
"registrar_logo_da_consultoria":
{ Args: { "p_caminho": string,"p_consultoria_id": string,"p_nome_original": string,"p_sha256": string,"p_versao_id": string }; Returns: string
                           },
"registrar_mtr":
{ Args: { "p_destinador_cnpj": string,"p_destinador_nome": string,"p_emitido_em": string,"p_empreendimento_id": string,"p_id": string,"p_itens": Json,"p_numero": string,"p_observacao"?: string,"p_situacao": string,"p_transportador_cnpj": string,"p_transportador_nome": string }; Returns: string
                           },
"registrar_pdf_instrumento":
{ Args: { "p_caminho": string,"p_instrumento_id": string,"p_nome_original": string,"p_sha256": string,"p_versao_id": string }; Returns: string
                           },
"registrar_protocolo":
{ Args: { "p_caminho": string,"p_data": string,"p_nome_original": string,"p_numero": string,"p_plano_id": string,"p_row_version": number,"p_sha256": string,"p_versao_id": string }; Returns: number
                           },
"registrar_tarefa":
{ Args: { "p_consultoria_id": string,"p_quantidade": number,"p_segundos": number,"p_tipo": string }; Returns: undefined
                           },
"registrar_uso":
{ Args: { "p_consultoria_id": string,"p_modulo": string }; Returns: undefined
                           },
"remover_foto_membro":
{ Args: { "p_membro_id": string }; Returns: undefined
                           },
"remover_registro_profissional":
{ Args: { "p_registro_id": string,"p_row_version": number }; Returns: undefined
                           },
"remover_logo_da_consultoria":
{ Args: { "p_consultoria_id": string }; Returns: undefined
                           },
"responder_linha_de_base":
{ Args: { "p_consultoria_id": string,"p_horas_semana_conferindo": number,"p_licencas_ativas": number,"p_minutos_por_condicionante": number,"p_surpresas_por_mes": number }; Returns: string
                           },
"restaurar_orcamento":
{ Args: { "p_id": string,"p_row_version": number }; Returns: number
                           },
"resumo_do_mes":
{ Args: { "p_consultoria_id": string,"p_mes": string }; Returns: {
              "horas_estimadas": boolean,"horas_total": number,"juntando_dados": boolean,"mes": string,"prazo_cumpridas": number,"prazo_previstas": number,"reais_centavos": number,"renovacoes_protegidas": number,"renovacoes_vencendo": number
            }[]
                           },
"resumo_dos_orcamentos":
{ Args: { "p_consultoria_id": string }; Returns: {
              "aguardando": number,"aguardando_centavos": number,"aguardando_sem_preco": number,"aprovados": number,"aprovados_centavos": number,"aprovados_sem_preco": number,"rascunhos": number
            }[]
                           },
"resumos_do_mes_pendentes":
{ Args: { "p_mes"?: string }; Returns: {
              "consultoria_id": string,"consultoria_nome": string,"horas_estimadas": boolean,"horas_total": number,"juntando_dados": boolean,"mes": string,"mes_do_resumo": string,"prazo_cumpridas": number,"prazo_previstas": number,"reais_centavos": number,"renovacoes_protegidas": number,"renovacoes_vencendo": number
            }[]
                           },
"revisar_condicionante":
{ Args: { "p_id": string,"p_revisao": Database["public"]['Enums']["revisao_condicionante"] }; Returns: undefined
                           },
"sair_do_acesso_de_suporte":
{ Args: { "p_consultoria_id": string }; Returns: undefined
                           },
"salvar_base_de_custos":
{ Args: { "p_acrescimo_km_centavos"?: number,"p_consultoria_id": string,"p_consumo_km_por_litro"?: number,"p_custo_km_centavos"?: number,"p_custos_fixos"?: Json,"p_custos_fixos_mensais_centavos": number,"p_deslocamento_modo"?: string,"p_equipe"?: Json,"p_hora_tecnica_centavos": number,"p_horas_faturaveis_mes": number,"p_horas_venda"?: Json,"p_margem_desejada_pb": number,"p_margem_minima_pb": number,"p_piso_hora_centavos"?: number,"p_preco_combustivel_centavos"?: number,"p_taxa_por_assinatura_centavos": number,"p_taxa_por_cobranca_centavos": number,"p_taxas_pb": number,"p_tributos_pb": number,"p_valor_visita_centavos"?: number }; Returns: undefined
                           },
"salvar_condicionante":
{ Args: { "p_codigo": string,"p_id": string,"p_instrumento_id": string,"p_natureza": Database["public"]['Enums']["natureza_condicionante"],"p_pai_id": string,"p_texto_literal": string,"p_titulo": string }; Returns: string
                           },
"salvar_identidade_da_consultoria":
{ Args: { "p_consultoria_id": string,"p_dados": Json,"p_row_version": number }; Returns: number
                           },
"salvar_identificacao":
{ Args: { "p_assinado_em": string,"p_emitido_em": string,"p_id": string,"p_marco": Database["public"]['Enums']["marco_instrumento"],"p_numero": string,"p_orgao": string,"p_publicado_em": string,"p_recebido_em": string,"p_row_version": number,"p_tipo_id": string,"p_unidade_id": string,"p_validade": string }; Returns: number
                           },
"salvar_modelo_de_orcamento":
{ Args: { "p_modelo_id": string,"p_nome": string,"p_orcamento_id": string }; Returns: string
                           },
"salvar_observacao_da_vistoria":
{ Args: { "p_id": string,"p_observacao": string }; Returns: undefined
                           },
"salvar_orcamento":
{ Args: { "p_dados": Json,"p_id": string,"p_row_version": number }; Returns: number
                           },
"salvar_passo_configuracao_orcamento":
{ Args: { "p_base_row_version": number,"p_consultoria_id": string,"p_dados": Json,"p_etapa": number,"p_operacao"?: string,"p_proxima_etapa": number,"p_row_version": number }; Returns: Json
                           },
"situacao_comercial":
{ Args: { "p_consultoria_id": string }; Returns: {
              "bloqueio_em": string,"ciclo": string,"ciclo_agendado": string,"cobranca_aberta_id": string,"cobranca_aberta_valor_centavos": number,"cobranca_aberta_vencimento": string,"contrato_ate": string,"convites_pendentes": number,"criada_em": string,"dias_de_teste": number,"em_atraso_desde": string,"empreendimentos": number,"fim_do_beta": string,"forma": string,"hoje": string,"interna": boolean,"mudanca_em": string,"orcamentos_liberados": boolean,"pessoas": number,"plano": string,"plano_agendado": string,"plano_contrato": string,"proximo_vencimento": string,"situacao": string,"somente_leitura": boolean,"teste_ate": string,"valida_ate": string,"vencimentos_em_aberto": Json
            }[]
                           },
"sou_operador":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"trocar_pdf_alvara":
{ Args: { "p_alvara_id": string,"p_caminho": string,"p_nome_original": string,"p_sha256": string,"p_versao_id": string }; Returns: string
                           },
"ultima_linha_de_base":
{ Args: { "p_consultoria_id": string }; Returns: {
              "respondido_em": string
            }[]
                           }
          }
          Enums: {
            "acao_auditoria": "insert"|"update"|"delete","contagem_prazo": "corridos"|"uteis","decisao_conferencia": "aprovada"|"devolvida","marco_instrumento": "emissao"|"assinatura"|"publicacao"|"recebimento","modo_etapa": "trabalho"|"espera_externa","natureza_condicionante": "obrigacao"|"agrupador"|"informacao_geral"|"condicao_continua","papel_membro": "gestao"|"equipe","recorrencia_prazo": "anual"|"semestral"|"trimestral"|"bimestral"|"mensal"|"unica"|"na_renovacao"|"continua"|"personalizada","resultado_item_vistoria": "pendente"|"conforme"|"nao_conforme"|"nao_aplicavel"|"requer_avaliacao","revisao_condicionante": "pendente"|"aceita"|"descartada","situacao_consultoria": "teste"|"ativa"|"suspensa"|"arquivada","situacao_convite": "pendente"|"aceito"|"cancelado","situacao_evidencia": "em_conferencia"|"aprovada"|"devolvida","situacao_instrumento": "rascunho"|"ativo","situacao_membro": "ativo"|"desligado","situacao_ocorrencia": "aberta"|"em_conferencia"|"concluida","situacao_orcamento": "rascunho"|"enviada"|"negociacao"|"aprovada"|"recusada","situacao_tarefa_servico": "a_fazer"|"em_andamento"|"concluida"|"cancelada","situacao_vistoria": "planejada"|"em_andamento"|"enviada"|"devolvida"|"aprovada"|"cancelada","tratamento_despesa": "incluida"|"cliente_direto"|"reembolsavel","unidade_ciclo": "mes"|"dia"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "acao_auditoria": ["insert", "update", "delete"],"contagem_prazo": ["corridos", "uteis"],"decisao_conferencia": ["aprovada", "devolvida"],"marco_instrumento": ["emissao", "assinatura", "publicacao", "recebimento"],"modo_etapa": ["trabalho", "espera_externa"],"natureza_condicionante": ["obrigacao", "agrupador", "informacao_geral", "condicao_continua"],"papel_membro": ["gestao", "equipe"],"recorrencia_prazo": ["anual", "semestral", "trimestral", "bimestral", "mensal", "unica", "na_renovacao", "continua", "personalizada"],"resultado_item_vistoria": ["pendente", "conforme", "nao_conforme", "nao_aplicavel", "requer_avaliacao"],"revisao_condicionante": ["pendente", "aceita", "descartada"],"situacao_consultoria": ["teste", "ativa", "suspensa", "arquivada"],"situacao_convite": ["pendente", "aceito", "cancelado"],"situacao_evidencia": ["em_conferencia", "aprovada", "devolvida"],"situacao_instrumento": ["rascunho", "ativo"],"situacao_membro": ["ativo", "desligado"],"situacao_ocorrencia": ["aberta", "em_conferencia", "concluida"],"situacao_orcamento": ["rascunho", "enviada", "negociacao", "aprovada", "recusada"],"situacao_tarefa_servico": ["a_fazer", "em_andamento", "concluida", "cancelada"],"situacao_vistoria": ["planejada", "em_andamento", "enviada", "devolvida", "aprovada", "cancelada"],"tratamento_despesa": ["incluida", "cliente_direto", "reembolsavel"],"unidade_ciclo": ["mes", "dia"]
          }
        }
} as const
