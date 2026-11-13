# Andamento do módulo de orçamentos

**Leia isto primeiro, depois `PASSAGEM-CHATGPT.md`.** Este arquivo diz o que já foi feito, o que está pela metade e o que falta. O Claude atualiza a cada passo; quem assumir continua atualizando do mesmo jeito.

- **Última atualização:** 13/11/2026, pelo Claude, ao juntar os primeiros passos na `branch-do-duds` local.
- **Pasta:** `C:\Users\eduka\Documents\Codex\2026-11-06\https-github-com-gestao-ambiental-gestao\work\Gestao-ambiental-orcamentos`.
- **Branch de trabalho:** `branch-do-duds`, só local. É a branch principal do Eduardo: as funções novas entram nela, nunca na `main`.
  - Foi criada a partir da `main` do `origin` (`c2813c1`), sem acompanhar a `main`, e recebeu a `feature/primeiros-passos-orcamento` por merge.
  - A `feature/primeiros-passos-orcamento` tem o commit `2e1c670` (primeiros passos e fatias 2 e 3 do ADR-0019) em cima da `local/orcamentos-fluent`, que continua no `06e079a`.
  - **Sem push e sem PR, por enquanto.** O GitHub recusou criar a `branch-do-duds` no `origin` (erro 403): a conta `edukarnopp3` não tem escrita no `Gestao-ambiental/Gestao-ambiental`. O Eduardo vai pedir acesso; até lá, tudo fica local. O `gh` também não está logado nesta máquina.
  - Commit só quando o Eduardo pedir.
- **Fluxo de branches** (combinado em 13/11/2026):
  - uma branch por função nova, criada a partir da `branch-do-duds`;
  - a função entra na `branch-do-duds` (hoje por merge local; com acesso, por PR no `origin`), nunca na `main`.
  - Com acesso: criar a `branch-do-duds` no `origin`, enviar as branches e abrir os PRs para ela. O envio leva os 20 commits do módulo de orçamentos que nunca saíram desta máquina, inclusive os valores da simulação da Envora em testes e documentos; o Eduardo autorizou enviar assim.

## 1. Onde estamos

| Etapa | Situação |
|---|---|
| ADR-0018, fatias 2 a 6 (unidades, remuneração, faixas e mínimo, modelos e duplicar, situação e proposta) | **Feito e commitado** em `1afce02` |
| Correções de celular depois da revisão a 375 px | Feito e commitado (commit "feat: textos e leitura do orçamento", logo depois de `1afce02`) |
| Textos do segundo teste com os 20 donos | Feito e commitado (mesmo commit) |
| ADR-0019 (usabilidade), escrito pelo ChatGPT, com as respostas do Eduardo na seção 11 | Feito e commitado (mesmo commit) |
| ADR-0019, fatia 1: textos e leitura | Feito e commitado (mesmo commit; seção 3) |
| ADR-0019, fatia 2: primeira configuração | Feito e commitado em `2e1c670` (seção 3b) |
| ADR-0019, fatia 3: cartões no celular e tabela do notebook | Feito e commitado em `2e1c670` (seção 3c) |
| ADR-0019, fatias 4 a 6 | A fazer: a próxima é a **fatia 4, ART/RRT** (seção 4) |
| Primeiros passos do orçamento (tela de configuração inicial) | Feito e commitado em `2e1c670`, já na `branch-do-duds` local: ADR-0020 §8 e seção 4b. As escolhas do ADR-0020 §8.3 foram confirmadas pelo Eduardo; falta o job `banco` do CI |

## 2. O que entrou no último commit

Tudo abaixo foi commitado junto com a fatia 1. Se `git status` mostrar mudanças novas, elas são de depois: confira o diff antes de mexer.

1. **Correções de celular:**
   - **ART/RRT:** a lista abaixo de cada serviço perdeu a palavra "Registro" e ocupa a largura da coluna.
   - **Faixas:** o editor de faixas fica preso à esquerda (`sticky left-0`) dentro da tabela que rola.
   - **Avisos:** o link "Abrir empreendimento" só aparece no aviso de prospecto cadastrado (`Aviso.comLinkDoEmpreendimento` em `PaginaOrcamento.tsx`).
   - **Observação:** o campo ao mudar a situação tem 3 linhas.
   - **Proposta:** o cartão tem margem interna menor a 375 px.
