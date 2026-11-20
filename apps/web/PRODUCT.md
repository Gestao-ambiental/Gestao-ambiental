# Product

<!-- impeccable:product-schema 1 -->

> Escrito em 20/11/2026 a partir do `CLAUDE.md` do repositório, das ADRs e das decisões registradas do Eduardo, sem entrevista (a tarefa pediu para seguir sem esperar resposta). Itens marcados _(inferido)_ não foram confirmados por ele.

## Platform

web

## Users

- **Equipe** de consultorias ambientais pequenas (1 a 20 pessoas): engenheiros ambientais, biólogos, técnicos. Gente jovem, a maioria da geração Z _(inferido do pedido do Eduardo: "um negócio muito geração Z")_. No escritório, no notebook (1366×768 é comum); no campo, no celular (375 px), fazendo vistoria com foto e GPS.
- **Gestão** da consultoria (sócios): distribui prazos, confere evidências, faz orçamentos e propostas, acompanha o plano.
- **Operadores do Grama** (Eduardo e Kadu): usam a Central administrativa.
- Piloto: Filtroville, 6 pessoas, Joinville/SC. Beta com a Envora.

## Product Purpose

Transformar licenças ambientais (LAO, LAI, AuA e outras) e suas condicionantes em calendário operacional da equipe, para que nenhum prazo de órgão ambiental passe. Em volta disso: campo (vistorias), resíduos (MTR, CDF, DMR), acompanhamentos e renovações, triagem de licenciamento pela CONSEMA 250/251, orçamentos e propostas, modelos de documento.

Sucesso: a pessoa abre o Grama e sabe em segundos o que vence, de quem é e qual é o próximo passo; ninguém é pego de surpresa por um prazo.

## Positioning

O Grama lê a licença (PDF, com apoio de IA) e transforma cada condicionante em tarefa com prazo, responsável e evidência. A unidade de trabalho é o prazo do órgão, não um "projeto" genérico.

## Operating Context

- Documentos reais: PDFs de licença do IMA e de órgãos municipais, protocolos, MTR/CDF, relatórios em Word.
- Datas civis em `DATE`, fuso da consultoria (America/Sao_Paulo), exibição dd/mm/aaaa.
- Ritual diário: ver o que vence hoje e na semana, mandar evidência, a Gestão conferir.
- Campo: sol, celular com uma mão, sinal fraco.

## Capabilities and Constraints

- React + Vite + Tailwind 4, tokens como variáveis CSS, Supabase com RLS; papéis Gestão e Equipe (o banco decide permissão; a tela só esconde).
- Idioma: português do Brasil em tudo. Sem emoji na interface. Corpo 14 px.
- Desktop 1366×768 e 1920×1080; celular 375×812. Tabelas rolam na própria região.
- Tema claro e escuro.
- Toda tela com estados vazio, carregando, erro e sem permissão. Listas paginadas.
- Sem texto cinza explicativo: só rótulo, valor, estado, erro e o que falta. Reais com ponto de milhar ao digitar.

## Brand Commitments

- Nome exibido: **Grama** (provisório). Logotipo atual: palavra "grama" em blocos geométricos com um quadrado verde-lima (`src/assets/marca`).
- A marca é verde e jovem; o verde-lima é a cor de destaque hoje, e pode ser reinterpretado.
- Tom: direto, "vendemos tempo".
- Rejeitado: as duas reformulações anteriores (UI limpa e Grama Fluent), por parecerem feitas por IA: cartões, selos e cinzas demais, hierarquia fraca.

## Evidence on Hand

- Dados reais só no Supabase do beta (não usar para demonstração). Demonstração local em memória (`demo-local/`, fora do repositório) com dados sintéticos.
- Não há depoimentos, clientes ou números de resultado publicáveis.

## Product Principles

1. O prazo é o protagonista: data, dias que faltam e responsável sempre à vista.
2. Uma tarefa principal por tela, com o menor número de cliques.
3. Simples e visual: número grande, cor com significado, texto curto.
4. Nada escondido atrás de cor: todo estado tem palavra ou forma.
5. O campo é de primeira classe: celular com uma mão, alvos de 44 px.

## Accessibility & Inclusion

WCAG 2.2 AA: teclado em tudo, foco visível, nome acessível em botão de ícone, contraste AA nos dois temas, informação nunca só pela cor, movimento reduzido respeitado.
