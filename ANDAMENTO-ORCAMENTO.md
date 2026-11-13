# Andamento do módulo de orçamentos

**Leia isto primeiro, depois `PASSAGEM-CHATGPT.md`.** Este arquivo diz o que já foi feito, o que está pela metade e o que falta. O Claude atualiza a cada passo; quem assumir continua atualizando do mesmo jeito.

- **Última atualização:** 12/11/2026, pelo Claude, ao terminar a fatia 1 do ADR-0019.
- **Pasta:** `C:\Users\eduka\Documents\Codex\2026-11-06\https-github-com-gestao-ambiental-gestao\work\Gestao-ambiental-orcamentos`.
- **Branch:** `local/orcamentos-fluent`, só local. Sem push e sem PR. Commit só quando o Eduardo pedir.

## 1. Onde estamos

| Etapa | Situação |
|---|---|
| ADR-0018, fatias 2 a 6 (unidades, remuneração, faixas e mínimo, modelos e duplicar, situação e proposta) | **Feito e commitado** em `1afce02` |
| Correções de celular depois da revisão a 375 px | Feito e commitado (commit "feat: textos e leitura do orçamento", logo depois de `1afce02`) |
| Textos do segundo teste com os 20 donos | Feito e commitado (mesmo commit) |
| ADR-0019 (usabilidade), escrito pelo ChatGPT, com as respostas do Eduardo na seção 11 | Feito e commitado (mesmo commit) |
| ADR-0019, fatia 1: textos e leitura | Feito e commitado (mesmo commit; seção 3) |
| ADR-0019, fatias 2 a 6 | A fazer: a próxima é a **fatia 2** (seção 4) |

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

## 5. Ferramentas locais (fora do git)

A pasta `ferramentas-locais/` está no `.git/info/exclude`.

- **Testes do banco sem Docker (PGlite + pgTAP):**
  - todos: `node ferramentas-locais/pg/rodar.mjs .`
  - um teste: `node ferramentas-locais/pg/rodar.mjs . 280`

  Ele aplica todas as migrations num Postgres em memória e roda `supabase/tests`. Não substitui o job `banco` do CI no Supabase de verdade, que **ainda não rodou** para as fatias 2 a 6.
- **Consultar o esquema:** `node ferramentas-locais/pg/esquema.mjs . "select ..."`
- **Capturas de tela no Brave** (sem janela, 375×812, claro e escuro):
  - com a demo rodando (seção 6), `node ferramentas-locais/telas/capturar.mjs` (ou `capturar2.mjs`, `capturar3.mjs`);
  - as imagens vão para `ferramentas-locais/telas/capturas/`.

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