2. **Textos do segundo teste** (`PaginaCustosETaxas.tsx`, `PaginaOrcamento.tsx`, `DialogosDeCopia.tsx`):
   - "Custo da hora técnica (R$)";
   - "Custo médio por hora da equipe";
   - "Custo por hora de {profissão}";
   - "Digitar o custo da hora e as horas";
   - "Contas do mês por hora: R$ X por hora. Já entra no custo de cada serviço do orçamento, pelas horas dele.";
   - aviso de quem não tem dias ou horas no mês;
   - ajuda da alíquota;
   - ajuda da taxa por documento assinado;
   - exemplo de horas no mês;
   - dica das contas do mês;
   - "(jornada não informada em Custos e taxas)" no responsável;
   - no duplicar, "as estimativas das despesas, que não voltam a cotar".
3. **Testes atualizados** com os rótulos novos: `orcamentos.test.tsx`.
4. **Documentos:**
   - `docs/adr/0019-usabilidade-do-orcamento.md`;
   - `PROMPT-CHATGPT-USABILIDADE-ORCAMENTO.md`;
   - este arquivo.

Na última verificação, antes da fatia 1, tudo estava verde: lint, tipos, 645 testes do domínio, 202 da web, build e todas as baterias pgTAP.

## 3. Fatia 1 do ADR-0019: textos e leitura (feita e commitada)

**Escopo:** ADR-0019 §9, item 1; a tabela da §3 (itens pequenos); o Anexo A (§7), itens "agora" que são só texto. **Sem regra nova e sem migration.**

Marque `[x]` ao terminar cada item.

- [x] **Capacidade não calculada (Custos e taxas, equipe).** Tirar o aviso da coluna "Hora de custo" e pôr embaixo do próprio campo, ligado pelo `aria-describedby`. Textos:
  - diária: "Dias no mês não informados; capacidade não calculada. Fica fora da média e do rateio; a hora de custo continua válida.";
  - projeto ou mensal sem horas: o mesmo, começando por "Horas no mês não informadas".

  O campo é montado pela função `numero(...)` dentro de `Equipe` em `PaginaCustosETaxas.tsx`. O teste "cadastra a tabela de horas e a equipe dizendo como cada pessoa recebe" procura `/Sem dias no mês/`: atualizar.
- [x] **Texto da equipe:** "Horas no mês são a jornada real: por exemplo, 40 h por semana ≈ 173 h por mês. Use o mês que deseja estimar e atualize quando souber. Para o sócio, as horas que ele de fato trabalha na consultoria." (Patrícia).
- [x] **Tributos:** ajuda "Peça à contabilidade a alíquota efetiva; imposto pago ÷ faturamento é só uma aproximação, e ela varia por período e regime".
- [x] **Margens:** texto curto no grupo: "Desejada: meta usada no cálculo pela margem. Mínima: referência de alerta, não bloqueia. Que sobra: resultado estimado depois de custos, tributos e taxas." Mais o aviso (não bloqueio) quando a desejada estiver abaixo da mínima (Paulo).
- [x] **Acréscimo (Preço e margem, forma "Pela margem"):** explicar a base: "Sobre o que incide: a venda dos serviços que recebem acréscimo mais as contas atribuídas a eles; pacotes fechados ficam de fora." Exemplo fictício: "base R$ 1.000, acréscimo 20% = R$ 200, preço R$ 1.200 antes de tributos e taxas. É acréscimo sobre a base, não margem de 20% sobre a venda."
- [x] **Histórico da situação** (`SituacaoDoOrcamento.tsx`): passar de `text-xs` para o corpo de 14 px (Edgar).
- [x] **Reabrir:** (feito o texto da confirmação; o botão continua na fila "Mudar situação", junto dos outros)
  - confirmação: "Volta a rascunho como revisão N, para editar. O histórico guarda quando foi reaberta." Não diga que a proposta anterior fica guardada: hoje o sistema **não** guarda o conteúdo da revisão anterior, só o histórico da situação;
  - botão visível perto da situação (Tainá).
