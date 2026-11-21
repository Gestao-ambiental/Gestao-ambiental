# ADR-0054: Painel do dono (P8)

- Situação: proposta (camada `camada/painel-do-dono`)
- Data: 21/11/2026
- Relaciona: ADR-0027 (resumo do mês), ADR-0041 (base das oito funções), ADR-0053 (dinheiro do trabalho)

## Contexto

O "Painel" (antigo Resumo do mês) mostra o mês fechado. O dono pediu, no estudo das 8 funções, ver de uma vez o que está em risco agora, quem está carregado e o dinheiro por cliente.

## Decisão

- O Painel mantém a faixa de placar do mês e ganha três quadros, que são "agora", não mês fechado:
  - **Clientes em risco**: por cliente (o empreendimento sem cliente vira a própria linha), com condicionante ou exigência atrasada, LAO perto (até 30 dias) ou além do limite de protocolo sem protocolo, vencimento vencido e a receber vencido. Ordem por gravidade e depois pelo valor aprovado. A gravidade é a soma dos pesos dos critérios presentes (LAO além do limite 5, atraso 4, vencimento vencido 3, LAO perto do limite 2, a receber vencido 1), em `packages/domain/src/painel-do-dono.ts`. Os motivos aparecem em palavras.
  - **Carga das próximas 2 semanas por pessoa**: prazos com responsável nos próximos 14 dias, atrasados e as horas das tarefas de serviço com prazo no período; quem tem atraso vem primeiro. Inclui a linha "Sem responsável" quando há.
  - **Dinheiro por cliente**: aprovado, recebido, a receber e vencido, das parcelas do P7. Só para quem tem a permissão financeira; sem ela, o quadro não aparece.
- RPCs só de leitura e só da Gestão: `painel_clientes_em_risco`, `painel_carga`, `painel_dinheiro_por_cliente` (esta pede a permissão financeira). Sem tabela nova; leem as fontes de `private.linhas_de_prazo`, que os pacotes só acrescentam.
- A camada sai do P7 (`camada/dinheiro-do-trabalho`), porque o dinheiro por cliente e o a receber vencido usam `private.dinheiro_dos_orcamentos`.

## Consequências

- Migration `20261121180000_painel_do_dono.sql` e pgTAP 740.
- Os pesos da gravidade são uma escolha do Grama (pergunta 10 do estudo): mudar é só no domínio.
