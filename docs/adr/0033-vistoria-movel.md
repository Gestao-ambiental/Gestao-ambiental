# ADR-0033 — Vistoria móvel (Campo), primeiro incremento

**Situação:** aceita em 14/11/2026 como **protótipo** (o Kadu revisa). Card: [Vistoria móvel: escopo funcional CAMPO e telas do protótipo](https://app.clickup.com/t/86e3q96x1). Requisito: CAMPO-01 (registros de campo ligados a uma ocorrência; ocorrência concluída não aceita registro novo). Página de referência: "CAMPO — vistoria móvel: cobertura e requisitos" (doc 02, v0.1).

- Migration `20261115030000_vistoria_movel.sql`; teste `supabase/tests/520_vistoria_movel.test.sql`.
- Domínio `packages/domain/src/vistoria.ts`.
- Telas em `apps/web/src/app/paginas/campo/`; seção "Vistorias" na tela da ocorrência.

## 1. Contexto

O protótipo de 14/10/2026 tem seis telas no celular: Minhas vistorias, Detalhe da visita, Checklist, Foto e localização, Revisar evidência e Conferir envio. Câmera, GPS e gravação eram simulados. A página de requisitos deixou oito decisões em aberto (§11). O Eduardo pediu para começar o app de vistorias no celular. Como combinado, as decisões abaixo são as recomendações do Claude, para o Eduardo confirmar (§7).

## 2. Decisões desta fatia (recomendação do Claude)

1. **Primeiro caso:** vistoria de condicionante. Toda vistoria nasce de uma **ocorrência** (CAMPO-01). Inspeção geral sem ocorrência fica para depois.
2. **Biologia e medições técnicas:** fora. Sem campos estruturados (parâmetro, unidade, método, táxon) nesta fatia.
3. **Checklist:** digitado ao agendar a vistoria, com quatro itens sugeridos (os do protótipo). O texto fica gravado na própria vistoria. Modelos de checklist versionados por consultoria ficam para depois.
4. **Sem modo offline.** Cada registro grava no servidor na hora. A tela mostra "Salvando", "Salvo" ou "Não salvou" e nunca diz que salvou o que não chegou ao banco. Uma foto que falhou fica na tela para tentar de novo, mas não é guardada no aparelho.
5. **Quem agenda:** qualquer membro ativo, como nas etapas. **Quem registra e envia:** o responsável da vistoria ou a Gestão.
6. **Localização:** visível para os membros da consultoria. Ainda não existe exportação nem acesso do cliente.
7. **Um responsável por vistoria.** Dividir os itens entre várias pessoas fica para depois.
8. **Revisão obrigatória**, com a regra da conferência de evidência:
   - confere o conferente designado da ocorrência; sem ele, a Gestão;
   - com a política de independência ativa, quem registrou a vistoria não confere.

## 3. Dados

Todas as tabelas têm `consultoria_id`, RLS habilitada e forçada, leitura para membro ativo (`private.is_membro`), nenhuma escrita direta (só RPC), FK composta `(consultoria_id, …)` e trigger `private.auditar()`.

### `vistoria`

| Coluna                      | Tipo                       | Regra                                                                        |
| --------------------------- | -------------------------- | ---------------------------------------------------------------------------- |
| `id`                        | uuid                       | vem da tela (idempotência)                                                   |
| `ocorrencia_id`             | uuid                       | FK composta para `ocorrencia`                                                |
| `titulo`                    | text                       | 1–120 caracteres                                                             |
| `objetivo`                  | text nulo                  | até 1.000                                                                    |
| `responsavel_id`            | uuid                       | FK composta para `membro`, obrigatório                                       |
| `data_planejada`            | date                       | obrigatória                                                                  |
| `hora_planejada`            | time nula                  |                                                                              |
| `duracao_minutos`           | integer nulo               | 5–1.440                                                                      |
| `situacao`                  | `public.situacao_vistoria` | `planejada`, `em_andamento`, `enviada`, `devolvida`, `aprovada`, `cancelada` |
| `observacao`                | text nulo                  | observação geral, até 2.000                                                  |
| `iniciada_em`, `enviada_em` | timestamptz nulo           |                                                                              |
| `criada_por`                | uuid                       | membro                                                                       |
| `criada_em`                 | timestamptz                |                                                                              |
| `row_version`               | integer                    | controle otimista                                                            |

### `vistoria_item`

| Coluna           | Tipo                             | Regra                                                                                |
| ---------------- | -------------------------------- | ------------------------------------------------------------------------------------ |
| `id`             | uuid                             |                                                                                      |
| `vistoria_id`    | uuid                             | FK composta                                                                          |
| `posicao`        | integer                          | ≥ 1, única por vistoria                                                              |
| `titulo`         | text                             | 1–120                                                                                |
| `descricao`      | text nulo                        | até 300                                                                              |
| `resultado`      | `public.resultado_item_vistoria` | `pendente` (padrão), `conforme`, `nao_conforme`, `nao_aplicavel`, `requer_avaliacao` |
| `comentario`     | text nulo                        | até 1.000                                                                            |
| `registrado_por` | uuid nulo                        | membro                                                                               |
| `registrado_em`  | timestamptz nulo                 |                                                                                      |

`nao_conforme` e `requer_avaliacao` exigem comentário.

### `vistoria_foto`

Imutável; a exclusão é lógica.

| Coluna                                             | Tipo               | Regra                                                                                                                          |
| -------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `id`                                               | uuid               | vem da tela                                                                                                                    |
| `vistoria_id`, `item_id`                           | uuid               | FK composta; o item é da mesma vistoria                                                                                        |
| `caminho`                                          | text               | único, `consultoria_id/vistoria/<uuid>.(jpg\|png)`                                                                             |
| `nome_original`, `mime`, `tamanho_bytes`, `sha256` |                    | mime e tamanho lidos de `storage.objects`; só `image/jpeg` ou `image/png`, até 25 MB                                           |
| `legenda`                                          | text nula          | até 200                                                                                                                        |
| `capturada_em`                                     | timestamptz        | hora do aparelho; não pode passar de agora + 5 min                                                                             |
| `latitude`, `longitude`                            | numeric(9,6) nulas | −90..90 e −180..180, as duas ou nenhuma                                                                                        |
| `precisao_m`                                       | numeric(8,1) nula  | ≥ 0; só com coordenada                                                                                                         |
| `local_origem`                                     | text               | `aparelho`, `manual` ou `nenhum`: `aparelho` exige coordenada, `manual` exige `local_manual`, `nenhum` não tem nenhum dos dois |
| `local_manual`                                     | text nulo          | até 200                                                                                                                        |
| `autor_id`                                         | uuid               |                                                                                                                                |
| `criada_em`                                        | timestamptz        |                                                                                                                                |
| `excluida_em`, `excluida_por`                      | nulos              |                                                                                                                                |

### `vistoria_decisao`

Append-only: cada envio pode ter uma decisão, e um reenvio cria outra linha.

| Coluna          | Tipo                         | Regra                     |
| --------------- | ---------------------------- | ------------------------- |
| `id`            | uuid                         |                           |
| `vistoria_id`   | uuid                         |                           |
| `decisao`       | `public.decisao_conferencia` | `aprovada` ou `devolvida` |
| `motivo`        | text                         | obrigatório ao devolver   |
| `conferente_id` | uuid                         |                           |
| `decidida_em`   | timestamptz                  |                           |

A `ocorrencia_historico` ganha os tipos `vistoria_agendada`, `vistoria_enviada`, `vistoria_aprovada`, `vistoria_devolvida` e `vistoria_cancelada`.

## 4. Funções do banco

Todas são `security definer` com `search_path = ''` e revalidam o vínculo. Erros são legíveis (`sem_permissao`, `ocorrencia_concluida`, `vistoria_fechada`, `comentario_obrigatorio`, `itens_pendentes`, `conflito_de_versao` etc.).

| Função                                                                                                                                                                                     | O que faz                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `criar_vistoria(p_id, p_ocorrencia_id, p_titulo, p_objetivo, p_responsavel_id, p_data, p_hora, p_duracao_minutos, p_itens jsonb)`                                                          | Agenda. `p_itens` = `[{titulo, descricao}]`, de 1 a 50 itens. Recusa ocorrência concluída. Idempotente por `p_id`.                                                                  |
| `iniciar_vistoria(p_id)`                                                                                                                                                                   | `planejada` → `em_andamento`, grava `iniciada_em`. Só o responsável ou a Gestão. Repetir não muda nada.                                                                             |
| `registrar_item_da_vistoria(p_item_id, p_resultado, p_comentario)`                                                                                                                         | Grava o resultado. Vistoria `em_andamento` ou `devolvida`.                                                                                                                          |
| `salvar_observacao_da_vistoria(p_id, p_observacao)`                                                                                                                                        | Grava a observação geral. Mesmas condições.                                                                                                                                         |
| `adicionar_foto_da_vistoria(p_foto_id, p_item_id, p_caminho, p_nome_original, p_sha256, p_legenda, p_capturada_em, p_latitude, p_longitude, p_precisao_m, p_local_origem, p_local_manual)` | O arquivo já está no Storage; a função lê mime e tamanho de `storage.objects`. Idempotente por `p_foto_id`.                                                                         |
| `excluir_foto_da_vistoria(p_foto_id)`                                                                                                                                                      | Exclusão lógica. Mesmas condições.                                                                                                                                                  |
| `enviar_vistoria(p_id, p_row_version)`                                                                                                                                                     | Exige todos os itens fora de `pendente` e os comentários obrigatórios. Passa a `enviada` e registra no histórico. Repetir com a vistoria já enviada não duplica.                    |
| `conferir_vistoria(p_id, p_decisao, p_motivo, p_row_version)`                                                                                                                              | Só com a vistoria `enviada`. Grava em `vistoria_decisao`. `aprovada` → `aprovada`; `devolvida` → `devolvida`, que volta a aceitar registros.                                        |
| `cancelar_vistoria(p_id, p_motivo, p_row_version)`                                                                                                                                         | Só a Gestão, e só antes de aprovada.                                                                                                                                                |
| `listar_vistorias(p_ocorrencia_id, p_somente_minhas, p_limite, p_deslocamento)`                                                                                                            | `security invoker`, com RLS. Devolve a lista com empreendimento, unidade, licença, responsável, total de itens e itens registrados.                                                 |
| `obter_vistoria(p_id)`                                                                                                                                                                     | Contexto completo: ocorrência, empreendimento, unidade com endereço, licença, prazo atual da ocorrência, hoje da consultoria, `pode_registrar`, `pode_conferir` e a última decisão. |

Os itens e as fotos são lidos por select direto, com RLS.

## 5. Telas (celular primeiro; a 1366 px também funciona)

| Rota                            | Tela                                                                                                                          |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `/campo`                        | **Minhas vistorias.** Grupos Atrasadas, Hoje, Próximas e Enviadas, paginados.                                                 |
| `/campo/:id`                    | **Detalhe da visita.** Contexto, preparação, objetivo e "Começar vistoria". Para quem confere, também "Aprovar" e "Devolver". |
| `/campo/:id/checklist`          | **Checklist.** Progresso, resultado por item, comentário, foto por item e observação geral.                                   |
| `/campo/:id/itens/:itemId/foto` | **Foto e localização**, seguida de **Revisar evidência**: legenda, "Refazer" e "Vincular foto".                               |
| `/campo/:id/envio`              | **Conferir envio.** Resumo, pendências e "Enviar para conferência".                                                           |

- **Câmera:** `<input type="file" accept="image/jpeg,image/png" capture="environment">`, que abre a câmera real no celular.
- **Localização:** `navigator.geolocation` com alta precisão, opcional. Se a permissão for negada ou falhar, a tela avisa e oferece "Descrever o local", que vira `manual`.
- **Na tela da ocorrência:** a seção "Vistorias" lista as vistorias e tem "Agendar vistoria" (título, data, hora, duração, responsável, objetivo e itens).
- **Menu:** novo item "Campo".

## 6. Domínio (`vistoria.ts`)

- `exigeComentario(resultado)`;
- `progressoDaVistoria(itens)`, que dá registrados, total e percentual;
- `pendenciasDoEnvio(itens)`;
- `grupoDaVistoria(situacao, dataPlanejada, hoje)`;
- `conferirLocalizacao(…)`;
- `ITENS_SUGERIDOS`.

O banco repete as regras de envio e de comentário.

## 7. Para o Eduardo confirmar

As oito decisões do §2, principalmente:

- **sem offline:** o piloto tem áreas sem sinal?
- **checklist sem modelos:** basta digitar ao agendar?
- **revisão obrigatória**, sempre.

## 8. Fica para depois

- modelos de checklist versionados;
- offline com fila de envio;
- campos estruturados de engenharia e biologia;
- coordenada sensível;
- vários responsáveis;
- inspeção sem ocorrência;
- leitura do EXIF da foto;
- pacote manual (CAMPO-02);
- telas para cancelar a vistoria e excluir foto (as funções do banco já existem).

## 9. Ajustes feitos na implementação

- **Coluna extra `vistoria.enviada_por`:** guarda quem enviou. Também entra na regra de independência.
- **"Quem registrou":** para a independência, conta quem enviou, quem registrou algum item e quem é autor de alguma foto não excluída.
- **Responsável ou Gestão:** a função usa o vínculo real (`private.is_gestao_vinculada`), porque o acesso de suporte (ADR-0025) não registra vistoria.
- **`row_version`:** só muda em iniciar, enviar, conferir e cancelar. Registrar item, observação ou foto não muda a versão, e o envio revalida tudo no banco.
- **Retornos:**
  - iniciar, enviar, conferir e cancelar devolvem a nova versão;
  - criar e adicionar foto devolvem o id.
- **Cancelar** exige motivo, que vai para o histórico da ocorrência.
- **Ocorrência concluída** recusa agendar, iniciar, registrar, fotografar e enviar. Conferir e cancelar continuam possíveis.
- **Vistoria cancelada** não aparece em "Minhas vistorias", só na seção da ocorrência.
- **Na tela:** `manual` com coordenada é recusado, mas o banco aceita.

## Incremento offline no app instalado

O Grama instalado abre a Visão da equipe. Para trabalhar sem sinal, a pessoa abre uma vistoria agendada e seleciona **Preparar para usar sem sinal**. O checklist, as alterações e as fotos ficam no IndexedDB, vinculados à conta, à consultoria e ao vínculo que preparou a vistoria. O acesso sem sinal vale por 24 horas. Com conexão, a pessoa pode retomar os rascunhos do vínculo ativo.

A pessoa revisa e confirma o envio com internet. `sincronizar_vistoria_offline` confere a versão e o estado do checklist antes de gravar os itens, a observação, as referências de fotos e o envio para conferência na mesma transação. Objetos de foto usam a mesma chave em todas as tentativas. Uma mudança no servidor mantém o rascunho local para consulta.

O cache de instalação guarda apenas os recursos estáticos do aplicativo. O cadastro de vistorias, a conferência e os outros módulos consultam o servidor.