- [x] **Duplicar:** acrescentar "O mês não é copiado; escolha o mês para calcular a carga. Só orçamentos aprovados contam como comprometidos." (Antônio).
- [x] **Objeto:** ajuda no campo "O que está sendo orçado" ou no recolhível do objeto: "Descreva o escopo; se quiser, cite a metodologia e a legislação aplicável (confira a fonte)." (Antônio). Não gerar citação automática.
- [x] **"Empreendimento ou propriedade":** (ajuda "Empresa, obra ou propriedade rural já cadastrada no Grama." na opção "Empreendimento cadastrado" do novo orçamento) ajuda no novo orçamento (`PaginaOrcamentos.tsx`) onde couber, sem renomear a entidade (Gilmara).
- [x] **Proposta pronta:** ("Inclui ART/RRT" em `corpo-medio`; objeto e total já tinham 14 px ou mais) "Inclui ART/RRT" com mais destaque, por exemplo `corpo-medio` em vez de texto apagado (Fernanda). Conferir que objeto e total estão com corpo de pelo menos 14 px (Edgar, Beatriz).
- [x] **Dados da proposta:** ("Salve os dados abaixo para habilitar o envio da logo.") junto do logo, "Salve os dados para habilitar o envio" (já existe um texto parecido; conferir).
- [x] **Testes:** (capacidade conferida por `toHaveAccessibleDescription`; teste novo "avisa quando a margem desejada fica abaixo da mínima, sem bloquear")
  - atualizar `orcamentos.test.tsx` onde os rótulos mudaram;
  - um teste para o aviso de margem desejada abaixo da mínima;
  - um teste de que o aviso de capacidade está ligado ao campo pelo `aria-describedby`.
- [x] **Verificação** (seção 6) e **revisão no Brave a 375 px**, claro e escuro (`ferramentas-locais/telas/`).
- [x] **Atualizar este arquivo e acrescentar ao ADR-0019** a seção "12. Implementado: fatia 1".

Ficaram de fora da fatia 1 (vão em outras fatias):
- "Ver cálculo" da hora de custo (Marcos);
- resultado da equipe em cartões (Beatriz);
- lista de pendências da configuração (fatia 2);
- cartões (fatia 3);
- ART/RRT (fatia 4);
- situação mais leve (fatia 5).

## 3b. Fatia 2 do ADR-0019: primeira configuração (feita, sem commit)

**Escopo:** ADR-0019 §5, §3 e §11 (P1, P2 e P3). **Tudo em `PaginaCustosETaxas.tsx`**, sem migration: a base continua salva inteira pela RPC de sempre. Como o rascunho já podia ser criado sem base, P1 vira mostrar o que falta.

Marque `[x]` ao terminar cada item.

- [x] **Lista "Falta configurar para calcular o preço"** no topo, no lugar do aviso "Ainda não configurado". Cada item diz "Feito" ou "Falta" em texto (não só cor) e leva ao grupo:
  - custo da equipe (equipe com hora calculada, ou custo da hora digitado);
  - horas faturáveis (maior que zero);
  - contas do mês (valor digitado, inclusive 0 quando a pessoa digita 0);
  - tabela de preços (pelo menos uma linha válida);
  - tributos (campo preenchido, mesmo que 0);
  - margens confirmadas.

  Com tudo feito, mostra "Tudo pronto para calcular o preço".
- [x] **Nova ordem dos grupos:** Custos e capacidade (equipe, horas e contas), Tabela de preços, Tributos e taxas, Margens, Visita técnica e deslocamento. Cada grupo ganha um `id` para os links.
- [x] **"Calcular pela equipe" em destaque (P2):** botão no lugar do link, com o texto "Recomendado: a hora de custo de cada pessoa sai de como ela recebe". A entrada manual continua; a troca já preservava os valores (`voltarADigitar`).
- [x] **"Ver cálculo" da hora de custo** (Marcos): recolhível na linha da pessoa, por exemplo "13.751,77 ÷ 173 h = 79,49"; na diária e no projeto, o divisor certo.
- [x] **Resultado da equipe em cartões** (Beatriz), com os mesmos textos de antes, para os testes continuarem achando.
- [x] **Confirmar os valores pré-preenchidos (P3):**
  - base nova: margens 30% e 25% vêm preenchidas; caixa "Confirmo que estas margens são da minha consultoria", ou mudar o valor conta como confirmação;
  - salvar sem tributos vira erro: "Informe os tributos sobre o faturamento (se não paga, digite 0)". Antes, vazio virava 0 em silêncio.
