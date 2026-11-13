# Especificação: primeiros passos do módulo de orçamentos

Oi! Aqui é o Claude. O Eduardo quer uma **tela de configuração inicial** para quando alguém da Gestão abre Orçamentos pela primeira vez. Ele pediu que **você especifique** e **eu implemente**.

Portanto, **não escreva código nem migration**. Entregue a especificação no formato da seção 6.

Antes de começar, leia `ANDAMENTO-ORCAMENTO.md` (estado atual), `PASSAGEM-CHATGPT.md`, `CLAUDE.md` e o ADR-0019 (seções 5, 11, 13 e 14). O que for decisão de produto e não estiver decidido abaixo, **não decida sozinho**: coloque como pergunta para o Eduardo, com opções e uma recomendação.

---

## 1. O problema

Quem abre Orçamentos com a consultoria ainda sem configuração vê só "Nenhum orçamento ainda: configure custos e taxas para ter preço sugerido, depois crie o primeiro." (`PaginaOrcamentos.tsx`). Depois precisa achar sozinho:

- **Custos e taxas** (`/configuracoes/custos`), uma página longa com cinco grupos. Desde a fatia 2 do ADR-0019 ela tem a lista "Falta configurar para calcular o preço".
- **Dados da proposta** (`/configuracoes/proposta`).

No segundo teste com o painel de 20 donos (`pesquisa-personas/outputs/2026-11-12/teste-orcamentos-20-v2/`), a primeira configuração levou cerca de 59 minutos, e Custos e taxas foi o passo mais difícil para a maioria.

## 2. A ideia que levei ao Eduardo

Uma tela "Primeiros passos do orçamento", em passos curtos (um por tela, com "Voltar" e "Continuar"):

1. **Sua equipe:** quem trabalha e como recebe (CLT, pró-labore, estágio, diária, projeto), com custo e horas; já mostra a hora de custo de cada um.
2. **Contas do mês:** o total ou o detalhe, aceitando 0.
3. **Como vocês cobram:** a tabela de preços (hora, m², hectare, diária, campanha, pacote), com pelo menos uma linha.
4. **Tributos e margens:** a alíquota informada pela contabilidade (digitada, mesmo que 0) e as margens confirmadas.
5. **Sua proposta (opcional):** razão social, CNPJ, logo e texto de apresentação, com "Fazer depois".
6. **Pronto:** um resumo (custo médio por hora, contas por hora, quantos preços) e o botão "Criar o primeiro orçamento".

Cada passo usa **as mesmas regras e os mesmos campos** de Custos e taxas e de Dados da proposta, sem cálculo novo. Depois de configurado, a tela some e os ajustes continuam em Custos e taxas. A Equipe não vê orçamentos, então nada muda para ela.

## 3. Decisões do Eduardo (não reabra)

1. **Só convidar, não bloquear.** A tela aparece em destaque, mas dá para pular ("Ver orçamentos mesmo assim"). Continua valendo o P1 do ADR-0019: dá para montar orçamento sem preço calculado.
2. **Salvar a cada passo.** A pessoa pode parar e voltar outro dia sem perder o que digitou. **Isso exige mudar o banco**: hoje `salvar_base_de_custos` só aceita a configuração inteira (hora técnica, horas maiores que zero, percentuais etc.). Especifique como.
3. **Você especifica, o Claude implementa.**

## 4. O que especificar

1. **Quando a tela aparece e quando some.**
   - Quem vê (só a Gestão).
   - O que conta como "configurado".
   - Se ela volta quando a configuração fica incompleta.
   - Onde fica o atalho para reabrir.
   - O que acontece com "Ver orçamentos mesmo assim": não deve aparecer de novo a cada visita. Diga onde guardar essa escolha: no banco, por membro, ou só no navegador.
2. **Salvar a cada passo.** Proponha o modelo de dados e as RPCs:
   - **Rascunho da configuração:** tabela própria ou colunas na base atual, com estado por passo. Toda tabela nova tem `consultoria_id`, RLS forçada, FK composta, escrita só por RPC e pgTAP negativo.
   - **Promoção para a configuração "valendo":** como o rascunho vira a base usada pelo orçamento.
   - **Valor ausente nunca vira zero:** campo não informado fica nulo até a pessoa digitar.
   - **Controle de versão** com `row_version`.
   - **Auditoria**, se for entidade crítica.
   - **Convivência com Custos e taxas:** o que acontece se alguém editar Custos e taxas enquanto há um rascunho dos primeiros passos.
3. **Cada passo:** os campos, os rótulos exatos, as ajudas curtas, o que é obrigatório para "Continuar", os erros e os estados (vazio, carregando, erro, sem permissão).
   - Reaproveite os textos que já funcionaram no segundo teste. Por exemplo: "Custo da hora técnica", "Contas do mês por hora… já entra no custo", a explicação de capacidade não calculada e a ajuda da alíquota.
   - **Não invente valores de mercado, alíquota, piso ou margem recomendada.** As margens 30% e 25% vêm só "para começar" e precisam de confirmação.
4. **Passo 5 (proposta):** como ele se liga à `consultoria_identidade` atual. A logo só pode ser enviada depois dos dados salvos.
5. **Tela final e caminho para o primeiro orçamento:** o que o resumo mostra e para onde o botão leva (o diálogo de novo orçamento, por exemplo).
6. **Celular (375 px) e notebook (1366 px).**
   - Progresso visível ("Passo 2 de 6") sem depender de cor.
   - Teclado em tudo e foco no título de cada passo ao avançar.
   - Tema escuro.
   - WCAG 2.2 AA.
7. **Tempo:** onde dá para reduzir os cerca de 59 minutos sem perder correção (ex.: começar só com a equipe e uma linha de preço).

## 5. Restrições

- **As decisões já tomadas continuam valendo** (ADR-0018 §9, ADR-0019 §11):
  - sem tabela de referência por profissão;
  - sem piso;
  - cada consultoria cadastra os próprios preços;
  - o dono informa contas e tributos.
- **Regras de arquitetura:**
  - cálculo puro em `packages/domain`, com testes;
  - escrita em várias tabelas por RPC numa transação, idempotente quando puder ser repetida;
  - nada de regra só no front.
- **Interface:**
  - Fluent 2 e os tokens existentes; não invente cor;
  - corpo 14 px;
  - sem emoji.
- **Não abra a pasta irmã de pesquisa privada.**

## 6. O que você me devolve

Um único arquivo `docs/adr/0020-primeiros-passos-do-orcamento.md`, em português, com:

1. **Resumo do problema e da solução**, com o que veio do teste.
2. **Quando aparece, quando some e como reabrir.**
3. **Modelo de dados e RPCs para salvar a cada passo**, em SQL de rascunho (não é migration), com:
   - a promoção para a base "valendo";
   - nulos em vez de zero;
   - `row_version`;
   - RLS, FK composta e pgTAP, inclusive o negativo;
   - a convivência com Custos e taxas.
4. **Os seis passos,** com os rótulos exatos, as ajudas, o que é obrigatório, os erros e os estados.
5. **Celular, notebook e acessibilidade.**
6. **Fatias de implementação,** em ordem, uma por PR, cada uma com o que entra e como testar.
7. **Perguntas para o Eduardo,** com opções e a sua recomendação.

Quando terminar, avise o Eduardo que o arquivo está pronto.
