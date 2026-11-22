# ADR-0037: Conferência do relatório por IA antes da Gestão

- **Situação:** aceito em 19/11/2026, a pedido do Eduardo. O Kadu revisa.
- **Parte de:** ADR-0036 (modelos de documento, relatório em .docx e conferência por IA), fatia 3. A ADR-0036 está na `camada/modelos-de-documento`.
- **Depende de:** `camada/vistoria-geral` (plano com IA e cota da extração). Leve as duas juntas.

## Contexto

Quando a pessoa anexa o relatório para a Gestão conferir, o Eduardo quer que uma IA confira antes. Ela deve olhar a consistência, os dados do empreendimento e da licença, as condicionantes citadas, as datas e os erros. O resultado aparece para quem enviou e para quem confere.

## Decisão

- **A evidência aceita .docx** (no bucket, em `enviar_evidencia` e na tela), para a Gestão corrigir no Word. O comprovante de protocolo continua só com PDF, PNG e JPEG.
- **Tabela `conferencia_ia`:** uma conferência viva por versão de evidência. As que falharam ficam como histórico, e dá para tentar de novo. Todo membro ativo lê. Grava só pela RPC `iniciar_conferencia_ia` e, depois, pela service role. Tem auditoria e as travas de suporte e de só leitura.
- **Quem pede:** quem enviou, o conferente designado ou a Gestão. A tela dispara sozinha para quem enviou. Repetir só devolve a situação.
- **Onde roda:** na Edge Function `conferir-relatorio`, no mesmo molde da `extrair-licenca` (orquestração testável em `_shared/conferir-relatorio.ts`, regras puras em `_shared/conferencia.ts`).
  1. Lê o texto do PDF (unpdf) ou do .docx (fflate + `word/document.xml`).
  2. Roda as **regras fixas**, sem IA: campo do modelo sem preencher, CNPJ diferente do cadastro e data depois de hoje. Elas valem mesmo quando a IA não roda.
  3. Reserva a cota e chama o OpenRouter (`gpt-4.1-mini`, saída por schema, provedores sem coleta de dados) com o contexto do cadastro, montado pelo banco em `iniciar_conferencia_ia`.
- **O que a IA confere:** empreendimento, licença, condicionante, datas, consistência e escrita. Cada apontamento traz a gravidade (corrigir ou verificar), o trecho, o problema e a sugestão. O texto do relatório entra no prompt como dado, não como instrução.
- **Cota somada:** `private.uso_de_ia` conta as reservas da extração e da conferência. As duas usam os limites de `private.limite_extracao_ia`, e `reservar_extracao_ia` passa a contar as conferências também.
- **Não bloqueia:** a IA só aponta. Aprovar ou devolver continua com a Gestão.
- **Sem IA no plano** (Essencial), só as regras fixas rodam, e a conferência fica "não conferido pela IA: o plano não inclui IA". Imagem não é conferida.

## Consequências

- A migration foi criada pela CLI e renomeada para `20261119600000`, para vir depois das migrations da `vistoria-geral` das quais depende.
- O CI checa os tipos de `conferir-relatorio/index.ts`; o deploy já publica todas as funções.
- Falta confirmar com o Kadu se o envio do texto do relatório ao provedor entra no aviso de privacidade. É o mesmo tratamento que a licença já recebe.
- **Mudou na ADR-0061:** a IA só é chamada depois que a Gestão liga a conferência (Configurações › IA); sem isso, só as regras fixas rodam (`ia_nao_autorizada`). CPF, e-mail e telefone vão mascarados.