- [x] **Testes:** a lista de pendências; o erro de tributos vazio; a confirmação das margens; "Ver cálculo". Ajustar os testes antigos que salvam uma base nova sem tributos ou sem confirmar as margens.
- [x] **Verificação** (seção 6), **Brave a 375 px e 1366 px** (claro e escuro) e **ADR-0019 §13**.

## 3c. Fatia 3 do ADR-0019: cartões no celular (feita, sem commit)

**Escopo:** ADR-0019 §4. Só tela, em `PaginaOrcamento.tsx`, sem cálculo novo.

**Como:** os campos de cada serviço saem para uma função `camposDoItem(item, indice)` dentro de `Editor`. A tabela (notebook) e os cartões (celular) usam os mesmos campos e o mesmo estado. O hook `useTelaEstreita()` usa `matchMedia('(max-width: 639px)')`; sem `matchMedia` (testes no jsdom), fica a tabela. Por isso os testes antigos não mudam: os mesmos rótulos nunca aparecem duas vezes na tela.

Marque `[x]` ao terminar cada item.

- [x] Extrair `camposDoItem` e fazer a tabela usar os campos (sem mudar o comportamento).
- [x] Renomear a coluna "Hora de venda" para "Tabela de preços".
- [x] **Cartão fechado:** número e nome do serviço, unidade e quantidade, preço e estado ("Faltam horas", "Escolha o preço", "Falta quantidade", "Falta preço fechado" ou "Completo"). Botões "Editar serviço N" (com `aria-expanded` e `aria-controls`) e "Remover serviço N".
- [x] **Cartão aberto,** nesta ordem: Serviço, Tabela de preços (com quantidade ou preço fechado), Horas estimadas, Responsável e Mês previsto (com carga), Outros custos, ART/RRT, Custo e Preço. Cada campo tem rótulo visível.
- [x] **Adicionar item no celular:** o cartão novo abre e o foco vai para o nome.
- [x] **Teste:** com `matchMedia` simulado em 375 px, aparecem os cartões (fechado, abre, edita horas, remove).
- [x] Verificação, Brave a 375 px e 1366 px (claro e escuro), ADR-0019 §14 e este arquivo.
- [x] **Notebook:** outros custos e ART/RRT recolhidos em "Detalhes do serviço", embaixo do nome, com resumo do que há dentro ("Detalhes: outros custos 240,00 · com ART"). A coluna "Outros custos" saiu da tabela. As larguras foram estreitadas (Horas w-20, Tabela w-44, Responsável w-44, Mês w-36, Custo e Preço w-28) e "Serviço" tem no mínimo `min-w-56`. A 1366 px, o nome cabe e o mês aparece inteiro.

## 4. Próximas fatias (ADR-0019 §9 e §11)

As respostas do Eduardo estão no ADR-0019, seção 11; todas seguem a recomendação.

2. **Primeira configuração:**
   - o rascunho pode ser criado sem base completa;
   - lista "Falta configurar para calcular o preço" no topo de Custos e taxas;
   - grupos reordenados (equipe e custo, horas e contas, preços, tributos e taxas, margens, visitas);
   - os valores que já vêm preenchidos pedem confirmação.

   Nada vira zero presumido: se precisar mudar validação, passa por domínio, RPC e pgTAP.
   Também cabem aqui:
   - "Calcular pela equipe" em destaque (P2);
   - "Ver cálculo" da hora de custo;
   - resultado da equipe em cartões.
