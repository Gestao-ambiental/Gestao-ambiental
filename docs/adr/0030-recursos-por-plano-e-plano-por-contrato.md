# ADR-0030: Recursos por plano e plano por contrato

- **Situação:** aceito em 14/11/2026, como protótipo funcional. O Cadu revisa.
- **Pedido do Eduardo:** cada plano com as suas funcionalidades, ligadas de forma automática, e a central entendendo isso. As decisões abaixo seguem as recomendações que o Eduardo aprovou.
- **Arquivos:**
  - migration `20261114230000_recursos_e_plano_por_contrato.sql`;
  - teste `supabase/tests/490_recursos_e_plano_por_contrato.test.sql`;
  - domínio `packages/domain/src/planos.ts` (`recursoLiberado`, ramo `contrato`), com teste em `recursos-do-plano.test.ts`.

## Decisão

### 1. Recursos por plano

Orçamentos e IA continuam como colunas do catálogo. Os outros recursos viram uma lista no próprio catálogo (`private.plano_catalogo.recursos`):

| Recurso                                        | Essencial | Equipe | Escala |
| ---------------------------------------------- | --------- | ------ | ------ |
| Orçamentos, aprovação e tarefas                | não       | sim    | sim    |
| Leitura da licença por IA                      | não       | sim    | sim    |
| Capacidade e carga da equipe (`capacidade`)    | não       | sim    | sim    |
| Integração com o MTR do IMA (`integracao_ima`) | não       | não    | sim    |
| Financeiro da consultoria (`financeiro`)       | não       | não    | sim    |
| Análise de lotes (`analise_lotes`)             | não       | não    | sim    |

**Como muda.** A central liga e desliga cada recurso em Parâmetros, com motivo e histórico (`central_definir_recursos_do_plano`). O `catalogo_comercial()` devolve a lista, e a página "Plano e cobrança" mostra o que cada plano inclui.

**Como o banco barra.** A barreira comercial de escrita (`private.bloquear_escrita_comercial`) já aceitava `orcamentos` como 2º argumento e agora aceita o nome de qualquer recurso. Tabela de recurso fora do plano recusa escrita com `recurso_fora_do_plano`. A regra é `private.recurso_liberado`, espelhada por `recursoLiberado` no domínio:

- teste, beta e conta interna liberam tudo;
- só leitura não libera nada;
- nos outros casos, vale o plano vigente.

**Recursos que ainda não existem já nascem presos.** Quando a tabela de um recurso for criada, a trigger dela recebe o nome do recurso. O teste 020 deve passar a exigir isso nessas tabelas.

**IA.** A chave existe no catálogo e aparece na tela. O bloqueio dentro da extração por IA fica com o Cadu, porque não mexemos na função de IA.

### 2. Plano por contrato

A central põe uma consultoria num plano sem cobrança pelo Grama. Serve para contrato fechado por fora, cortesia ou desconto negociado. A RPC é `central_definir_plano_contrato`, e as regras são:

- **Prazo:** vale até uma data ou sem prazo. A data não pode estar no passado.
- **Registro:** motivo obrigatório e histórico (tipo `plano_contrato`).
- **Encerrar:** passar plano nulo.
- **Conflito de edição:** a mudança respeita o `row_version` da condição comercial.

Enquanto o contrato vale, a situação calculada é **`contrato`**:

- **Limites e recursos:** os do plano. Passar do limite continua pedindo a confirmação do adicional.
- **Cobrança e atraso:** não há cobrança nem bloqueio por atraso. Cobrança em aberto é ignorada, porque o dinheiro não passa pelo Grama.
- **Ordem:** a conta interna vem antes do contrato, e o contrato vem antes do beta e da assinatura.
- **Assinar pelo app:** assinar ou trocar de plano é recusado (`plano_por_contrato`, por uma trigger em `assinatura`). A página "Plano e cobrança" esconde a escolha de plano.

Depois da data, valem as regras de sempre: assinatura, teste encerrado ou só leitura.

**Na central:**

- o detalhe da consultoria tem "Definir plano por contrato" e "Encerrar contrato";
- o Financeiro tem o cartão e o grupo "Por contrato", fora do MRR.

## Fora desta decisão

- Integração real com o Asaas (depende do CNPJ).
- Bloqueio da IA no Essencial dentro da função de IA (fica com o Cadu).
- Esconder no menu os recursos fora do plano: os recursos novos ainda não têm tela. Quando tiverem, a tela usa `recursoLiberado`.