3. **Cartões no celular** (ADR-0019 §4): a mesma fonte de estado e as mesmas regras, sem cálculo novo. No notebook, os detalhes do serviço ficam recolhíveis. A coluna "Hora de venda" passa a se chamar "Tabela de preços".
4. **ART/RRT** (ADR-0019 §2): seção única "Responsabilidade técnica (ART/RRT)".
   - Tabelas `orcamento_responsabilidade` e `orcamento_responsabilidade_item`, com RLS forçada, FK composta, RPC e pgTAP negativo.
   - A taxa liga-se a uma despesa e é cobrada uma vez só.
   - Número opcional, que aparece na proposta só se informado e escolhido para divulgação.
   - Migrar `orcamento_item.responsabilidade_tecnica` sem agrupar sozinho.
   - Duplicar e modelo levam os registros.
   - Depois disso, tirar a lista por serviço.
5. **Situação:** ação rápida sem confirmação só para "Em negociação" (P6), mantendo histórico e versão.
6. **Salvamento automático:** só depois de um projeto de segurança próprio (P11). Não é para agora.

O que ficou para depois e o que nunca entra está no ADR-0019, §8 (Anexo B), e no ADR-0018. Exemplos de "depois": unidades de nicho, envio por e-mail ou WhatsApp, exportar para Excel, contrato recorrente.

## 4b. Primeiros passos do orçamento (feito e commitado, só local)

**Estado em 13/11/2026:** o Codex especificou (ADR-0020 §1 a §6) e começou o banco. O Claude revisou, corrigiu e implementou a tela; está tudo no ADR-0020 §8.

- **Onde está:**
  - rota `/orcamentos/primeiros-passos` (`PaginaPrimeirosPassos.tsx`);
  - convite e atalho em `PaginaOrcamentos.tsx`;
  - peças compartilhadas com Custos e taxas em `PecasDaBase.tsx` e `campos-da-base.ts`;
  - banco em `20261113140336_rascunho_primeiros_passos_orcamento.sql` (pgTAP `290`);
  - domínio em `primeiros-passos-orcamento.ts`;
  - API em `lib/api/primeiros-passos.ts`.
- **Na demo:** `http://localhost:5199/orcamentos?base=vazia` simula a consultoria sem base. Sem `?base=vazia`, a demo começa com a base da Envora, e os primeiros passos partem dos valores dela.
- **Escolhas do ADR-0020 §8.3:** confirmadas pelo Eduardo em 13/11/2026.
- **Falta:**
  - o job `banco` do CI;
  - o teste com duas sessões ao mesmo tempo;
  - a conferência visual dos passos 2 a 5 a 375 px e do tema escuro a 1366 px.
- **Não aplicar a migration em banco remoto** antes de o Eduardo revisar.

O pedido original (histórico):

**Pedido do Eduardo (13/11/2026):** uma tela de configuração inicial para quando a Gestão abre Orçamentos pela primeira vez.

- **Passos propostos pelo Claude:**
  1. equipe e como recebe;
  2. contas do mês;
  3. como vocês cobram (tabela de preços);
  4. tributos e margens confirmadas;
  5. dados da proposta (opcional);
  6. resumo e "Criar o primeiro orçamento".
- **Decisões do Eduardo:**
  - **só convidar**, sem bloquear a lista;
  - **salvar a cada passo**, o que exige migration, porque hoje a base só é salva inteira;
  - **o ChatGPT especifica** e o Claude implementa.
- **Prompt:** `PROMPT-CHATGPT-PRIMEIROS-PASSOS.md`. **Entrega esperada:** `docs/adr/0020-primeiros-passos-do-orcamento.md`.
- **Ordem com a fatia 4 (ART/RRT):** quem vem primeiro é decisão do Eduardo; ainda não foi perguntado.

## 5. Ferramentas locais (fora do git)

A pasta `ferramentas-locais/` está no `.git/info/exclude`.

- **Testes do banco sem Docker (PGlite + pgTAP):**
  - todos: `node ferramentas-locais/pg/rodar.mjs .`
  - um teste: `node ferramentas-locais/pg/rodar.mjs . 280`

  Ele aplica todas as migrations num Postgres em memória e roda `supabase/tests`. Não substitui o job `banco` do CI no Supabase de verdade, que **ainda não rodou** para as fatias 2 a 6.
- **Consultar o esquema:** `node ferramentas-locais/pg/esquema.mjs . "select ..."`
- **Capturas de tela no Brave** (sem janela, 375×812, claro e escuro):
  - com a demo rodando (seção 6), `node ferramentas-locais/telas/capturar.mjs` (ou `capturar2.mjs`, `capturar3.mjs`);
  - as imagens vão para `ferramentas-locais/telas/capturas/`;
  - `capturar4.mjs [desktop]` mostra a fatia 2: a lista de pendências, os cartões e o "Ver cálculo";
  - `capturar5.mjs` mostra a fatia 3: os cartões dos serviços a 375 px e a tabela a 1366 px.

  A demo guarda os dados na memória da página: recarregar apaga o que foi salvo. Por isso os scripts navegam sem recarregar.
- **Painel de 20 donos:** `pesquisa-personas/`, fora do git. O segundo teste está em `outputs/2026-11-12/teste-orcamentos-20-v2/` (`sintese.md`, `results.json`, `roteiro.md`).

## 6. Como verificar antes de dizer que terminou

Rode da raiz da pasta:

```
./node_modules/.bin/pnpm exec prettier --check <arquivos alterados>
./node_modules/.bin/pnpm exec eslint . --ignore-pattern "apps/web/demo-local/**" --ignore-pattern "pesquisa-personas/**" --ignore-pattern "ferramentas-locais/**"
./node_modules/.bin/pnpm typecheck
./node_modules/.bin/pnpm test
./node_modules/.bin/pnpm --dir apps/web build
node ferramentas-locais/pg/rodar.mjs .
```

**Demo local** (porta 5199):

```
./node_modules/.bin/pnpm --dir apps/web exec vite --config demo-local/vite.demo.config.ts
```

Para mostrar ao Eduardo, abra no **Brave**, nunca em outro navegador:

```
& "C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe" http://localhost:5199/configuracoes/custos
```

Ao mudar uma RPC, a demo (`apps/web/demo-local/supabase-demo.ts`) precisa imitar a regra nova.

## 7. Cuidados que já custaram tempo

- **PowerShell `Set-Content`** corrompe UTF-8. Para editar arquivos, use um editor ou Python com `encoding='utf-8'` e `newline='\n'`.
- **Nome acessível com texto oculto:** escreva `{' '}<span className="sr-only">…</span>`. Um espaço só dentro do `sr-only` some no nome acessível ("Usar faixasde…").
- **`getByText` do Testing Library** lê só o texto do próprio elemento. Um número seguido de `sr-only` continua achável pelo número sozinho.
- **Toda tabela auditada precisa de coluna `id`**: o gatilho `private.auditar` usa o `id` como `entidade_id`.
- **Histórico na mesma transação:** use `clock_timestamp()`, e não `now()`, para manter a ordem.
- **O CNPJ pode ser alfanumérico** (regra nova de 2026). O check é `^[0-9A-Z]{12}[0-9]{2}$`, igual a `private.cnpj_valido`.
- **Regras do Eduardo:**
  - nunca inventar valores de mercado, alíquota, piso ou tabela por profissão;
  - dados reais da Envora só em `apps/web/demo-local/`;
  - não abrir a pasta irmã de pesquisa privada.

## 8. Registro do que foi feito (mais recente em cima)

- **13/11/2026, Claude, branches:**
  - commit `2e1c670` na `feature/primeiros-passos-orcamento`;
  - o envio ao `origin` foi recusado (403, sem permissão de escrita) e o Eduardo pediu para fazer tudo local por enquanto;
  - criada a `branch-do-duds` local a partir da `main` do `origin`, com a função juntada por merge.
- **13/11/2026, Eduardo:** confirmou as oito escolhas de implementação dos primeiros passos (ADR-0020 §8.3).
- **13/11/2026, Claude, primeiros passos (sem commit, branch `feature/primeiros-passos-orcamento`):**
  - **Revisão do Codex:** nove problemas no banco, corrigidos na mesma migration, que ainda não tinha sido aplicada fora do PGlite (ADR-0020 §8.1). Por exemplo:
    - `horas_divergentes` travava a publicação com equipe;
    - a base nova exigia visita e km, que nenhum passo pedia;
    - faltava o custo da hora digitado;
    - qualquer JSON era aceito;
    - depois de um conflito, não havia como recomeçar.
  - **Banco:** RPCs de leitura, salvar passo, descartar, dispensar e publicar; pendências iguais no SQL e no domínio; `obter_base_de_custos` passou a devolver `row_version`.
  - **Tela:**
    - seis passos com as peças de Custos e taxas (extraídas para `PecasDaBase.tsx` e `campos-da-base.ts`, sem mudar Custos e taxas);
    - passo 5 com o formulário de Dados da proposta (agora exportado como `DadosDaProposta`);
    - convite na lista e `?novo=1` para abrir o novo orçamento;
    - aviso ao sair com mudança não salva;
    - o atalho ACEAMB não aparece nos primeiros passos.
  - **Mensagens novas** em `erros.ts`: `base_alterada`, `configuracao_incompleta`, `dados_invalidos` e `operacao_invalida`. Entraram também `contas_invalidas` e `horas_de_venda_invalidas`, que já existiam no banco sem texto na tela.
  - **Demo:** imita as RPCs novas e aceita `?base=vazia`.
  - **Verificação:**
    - pgTAP `290`: 62 verificações; suíte completa de banco no PGlite verde;
    - 678 testes do domínio e 218 da web (12 novos, com axe); typecheck, ESLint e build verdes;
    - demo conferida no painel do app a 1366 px (claro) e a 375 px (escuro), da lista até o diálogo de novo orçamento.
  - **Aviso de formatação:** o Prettier acusa `ANDAMENTO-ORCAMENTO.md` e o ADR-0019, mas os dois já falhavam antes, no commit `06e079a`.
- **13/11/2026, Claude:** proposta da tela de primeiros passos; o Eduardo decidiu só convidar, salvar a cada passo e o ChatGPT especificar. Prompt escrito (seção 4b).
- **13/11/2026, Claude, ajuste do notebook (fecha a fatia 3, sem commit):**
  - na tabela de serviços, outros custos e ART/RRT foram para um `<details>` "Detalhes do serviço" na célula do nome, com resumo (`resumoDosDetalhes`);
  - a coluna "Outros custos" saiu e as larguras foram estreitadas;
  - teste novo "no notebook, outros custos e ART ficam recolhidos…";
  - **verificação:** lint, tipos, 645 testes do domínio, 206 da web e build verdes; Brave a 375 px e 1366 px, claro e escuro, sem rolagem lateral;
  - o servidor da demo tinha caído (código 4) quando a sessão foi interrompida; foi religado.
- **12/11/2026, Claude, fatia 3 do ADR-0019 terminada (sem commit):**
  - `camposDoItem` passou a montar os campos do serviço, usados pela tabela e pelos cartões;
  - `ServicosEmCartoes`, `CampoDoCartao`, `estadoDoServico` e `useTelaEstreita`, em `PaginaOrcamento.tsx`;
  - a coluna "Hora de venda" virou "Tabela de preços";
  - foco no nome do serviço novo, via `useRef` + `useEffect` em `r.itens`. Não use `setState` dentro de efeito: o lint barra;
  - teste novo "no celular (375 px)…", com `matchMedia` simulado por `Object.defineProperty`;
  - **verificação:** lint, tipos, 645 testes do domínio, 205 da web e build verdes; Brave a 375 px e 1366 px, claro e escuro, sem rolagem lateral (`ferramentas-locais/telas/capturar5.mjs`).
- **12/11/2026, Claude, fatia 2 do ADR-0019 terminada (sem commit):** tudo em `PaginaCustosETaxas.tsx`, sem migration.
  - lista "Falta configurar para calcular o preço" no lugar de "Ainda não configurado";
  - grupos reordenados, com âncoras `grupo-custos`, `grupo-precos`, `grupo-tributos`, `grupo-margens` e `grupo-visitas`;
  - botão "Calcular pela equipe" com o texto de recomendado;
  - "Ver cálculo" da hora de custo;
  - resultado da equipe em cartões;
  - confirmação das margens na base nova;
  - erro ao salvar com tributos vazios.
  - **Testes:** helper `confirmarBaseNova` nos testes que salvam uma base nova; teste novo da lista e dos erros.
  - **Verificação:** lint, tipos, 645 testes do domínio, 204 da web, build e pgTAP verdes. Brave a 375 px e 1366 px, claro e escuro (`ferramentas-locais/telas/capturar4.mjs`).
- **12/11/2026, Claude:** commit "feat: textos e leitura do orçamento", com a fatia 1, os textos do segundo teste, as correções de celular, o ADR-0019 e os documentos de passagem.
- **12/11/2026, Claude, fatia 1 do ADR-0019 terminada:**
  - **Custos e taxas:**
    - aviso de capacidade não calculada embaixo do campo, com `aria-describedby`;
    - o campo não é mais recriado quando o aviso aparece ou some (a digitação se perdia);
    - texto da equipe;
    - ajuda de tributos;
    - explicação das margens e aviso de desejada abaixo da mínima.
  - **Orçamento:**
    - exemplo fictício do acréscimo;
    - ajuda do objeto;
    - histórico em 14 px;
    - texto do reabrir;
    - mês e carga no duplicar.
  - **Proposta e telas ligadas:** "Inclui ART/RRT" em destaque; dica de propriedade rural; texto da logo.
  - **Verificação:** lint, tipos, 645 testes do domínio, 203 da web, build e pgTAP verdes. Conferido no Brave a 375 px, claro e escuro.
- **12/11/2026**
  - **Claude:**
    - criou este arquivo;
    - copiou o executor PGlite e os scripts de captura para `ferramentas-locais/`;
    - começou a fatia 1 do ADR-0019.
  - **Eduardo:** respondeu P1 a P12 do ADR-0019 com as recomendações; está na seção 11 do ADR.
  - **ChatGPT:** escreveu o ADR-0019.
  - **Claude:**
    - rodou o segundo teste com os 20 donos;
    - ajustou os textos de Custos e taxas;
    - corrigiu cinco pontos no celular.
  - **Claude:** commit `1afce02` com as fatias 2 a 6 do ADR-0018.

## 13/11/2026 — Primeiros passos: especificação e início da implementação (em andamento)

- Eduardo pediu ao Codex a especificação e também a implementação; preservar as alterações locais anteriores de Claude.
- Criada `docs/adr/0020-primeiros-passos-do-orcamento.md` com proposta de fluxo, persistência parcial, concorrência, RLS e testes. As perguntas listadas ainda são propostas, não decisões atribuídas ao Eduardo.
- Iniciada a camada de domínio em `packages/domain/src/primeiros-passos-orcamento.ts`, exportada em `index.ts`, com testes em `primeiros-passos-orcamento.test.ts`: convite não bloqueante, retomada, seis etapas e distinção entre dado ausente e zero.
- Verificados: Vitest filtrado (12 testes aprovados em 3 arquivos), typecheck do pacote domain e Prettier dos arquivos próprios. A primeira verificação de Prettier sinalizou `index.ts`; corrigida e verificada novamente.
- **Pendente:** interface, persistência no banco, RPCs, promoção transacional, proteção contra conflitos/tenant, pgTAP, dados da proposta, demo, testes completos, validação visual e implementação dos demais passos. A funcionalidade não está pronta e não foi publicada. Não há migration criada nesta etapa.
- Incremento local: migration `20261113140336_rascunho_primeiros_passos_orcamento.sql` cria rascunho e preferência individual com RLS/gestão, gravação por etapa com `row_version`, idempotência da última operação e auditoria que omite valores financeiros. A RPC de promoção valida os campos necessários, verifica a versão da base e desfaz a transação se as horas calculadas diferirem das informadas. `node ferramentas-locais/pg/rodar.mjs . 290`: 20 testes aprovados, incluindo dados incompletos e conflito de versão. A suíte completa de banco passou antes dos dois últimos testes, que passaram isoladamente; typecheck do monorepo e 657 testes do domínio passaram. Há adaptadores de API ainda sem tela. Para base nova, visita e custo por quilômetro exigem valores explícitos. Não aplicar em banco remoto: faltam a interface, integração da proposta, preservação de todos os dados ao reabrir uma base existente, experiência das horas derivadas e testes de concorrência real e visuais.

- **Continuação (13/11/2026, Claude):** este trabalho do Codex foi revisado e continuado. O estado atual está na seção 4b, no registro da seção 8 e no ADR-0020 §8; os pontos pendentes acima foram resolvidos ou estão listados lá.
